import {
  countVerdicts,
  exportableRecords,
  exportFile,
  type ExportKind,
  type RefResult,
  type ResultKind,
  type Verdict,
} from '@siyasat/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Empty, Tip } from '../components/bits';
import { JobProgress } from '../components/JobProgress';
import { Bibliography, duplicates, RefItem } from '../components/RefItem';
import { ReportButtons } from '../components/ReportButtons';
import { api } from '../lib/api';
import { copyText, download } from '../lib/download';
import { EXPLAIN, LABEL, MAIN_VERDICTS } from '../lib/labels';
import { patchCheck, upsertResults } from '../store/checks';
import { eta, resumeJob, useJobs } from '../store/jobs';
import { toast } from '../store/toast';

const PAGE_SIZE = 50;

/** A list of checked references to show: a reference check, or the reference list of an uploaded draft. */
export interface RefsView {
  id: string;
  name: string;
  score: number;
  results: RefResult[];
  total: number;
  /** Which of the check's result lists this is. */
  kind: ResultKind;
  status: 'running' | 'paused' | 'done';
  stoppedEarly?: boolean;
  canResume: boolean;
  /** Came from a reference-manager export, so the screened library is offered. */
  isLibrary: boolean;
}

const numberOf = (r: RefResult, position: number) => (r.i ?? position) + 1;

/** Change a verdict, keeping Siyasat's own in `auto` so the author can go back to it. */
function setVerdict(view: RefsView, position: number, to: Verdict, note: string): void {
  const r = view.results[position];
  if (!r || r.i == null) return;
  const auto = r.auto || r.verdict;
  const { auto: _a, ovNote: _n, ...rest } = r;
  const next: RefResult = to === auto ? { ...rest, verdict: auto } : { ...rest, verdict: to, auto, ...(note ? { ovNote: note } : {}) };
  upsertResults(view.id, [next], view.kind);
  toast(next.auto ? `Saved your verdict: ${LABEL[to]}` : 'Back to Siyasat’s verdict', {
    label: `verdict on reference ${numberOf(r, position)}`,
    run: () => void upsertResults(view.id, [r], view.kind),
  });
}

function ExportButtons({ view }: { view: RefsView }) {
  const all = exportableRecords(view).length;
  const screened = exportableRecords(view, true).length;
  const save = (kind: ExportKind) => {
    const file = exportFile(kind, view);
    download(file.name, file.data, file.type);
  };
  return (
    <>
      <div className="exports" role="group" aria-label="Download your results">
        <button type="button" className="ghost" onClick={() => save('csv')}>
          ⬇ Spreadsheet (.csv)
        </button>
        <button type="button" className="ghost" disabled={!all} onClick={() => save('bib')}>
          ⬇ BibTeX (.bib)
        </button>
        <button type="button" className="ghost" disabled={!all} onClick={() => save('ris')}>
          ⬇ RIS (Zotero, Mendeley)
        </button>
        <button type="button" className="ghost" disabled={!all} onClick={() => save('enw')}>
          ⬇ EndNote (.enw)
        </button>
        {view.isLibrary && (
          <button type="button" className="primary" disabled={!screened} onClick={() => save('screened')}>
            ⬇ Screened library (.ris) · {screened} kept
          </button>
        )}
      </div>
      <p className="help">
        Reference-manager files include only real sources we matched, with the official details and DOI.
        {view.isLibrary && (
          <>
            {' '}
            The <b>screened library</b> keeps only “Looks good” and “Fix details” records, so made-up, retracted and unchecked items are left
            out of your review.
          </>
        )}
      </p>
    </>
  );
}

