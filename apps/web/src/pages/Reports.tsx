import { Link } from 'react-router';
import { Empty } from '../components/bits';
import { ReportButtons } from '../components/ReportButtons';
import { draftProgress } from '../lib/draftView';
import { fmtDate } from '../lib/labels';
import { paths } from '../lib/nav';
import { useChecks } from '../store/checks';

export function Reports() {
  const checks = useChecks((s) => s.summaries);
  return (
    <>
      <h1 className="page-h">Reports</h1>
      <p className="lead">Timestamped verification reports you can show your adviser or panel. Each verdict links to its evidence.</p>
      <section className="card">
        {checks.length ? (
          <>
            <ul className="recent">
              {checks.map((c) => {
                const progress = c.draft && draftProgress(c.draft);
                return (
                  <li key={c.id}>
                    {c.draft ? (
                      <>
                        <div className="t">
                          <b>Claim-faithfulness report · {c.name}</b>
                          <small>
                            {fmtDate(c.date)} · {c.draft.claims} claims · verdicts by you
                          </small>
                        </div>
                        <span className={`pill ${progress!.cls}`}>{progress!.t}</span>
                      </>
                    ) : (
                      <>
                        <div className="t">
                          <b>Verification report · {c.name}</b>
                          <small>
                            {fmtDate(c.date)} · {c.resultCount} references · {c.counts.not_found} AI-hallucinations · {c.counts.retracted}{' '}
                            retracted
                          </small>
                        </div>
                        <span className="score-chip">{c.score}/100</span>
                      </>
                    )}
                    <ReportButtons id={c.id} name={c.name} />
                  </li>
                );
              })}
            </ul>
            <p className="help" style={{ marginTop: 12 }}>
              Tip: open the downloaded report and use your browser's <b>Print → Save as PDF</b>.
            </p>
          </>
        ) : (
          <Empty icon="📄">
            No reports yet. Every check you run creates a report here.
            <div className="actions" style={{ justifyContent: 'center' }}>
              <Link className="btn primary" to={paths.newCheck()}>
                Start a check
              </Link>
            </div>
          </Empty>
        )}
      </section>
    </>
  );
}
