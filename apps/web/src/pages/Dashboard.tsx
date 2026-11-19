import { emptyCounts, isUnfinished, type CheckSummary } from '@siyasat/core';
import { ArrowRight, Check, CircleX, FileCheck2, Gauge, Play, Plus, ScanSearch, ShieldCheck, TextSearch, Trash2, TriangleAlert, WandSparkles } from 'lucide-react';
import { Link } from 'react-router';
import { Badge, PageHead, Tip } from '../components/bits';
import { Composer } from '../components/Composer';
import { TYPE_ICON, TypeCards } from '../components/TypeCards';
import { draftProgress } from '../lib/draftView';
import { fmtDate, LABEL, MAIN_VERDICTS } from '../lib/labels';
import { paths } from '../lib/nav';
import { deleteChecks, restoreChecks, useChecks } from '../store/checks';
import { confirmDialog, notice } from '../store/dialog';
import { resumeJob, useJobs } from '../store/jobs';
import { toast } from '../store/toast';

async function removeChecks(ids: string[] | 'all', message: string, label: string): Promise<void> {
  const gone = await deleteChecks(ids);
  if (gone.length) toast(message, { label, run: () => void restoreChecks(gone) });
}

function RecentCheck({ c }: { c: CheckSummary }) {
  const running = useJobs((s) => s.job?.id === c.id);
  const progress = c.draft && draftProgress(c.draft);
  const Icon = TYPE_ICON[c.type];
  const remove = () => {
    if (running) {
      void notice('This check is still running', 'Pause it first, then delete it.');
      return;
    }
    // No question asked: the toast that follows offers to undo.
    void removeChecks([c.id], `Deleted “${c.name}”`, `deleted check “${c.name}”`);
  };
  return (
    <li>
      <span className="ri" aria-hidden="true">
        <Icon />
      </span>
      <div className="t">
        <b>
          <Link to={paths.results(c.id)}>{c.name}</Link>
        </b>
        <small>
          {fmtDate(c.date)} ·{' '}
          {c.draft
            ? `Draft check · ${c.draft.claims} claims · ${c.draft.sources} sources`
            : `${(c.total || c.resultCount).toLocaleString()} references${c.type === 'corpus' ? ' · corpus' : ''}`}
        </small>
      </div>
      <div className="mini">
        {MAIN_VERDICTS.filter((v) => c.counts[v]).map((v) => (
          <Badge verdict={v} title={LABEL[v]} key={v}>
            {c.counts[v]}
            <span className="sr"> {LABEL[v]}</span>
          </Badge>
        ))}
      </div>
      {isUnfinished(c) && (
        <>
          <span className="status-chip">
            {running ? 'Checking' : 'Paused'} · {c.resultCount} of {c.total}
          </span>
          {!running && (
            <button type="button" className="ghost sm" onClick={() => resumeJob(c.id)}>
              <Play className="ic" aria-hidden="true" /> Resume
            </button>
          )}
        </>
      )}
      {progress && <span className={`pill ${progress.cls}`}>{progress.t}</span>}
      <span className="score-chip" title="Integrity score">
        {c.score}/100
      </span>
      <Link className="btn ghost sm" to={paths.results(c.id)}>
        Open<span className="sr"> {c.name}</span>
      </Link>
      <button type="button" className="icon-btn" onClick={remove} aria-label={`Delete ${c.name}`} title="Delete">
        <Trash2 className="ic" aria-hidden="true" />
      </button>
    </li>
  );
}