/** Older results may lack venue and free-PDF details; fetch them for a few records at a time. */
function useVenueBackfill(view: RefsView, paused: boolean): void {
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (paused || started.current === view.id + view.kind) return;
    const todo = view.results.filter((r) => r.match?.doi && r.match.ven === undefined && r.i != null).slice(0, 25);
    if (!todo.length) return;
    started.current = view.id + view.kind;
    let cancelled = false;
    void (async () => {
      const filled: RefResult[] = [];
      for (const r of todo) {
        if (cancelled) return;
        const ven = await api.enrich(r.match!.doi).then((e) => e.ven, () => null);
        filled.push({ ...r, match: { ...r.match!, ven } });
      }
      if (!cancelled) upsertResults(view.id, filled, view.kind);
    })();
    return () => {
      cancelled = true;
    };
  }, [view.id, view.kind, paused]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function RefsResults({ view, header }: { view: RefsView; header: React.ReactNode }) {
  const running = useJobs((s) => s.job?.id === view.id);
  const [filter, setFilter] = useState<'all' | 'problems'>('all');
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const apa = useRef<HTMLDivElement>(null);
  const counts = countVerdicts(view.results);
  const dups = useMemo(() => duplicates(view.results), [view.results]);
  useVenueBackfill(view, running);

  const rows = view.results.map((r, position) => ({ r, position })).filter(({ r }) => filter === 'all' || r.verdict !== 'verified');
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const unfinished = !!view.total && view.results.length < view.total && view.status !== 'done';

  const turnTo = (n: number) => {
    setPage(n);
    // Wait for the new page of references, then move reading position and focus to its first one.
    requestAnimationFrame(() => {
      list.current?.scrollIntoView({ block: 'start' });
      const first = list.current?.querySelector<HTMLElement>('article');
      if (first) {
        first.tabIndex = -1;
        first.focus({ preventScroll: true });
      }
    });
  };
  const pager = rows.length > PAGE_SIZE && (
    <nav className="pager" aria-label="Pages">
      <button type="button" className="ghost" disabled={current === 0} onClick={() => turnTo(current - 1)}>
        ← Previous
      </button>
      <span className="meta">
        Showing {current * PAGE_SIZE + 1}–{current * PAGE_SIZE + shown.length} of {rows.length.toLocaleString()}
      </span>
      <button type="button" className="ghost" disabled={current >= pages - 1} onClick={() => turnTo(current + 1)}>
        Next →
      </button>
    </nav>
  );

  const copyBibliography = async () => {
    const text = [...(apa.current?.querySelectorAll('p') ?? [])].map((p) => p.innerText).join('\n');
    if (!text) return;
    await copyText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 4000);
  };

  return (
    <>
      {header}
      {running || unfinished ? (
        <section className="card" style={{ borderColor: 'var(--gold-dark)' }}>
          <h2>{running ? 'Checking in batches…' : 'This check is paused'}</h2>
          <p className="help">
            {view.results.length.toLocaleString()} of {view.total.toLocaleString()} references checked so far. Progress is saved as we go
            {running ? '' : ', so you can continue any time'}.
          </p>
          {!running && (
            <div className="actions">
              <button type="button" className="primary" onClick={() => resumeJob(view.id)}>
                ▶ Resume ({eta(view.total - view.results.length)})
              </button>
              <button type="button" className="link danger" onClick={() => patchCheck(view.id, { status: 'done', stoppedEarly: true })}>
                Finish with what's checked
              </button>
            </div>
          )}
          <JobProgress id={view.id} />
        </section>
      ) : (
        view.stoppedEarly && (
          <div className="msg info" style={{ marginBottom: 14 }}>
            Stopped early: {view.results.length.toLocaleString()} of {view.total.toLocaleString()} references were checked.{' '}
            {view.canResume && (
              <button type="button" className="link" onClick={() => resumeJob(view.id)}>
                Check the rest
              </button>
            )}
          </div>
        )
      )}

      <section className="card" aria-labelledby="rh">
        <h2 id="rh" tabIndex={-1}>
          Summary
        </h2>
        <div className="summary">
          <div className="tile score">
            <small>
              Integrity score{' '}
              <Tip text="100 means every reference was found and matched exactly. Wrong details lower the score; made-up or retracted sources lower it most." />
            </small>
            <b>{view.score}/100</b>
            <div className="sbar">
              <i style={{ width: `${view.score}%` }} />
            </div>
          </div>
          {MAIN_VERDICTS.map((v) => (
            <div className="tile" key={v}>
              <Badge verdict={v} />
              <b>{counts[v]}</b>
            </div>
          ))}
        </div>
        <ul className="legend" aria-label="What the labels mean">
          {MAIN_VERDICTS.map((v) => (
            <li key={v}>
              <Badge verdict={v} />
              <br />
              {EXPLAIN[v]}
            </li>
          ))}
        </ul>
        <p className="decide">
          <b>How Siyasat decides:</b> {LABEL.verified} = Verified · {LABEL.correction} = Minor error · {LABEL.not_found} = Not found in any
          database (likely made up) · {LABEL.retracted} = Retracted. Repeated sources are flagged ⧉ Duplicate. Unlike citation-only checkers,
          Siyasat also flags retracted papers, screens review libraries (RIS/BibTeX), and lets you check each claim against its source. You can
          change any verdict if you know better.
        </p>
      </section>

      <section className="card">
        <h2>Each reference</h2>
        <div className="filters" role="group" aria-label="Show">
          <button type="button" aria-pressed={filter === 'all'} onClick={() => (setFilter('all'), setPage(0))}>
            All ({view.results.length})
          </button>
          <button type="button" aria-pressed={filter === 'problems'} onClick={() => (setFilter('problems'), setPage(0))}>
            Only problems ({view.results.length - counts.verified})
          </button>
        </div>
        <div ref={list}>
          {pager}
          {shown.length ? (
            shown.map(({ r, position }) => {
              const first = dups.get(position);
              return (
                <RefItem
                  key={r.i ?? position}
                  r={r}
                  number={numberOf(r, position)}
                  duplicateOf={first === undefined ? undefined : numberOf(view.results[first]!, first)}
                  onOverride={(to, note) => setVerdict(view, position, to, note)}
                />
              );
            })
          ) : (
            <Empty icon="🎉">No problems found.</Empty>
          )}
          {pager}
        </div>
      </section>

      <section className="card">
        <h2>Corrected bibliography (APA 7)</h2>
        <p className="help">
          Built from the real records, sorted A–Z. References we couldn't find or that are retracted are left out and listed below.
        </p>
        <Bibliography results={view.results} listRef={apa} />
        <div className="actions">
          <button type="button" className="primary" onClick={() => void copyBibliography()}>
            Copy bibliography
          </button>
          <ReportButtons id={view.id} name={view.name} refsView={view.kind === 'refResults'} jsonLabel="Download data (JSON)" />
          <span className="count" aria-live="polite">
            {copied ? '✓ Copied! Paste it into your document.' : ''}
          </span>
        </div>
      </section>

      <section className="card">
        <h2>Download for your reference manager</h2>
        <ExportButtons view={view} />
      </section>
    </>
  );
}
