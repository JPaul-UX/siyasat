import type { Check } from '@siyasat/core';
import { ArrowLeft, Plus, SearchX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Empty, PageHead, Spinner } from '../components/bits';
import { fmtDate } from '../lib/labels';
import { paths, typeName } from '../lib/nav';
import { loadCheck, useChecks } from '../store/checks';
import { DraftResults } from './DraftResults';
import { RefsResults, type RefsView } from './RefsResults';

/** The check with this id, fetched when it is not already in memory. */
function useCheck(id: string | undefined): { check: Check | null; state: 'loading' | 'ready' | 'missing' | 'error' } {
  const doc = useChecks((s) => (id ? s.docs[id] : undefined));
  const listed = useChecks((s) => !!id && s.summaries.some((x) => x.id === id));
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    if (!id || !listed || doc) return;
    let current = true;
    loadCheck(id).catch(() => current && setFailed(id));
    return () => {
      current = false;
    };
  }, [id, listed, doc]);
  if (!id || !listed) return { check: null, state: 'missing' };
  if (doc) return { check: doc, state: 'ready' };
  return { check: null, state: failed === id ? 'error' : 'loading' };
}

/** Jump to another saved check. */
export function CheckPicker({ current }: { current: string }) {
  const checks = useChecks((s) => s.summaries);
  const navigate = useNavigate();
  if (checks.length < 2) return null;
  return (
    <label className="meta">
      <span className="sr">Open another check</span>
      <select value={current} onChange={(e) => navigate(paths.results(e.target.value))}>
        {checks.map((c) => (
          <option value={c.id} key={c.id}>
            {c.name} ({fmtDate(c.date)})
          </option>
        ))}
      </select>
    </label>
  );
}

function toRefsView(c: Check, refsOfDraft: boolean): RefsView | null {
  if (c.type === 'draft') {
    if (!refsOfDraft || !c.refResults) return null;
    return {
      id: c.id,
      name: c.name,
      score: c.refScore ?? 0,
      results: c.refResults,
      total: c.refResults.length,
      kind: 'refResults',
      status: 'done',
      canResume: false,
      isLibrary: /\.(ris|bib|csv)$/i.test(c.file || ''),
    };
  }
  return {
    id: c.id,
    name: c.name,
    score: c.score,
    results: c.results,
    total: c.total,
    kind: 'results',
    status: c.status,
    stoppedEarly: c.stoppedEarly,
    canResume: !!c.inputs,
    isLibrary: c.type === 'corpus' || /\.(ris|bib|csv)$/i.test(c.file || ''),
  };
}

/** Results of one check. Without an id in the address, the most recent check is shown. */
export function Results() {
  const params = useParams();
  const latest = useChecks((s) => s.summaries[0]?.id);
  const id = params.id ?? latest;
  const { check, state } = useCheck(id);

  if (state === 'loading') {
    return (
      <div className="boot" role="status">
        <h1 className="sr">Results</h1>
        <Spinner />
        Loading this check…
      </div>
    );
  }
  if (!check) {
    return (
      <>
        <PageHead title="Results" />
        <section className="card">
          <Empty icon={SearchX} title={state === 'error' ? "That check couldn't be loaded" : params.id ? 'Check not found' : 'No results yet'}>
            {state === 'error'
              ? 'Check your internet connection and try again.'
              : params.id
                ? 'It may have been deleted.'
                : 'Run a check to see its results here.'}
            <div className="actions">
              <Link className="btn primary" to={paths.newCheck()}>
                <Plus className="ic" aria-hidden="true" /> Start a check
              </Link>
            </div>
          </Empty>
        </section>
      </>
    );
  }

  const view = toRefsView(check, params.view === 'refs');
  if (!view && check.type === 'draft') return <DraftResults check={check} picker={<CheckPicker current={check.id} />} />;
  if (!view) return null;
  const ofDraft = check.type === 'draft';
  const count = (view.total || view.results.length).toLocaleString();
  return (
    <RefsResults
      // A different check, or a different list of the same check, starts from the first page.
      key={view.id + view.kind}
      view={view}
      header={
        <PageHead
          title={ofDraft ? 'Reference list' : check.name}
          lead={`${ofDraft ? check.name : typeName(check.type)} · ${fmtDate(check.date)} · ${count} ${count === '1' ? 'reference' : 'references'}`}
        >
          {ofDraft && (
            <Link className="btn ghost sm" to={paths.results(check.id)}>
              <ArrowLeft className="ic" aria-hidden="true" /> Back to claims
            </Link>
          )}
          <CheckPicker current={check.id} />
        </PageHead>
      }
    />
  );
}
