import { FileText, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { Empty, PageHead } from '../components/bits';
import { ReportButtons } from '../components/ReportButtons';
import { TYPE_ICON } from '../components/TypeCards';
import { draftProgress } from '../lib/draftView';
import { fmtDate } from '../lib/labels';
import { paths } from '../lib/nav';
import { useChecks } from '../store/checks';

export function Reports() {
  const checks = useChecks((s) => s.summaries);
  return (
    <>
      <PageHead title="Reports" lead="Timestamped verification reports you can show your adviser or panel. Each verdict links to its evidence." />
      <section className="card">
        {checks.length ? (
          <>
            <ul className="recent" style={{ marginTop: 0 }}>
              {checks.map((c) => {
                const progress = c.draft && draftProgress(c.draft);
                const Icon = TYPE_ICON[c.type];
                return (
                  <li key={c.id}>
                    <span className="ri" aria-hidden="true">
                      <Icon />
                    </span>
                    <div className="t">
                      <b>
                        <Link to={paths.results(c.id)}>{c.name}</Link>
                      </b>
                      <small>
                        {c.draft
                          ? `Claim-faithfulness report · ${fmtDate(c.date)} · ${c.draft.claims} claims · verdicts by you`
                          : `Verification report · ${fmtDate(c.date)} · ${c.resultCount} references · ${c.counts.not_found} AI-hallucinations · ${c.counts.retracted} retracted`}
                      </small>
                    </div>
                    {progress ? <span className={`pill ${progress.cls}`}>{progress.t}</span> : <span className="score-chip">{c.score}/100</span>}
                    <ReportButtons id={c.id} name={c.name} />
                  </li>
                );
              })}
            </ul>
            <p className="help" style={{ margin: '14px 0 0' }}>
              Tip: to keep a report as a PDF, open it, choose <b>Print</b> in your browser, then <b>Save as PDF</b>.
            </p>
          </>
        ) : (
          <Empty icon={FileText} title="No reports yet">
            Every check you run creates a report here.
            <div className="actions">
              <Link className="btn primary" to={paths.newCheck()}>
                <Plus className="ic" aria-hidden="true" /> Start a check
              </Link>
            </div>
          </Empty>
        )}
      </section>
    </>
  );
}