function Welcome() {
  return (
    <>
      <section className="hero">
        <div className="eyebrow">
          <ShieldCheck className="ic" aria-hidden="true" /> Citation checker
        </div>
        <h1>
          Is every source in your paper <em>real</em>?
        </h1>
        <p>
          AI tools sometimes invent references or get the details wrong. Siyasat looks each one up in scholarly databases, flags retracted
          papers, and hands you a corrected list in APA, MLA, Chicago, Harvard, IEEE or Vancouver style.
        </p>
        <ul className="hero-points">
          <li>
            <Check className="ic" aria-hidden="true" /> Free, no account needed
          </li>
          <li>
            <Check className="ic" aria-hidden="true" /> Reads and writes any common citation style
          </li>
          <li>
            <Check className="ic" aria-hidden="true" /> Checked against Crossref and OpenAlex
          </li>
        </ul>
      </section>
      <Composer />
      <div className="features">
        <div className="feature">
          <span className="fi" aria-hidden="true">
            <ScanSearch />
          </span>
          <b>Catches made-up sources</b>
          <p>A reference no database has heard of is the classic sign of an AI hallucination.</p>
        </div>
        <div className="feature">
          <span className="fi" aria-hidden="true">
            <WandSparkles />
          </span>
          <b>Fixes the details</b>
          <p>Wrong year, author, volume or DOI? See the official record side by side with what you wrote.</p>
        </div>
        <div className="feature">
          <span className="fi" aria-hidden="true">
            <TriangleAlert />
          </span>
          <b>Flags retractions</b>
          <p>Papers their journal has withdrawn are marked, so they don't end up as evidence.</p>
        </div>
        <div className="feature">
          <span className="fi" aria-hidden="true">
            <TextSearch />
          </span>
          <b>Checks claims too</b>
          <p>Put each cited sentence next to its source's abstract and judge whether it holds up.</p>
        </div>
      </div>
      <section className="card">
        <div className="rowh">
          <h2 className="card-h">How it works</h2>
          <Link className="btn ghost sm" to={paths.how}>
            The method in full <ArrowRight className="ic" aria-hidden="true" />
          </Link>
        </div>
        <ol className="how">
          <li>
            <b>Add your sources</b>Paste your reference list, or upload your paper as a PDF or Word file.
          </li>
          <li>
            <b>Siyasat checks each one</b>Every reference is looked up, matched, and checked for retraction.
          </li>
          <li>
            <b>Fix and copy</b>See what's wrong, then copy the corrected bibliography or download a report.
          </li>
        </ol>
      </section>
    </>
  );
}

export function Dashboard() {
  const checks = useChecks((s) => s.summaries);
  if (!checks.length) return <Welcome />;

  const totals = emptyCounts();
  for (const c of checks) for (const v of Object.keys(totals) as (keyof typeof totals)[]) totals[v] += c.counts[v] || 0;
  const average = Math.round(checks.reduce((sum, c) => sum + c.score, 0) / checks.length);
  const clearAll = async () => {
    if (useJobs.getState().job) {
      void notice('A check is still running', 'Pause it first, then clear your data.');
      return;
    }
    const sure = await confirmDialog({
      title: 'Delete all your saved checks?',
      body: `${checks.length === 1 ? 'This removes your saved check.' : `This removes all ${checks.length} checks.`} You can undo it right after.`,
      confirmLabel: 'Delete all',
      danger: true,
    });
    if (sure) void removeChecks('all', 'Deleted all saved checks', `deleted all ${checks.length} saved checks`);
  };

  return (
    <>
      <PageHead title="Dashboard" lead="Check a new list, or pick up where you left off.">
        <Link className="btn primary" to={paths.newCheck()}>
          <Plus className="ic" aria-hidden="true" /> New check
        </Link>
      </PageHead>
      <Composer />
      <div className="stats" role="list">
        <div className="stat" role="listitem">
          <span className="si" aria-hidden="true">
            <FileCheck2 />
          </span>
          <b>{checks.length}</b>
          <span>
            Checks run <Tip text="How many checks you have run." />
          </span>
        </div>
        <div className="stat ok" role="listitem">
          <span className="si" aria-hidden="true">
            <Check />
          </span>
          <b>{totals.verified + totals.correction}</b>
          <span>
            Sources confirmed real <Tip text="References found in the databases (including ones that only needed small fixes)." />
          </span>
        </div>
        <div className="stat bad" role="listitem">
          <span className="si" aria-hidden="true">
            <CircleX />
          </span>
          <b>{totals.not_found}</b>
          <span>
            AI-hallucinations <Tip text="References we couldn't find anywhere. These may have been made up by AI." />
          </span>
        </div>
        <div className="stat ret" role="listitem">
          <span className="si" aria-hidden="true">
            <TriangleAlert />
          </span>
          <b>{totals.retracted}</b>
          <span>
            Retracted <Tip text="Papers that were officially withdrawn by their journal." />
          </span>
        </div>
        <div className="stat hl" role="listitem">
          <span className="si" aria-hidden="true">
            <Gauge />
          </span>
          <b>{average}/100</b>
          <span>
            Average integrity score <Tip text="100 means every reference was found with correct details. Lower means more problems." />
          </span>
        </div>
      </div>
      <section className="card">
        <div className="rowh">
          <h2 className="card-h">Recent checks</h2>
          <div className="page-actions">
            {checks.length > 8 && (
              <Link className="link" to={paths.reports}>
                See all {checks.length}
              </Link>
            )}
            <button type="button" className="link danger" onClick={() => void clearAll()}>
              Clear all data
            </button>
          </div>
        </div>
        <ul className="recent">
          {checks.slice(0, 8).map((c) => (
            <RecentCheck c={c} key={c.id} />
          ))}
        </ul>
      </section>
      <section className="card">
        <h2>Start a different kind of check</h2>
        <p className="help">Pick what you want to verify.</p>
        <TypeCards />
      </section>
    </>
  );
}
