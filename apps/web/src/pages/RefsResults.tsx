import {
  countVerdicts,
  exportableRecords,
  exportFile,
  type ExportKind,
  type RefResult,
  type ResultKind,
  type Verdict,
} from '@siyasat/core';
import { ArrowLeft, ArrowRight, BookMarked, Check, ClipboardCopy, FileSpreadsheet, Filter, Hourglass, Play, Search, SearchX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Badge, DistBar, Empty, ScoreRing, Tip, VerdictIcon } from '../components/bits';
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

type FilterBy = 'all' | 'problems' | Verdict;
type Tab = 'refs' | 'bib' | 'export';

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

/** One sentence on what the score means for this list. */
function scoreSummary(results: RefResult[], verified: number): string {
  if (!results.length) return 'Results appear here as each reference is checked.';
  const problems = results.length - verified;
  if (!problems) return 'Every reference was found with the details you wrote.';
  return `${problems} of ${results.length} ${results.length === 1 ? 'reference needs' : 'references need'} a look.`;
}

function ExportTab({ view }: { view: RefsView }) {
  const all = exportableRecords(view).length;
  const screened = exportableRecords(view, true).length;
  const save = (kind: ExportKind) => {
    const file = exportFile(kind, view);
    download(file.name, file.data, file.type);
  };
  return (
    <>
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
      <div className="exports" role="group" aria-label="Download your results">
        {view.isLibrary && (
          <button type="button" className="primary" disabled={!screened} onClick={() => save('screened')}>
            <BookMarked className="ic" aria-hidden="true" />
            <span>
              Screened library (.ris)<small>{screened} kept</small>
            </span>
          </button>
        )}
        <button type="button" className="ghost" onClick={() => save('csv')}>
          <FileSpreadsheet className="ic" aria-hidden="true" />
          <span>
            Spreadsheet (.csv)<small>Every reference and verdict</small>
          </span>
        </button>
        <button type="button" className="ghost" disabled={!all} onClick={() => save('bib')}>
          <BookMarked className="ic" aria-hidden="true" />
          <span>
            BibTeX (.bib)<small>For LaTeX</small>
          </span>
        </button>
        <button type="button" className="ghost" disabled={!all} onClick={() => save('ris')}>
          <BookMarked className="ic" aria-hidden="true" />
          <span>
            RIS (.ris)<small>Zotero, Mendeley</small>
          </span>
        </button>
        <button type="button" className="ghost" disabled={!all} onClick={() => save('enw')}>
          <BookMarked className="ic" aria-hidden="true" />
          <span>
            EndNote (.enw)<small>EndNote</small>
          </span>
        </button>
      </div>
      <div className="actions">
        <ReportButtons id={view.id} name={view.name} refsView={view.kind === 'refResults'} reportClass="ghost" jsonLabel="Data (JSON)" />
      </div>
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

export function RefsResults({ view, header }: { view: RefsView; header: ReactNode }) {
  const running = useJobs((s) => s.job?.id === view.id);
  const [tab, setTab] = useState<Tab>('refs');
  const [filter, setFilter] = useState<FilterBy>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [copied, setCopied] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const apa = useRef<HTMLDivElement>(null);
  const counts = countVerdicts(view.results);
  const dups = useMemo(() => duplicates(view.results), [view.results]);
  useVenueBackfill(view, running);

  const needle = query.trim().toLowerCase();
  const rows = view.results
    .map((r, position) => ({ r, position }))
    .filter(({ r }) => filter === 'all' || (filter === 'problems' ? r.verdict !== 'verified' : r.verdict === filter))
    .filter(({ r }) => !needle || [r.raw, r.match?.title, r.match?.doi].some((text) => text?.toLowerCase().includes(needle)));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const unfinished = !!view.total && view.results.length < view.total && view.status !== 'done';
  const problems = view.results.length - counts.verified;

  const show = (by: FilterBy) => {
    setFilter(by);
    setPage(0);
    setTab('refs');
  };
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
      <button type="button" className="ghost sm" disabled={current === 0} onClick={() => turnTo(current - 1)}>
        <ArrowLeft className="ic" aria-hidden="true" /> Previous
      </button>
      <span className="meta">
        Showing {current * PAGE_SIZE + 1}–{current * PAGE_SIZE + shown.length} of {rows.length.toLocaleString()}
      </span>
      <button type="button" className="ghost sm" disabled={current >= pages - 1} onClick={() => turnTo(current + 1)}>
        Next <ArrowRight className="ic" aria-hidden="true" />
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
        <section className="card running-card">
          <h2>{running ? 'Checking your references…' : 'This check is paused'}</h2>
          <p className="help">
            {view.results.length.toLocaleString()} of {view.total.toLocaleString()} checked so far. Results appear below as they come in, and
            progress is saved{running ? '' : ', so you can continue any time'}.
          </p>
          {!running && (
            <div className="actions">
              <button type="button" className="primary" onClick={() => resumeJob(view.id)}>
                <Play className="ic" aria-hidden="true" /> Resume ({eta(view.total - view.results.length)})
              </button>
              <button type="button" className="link" onClick={() => patchCheck(view.id, { status: 'done', stoppedEarly: true })}>
                Finish with what's checked
              </button>
            </div>
          )}
          <JobProgress id={view.id} />
        </section>
      ) : (
        view.stoppedEarly && (
          <div className="msg info" style={{ margin: '0 0 16px' }}>
            Stopped early: {view.results.length.toLocaleString()} of {view.total.toLocaleString()} references were checked.{' '}
            {view.canResume && (
              <button type="button" className="link" onClick={() => resumeJob(view.id)}>
                Check the rest
              </button>
            )}
          </div>
        )
      )}

      <section className="card" aria-labelledby="sumH">
        <h2 id="sumH" className="sr">
          Summary
        </h2>
        <div className="summary">
          <div className="score">
            <ScoreRing score={view.score} />
            <div className="score-text">
              <b>
                Integrity score{' '}
                <Tip text="100 means every reference was found and matched exactly. Wrong details lower the score; made-up or retracted sources lower it most." />
              </b>
              <p>{scoreSummary(view.results, counts.verified)}</p>
            </div>
          </div>
          <div>
            <DistBar counts={counts} />
            <p className="dist-note">
              {view.results.length
                ? 'Each colour is a verdict. Pick one below to see only those references.'
                : 'The bar fills in as references are checked.'}
            </p>
          </div>
          <div className="vtiles">
              {MAIN_VERDICTS.map((v) => (
                <button
                  type="button"
                  className="vtile"
                  key={v}
                  aria-pressed={filter === v && tab === 'refs'}
                  title={`Show only “${LABEL[v]}”`}
                  onClick={() => show(filter === v ? 'all' : v)}
                >
                  <b>{counts[v]}</b>
                  <span className={`vl ${v}`}>
                    <VerdictIcon verdict={v} />
                    {LABEL[v]}
                  </span>
                </button>
              ))}
          </div>
        </div>
        <details className="explain">
          <summary>What do these labels mean?</summary>
          <ul className="legend">
            {MAIN_VERDICTS.map((v) => (
              <li key={v}>
                <Badge verdict={v} />
                <br />
                {EXPLAIN[v]}
              </li>
            ))}
          </ul>
          <p className="decide">
            Repeated sources are flagged as duplicates. Unlike citation-only checkers, Siyasat also flags retracted papers, screens review
            libraries (RIS/BibTeX), and lets you check each claim against its source. You can change any verdict if you know better.
          </p>
        </details>
      </section>

      <div className="tabs" role="tablist" aria-label="Results">
        <button type="button" role="tab" id="tab-refs" aria-selected={tab === 'refs'} aria-controls="panel" onClick={() => setTab('refs')}>
          Each reference <span className="n">{view.results.length}</span>
        </button>
        <button type="button" role="tab" id="tab-bib" aria-selected={tab === 'bib'} aria-controls="panel" onClick={() => setTab('bib')}>
          Corrected bibliography
        </button>
        <button type="button" role="tab" id="tab-export" aria-selected={tab === 'export'} aria-controls="panel" onClick={() => setTab('export')}>
          Download
        </button>
      </div>

      <div id="panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'refs' && (
          <>
            <div className="toolbar">
              <div className="filters" role="group" aria-label="Show">
                <button type="button" aria-pressed={filter === 'all'} onClick={() => show('all')}>
                  All ({view.results.length})
                </button>
                <button type="button" aria-pressed={filter === 'problems'} onClick={() => show('problems')}>
                  <Filter className="ic" aria-hidden="true" /> Only problems ({problems})
                </button>
                {filter !== 'all' && filter !== 'problems' && (
                  <button type="button" aria-pressed="true" onClick={() => show('all')}>
                    {LABEL[filter]} ({counts[filter]}) ✕
                  </button>
                )}
              </div>
              <label className="searchbox">
                <span className="sr">Search these references</span>
                <Search aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Search these references"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(0);
                  }}
                />
              </label>
            </div>
            <div ref={list}>
              {pager}
              {shown.map(({ r, position }) => {
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
              })}
              {!shown.length &&
                (running && !view.results.length ? (
                  <>
                    <div className="skel skel-row" />
                    <div className="skel skel-row" />
                    <div className="skel skel-row" />
                  </>
                ) : !view.results.length ? (
                  <Empty icon={Hourglass} title="Nothing checked yet">
                    Resume this check to see its results here.
                  </Empty>
                ) : filter === 'problems' && !needle ? (
                  <Empty icon={Check} title="No problems found">
                    Every reference checked so far looks good.
                  </Empty>
                ) : (
                  <Empty icon={SearchX} title="Nothing matches">
                    No reference fits that filter.
                    <div className="actions">
                      <button
                        type="button"
                        className="ghost sm"
                        onClick={() => {
                          setQuery('');
                          show('all');
                        }}
                      >
                        Show all references
                      </button>
                    </div>
                  </Empty>
                ))}
              {pager}
            </div>
          </>
        )}

        {tab === 'bib' && (
          <section className="card">
            <div className="rowh">
              <h2 className="card-h">Corrected bibliography (APA 7)</h2>
              <div className="page-actions">
                <span className="meta" aria-live="polite">
                  {copied ? 'Copied. Paste it into your document.' : ''}
                </span>
                <button type="button" className="primary sm" onClick={() => void copyBibliography()}>
                  {copied ? <Check className="ic" aria-hidden="true" /> : <ClipboardCopy className="ic" aria-hidden="true" />} Copy bibliography
                </button>
              </div>
            </div>
            <p className="help">
              Built from the real records, sorted A–Z. References we couldn't find or that are retracted are left out and listed below.
            </p>
            <Bibliography results={view.results} listRef={apa} />
          </section>
        )}

        {tab === 'export' && (
          <section className="card">
            <h2>Download your results</h2>
            <ExportTab view={view} />
          </section>
        )}
      </div>
    </>
  );
}
