import { emptyCounts, isUnfinished, type CheckSummary } from '@siyasat/core';
import { Link } from 'react-router';
import { Empty, Tip } from '../components/bits';
import { TypeCards } from '../components/TypeCards';
import { UploadZone } from '../components/UploadZone';
import { draftProgress } from '../lib/draftView';
import { fmtDate, LABEL, MAIN_VERDICTS } from '../lib/labels';
import { paths } from '../lib/nav';
import { deleteChecks, restoreChecks, useChecks } from '../store/checks';
import { resumeJob, useJobs } from '../store/jobs';
import { toast } from '../store/toast';

async function removeChecks(ids: string[] | 'all', message: string, label: string): Promise<void> {
  const gone = await deleteChecks(ids);
  if (gone.length) toast(message, { label, run: () => void restoreChecks(gone) });
}

function RecentCheck({ c }: { c: CheckSummary }) {
  const running = useJobs((s) => s.job?.id === c.id);
  const progress = c.draft && draftProgress(c.draft);
  const remove = () => {
    if (running) {
      alert('This check is still running. Pause it first.');
      return;
    }
    if (confirm(`Delete "${c.name}"? You can undo this right after.`)) {
      void removeChecks([c.id], `Deleted check “${c.name}”`, `deleted check “${c.name}”`);
    }
  };
  return (
    <li>
      <div className="t">
        <b>{c.name}</b>
        <small>
          {fmtDate(c.date)} ·{' '}
          {c.draft
            ? `Draft check · ${c.draft.claims} claims · ${c.draft.sources} sources`
            : `${(c.total || c.resultCount).toLocaleString()} references${c.type === 'corpus' ? ' · corpus' : ''}`}
        </small>
      </div>
      <div className="mini">
        {MAIN_VERDICTS.filter((v) => c.counts[v]).map((v) => (
          <span className={`badge ${v}`} title={LABEL[v]} key={v}>
            {LABEL[v].split(' ')[0]} {c.counts[v]}
          </span>
        ))}
      </div>
      {isUnfinished(c) && (
        <>
          <span className="status-chip">
            {running ? 'Checking' : 'Paused'} · {c.resultCount} of {c.total}
          </span>
          {!running && (
            <button type="button" className="ghost" onClick={() => resumeJob(c.id)}>
              ▶ Resume
            </button>
          )}
        </>
      )}
      {progress && <span className={`pill ${progress.cls}`}>{progress.t}</span>}
      <span className="score-chip" title="Integrity score">
        {c.score}/100
      </span>
      <Link className="btn ghost" to={paths.results(c.id)}>
        Open<span className="sr"> {c.name}</span>
      </Link>
      <button type="button" className="link danger" onClick={remove}>
        Delete<span className="sr"> {c.name}</span>
      </button>
    </li>
  );
}

export function Dashboard() {
  const checks = useChecks((s) => s.summaries);

  if (!checks.length) {
    return (
      <>
        <h1 className="page-h">Welcome to Siyasat</h1>
        <p className="lead">A friendly checker for the sources in your paper.</p>
        <UploadZone />
        <section className="card welcome">
          <h2>Is every source in your paper real?</h2>
          <p>
            AI tools sometimes make up references or get the details wrong. Siyasat checks each one against real scholarly databases in
            seconds, for free.
          </p>
          <ol className="how">
            <li>
              <b>Paste your references</b>Copy your reference list from your paper. Any citation style works.
            </li>
            <li>
              <b>Let Siyasat check them</b>Each one is looked up in Crossref and OpenAlex, including retraction notices.
            </li>
            <li>
              <b>Fix and copy</b>See what's wrong, then copy a corrected APA 7 list.
            </li>
          </ol>
          <Link className="btn primary" to={paths.newCheck()}>
            Start your first check →
          </Link>
        </section>
        <section className="card">
          <h2>Your dashboard</h2>
          <Empty icon="📋">No checks yet. Your numbers and recent checks will show up here after your first check.</Empty>
        </section>
      </>
    );
  }

  const totals = emptyCounts();
  for (const c of checks) for (const v of Object.keys(totals) as (keyof typeof totals)[]) totals[v] += c.counts[v] || 0;
  const average = Math.round(checks.reduce((sum, c) => sum + c.score, 0) / checks.length);
  const clearAll = () => {
    if (useJobs.getState().job) {
      alert('A check is still running. Pause it first.');
      return;
    }
    if (confirm('Delete all your saved checks? You can undo this right after.')) {
      void removeChecks('all', 'Deleted all saved checks', `deleted all ${checks.length} saved checks`);
    }
  };

  return (
    <>
      <div className="rowh">
        <div>
          <h1 className="page-h">Dashboard</h1>
          <p className="lead">Your checks at a glance.</p>
        </div>
        <Link className="btn primary" to={paths.newCheck()}>
          + New check
        </Link>
      </div>
      <UploadZone compact />
      <div className="stats" role="list">
        <div className="stat" role="listitem">
          <b>{checks.length}</b>
          <span>
            Checks run <Tip text="How many checks you have run." />
          </span>
        </div>
        <div className="stat" role="listitem">
          <b>{totals.verified + totals.correction}</b>
          <span>
            Sources confirmed real <Tip text="References found in the databases (including ones that only needed small fixes)." />
          </span>
        </div>
        <div className="stat" role="listitem">
          <b>{totals.not_found}</b>
          <span>
            AI-hallucinations <Tip text="References we couldn't find anywhere. These may have been made up by AI." />
          </span>
        </div>
        <div className="stat" role="listitem">
          <b>{totals.retracted}</b>
          <span>
            Retracted <Tip text="Papers that were officially withdrawn by their journal." />
          </span>
        </div>
        <div className="stat hl" role="listitem">
          <b>{average}/100</b>
          <span>
            Average integrity score <Tip text="100 means every reference was found with correct details. Lower means more problems." />
          </span>
        </div>
      </div>
      <section className="card">
        <h2>Start a new check</h2>
        <p className="help">Pick what you want to verify.</p>
        <TypeCards />
      </section>
      <section className="card">
        <div className="rowh">
          <h2>Recent checks</h2>
          <button type="button" className="link danger" onClick={clearAll}>
            Clear all data
          </button>
        </div>
        <ul className="recent">
          {checks.slice(0, 8).map((c) => (
            <RecentCheck c={c} key={c.id} />
          ))}
        </ul>
      </section>
    </>
  );
}
