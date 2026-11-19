/* The downloadable reports: a standalone HTML page to print or share, and the same facts as JSON. */
import type { Check, DraftCheck, RefResult } from '@siyasat/core';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Badge, Chevron } from '../components/bits';
import { Logo } from '../components/Logo';
import { Bibliography, duplicates, RefItem } from '../components/RefItem';
import { DraftStats } from '../components/DraftStats';
import css from '../styles.css?inline';
import { draftProgress, evidence, sourceView, tallyClaims } from './draftView';
import { JUDGMENT } from './labels';

function page(title: string, heading: string, body: ReactNode): string {
  return (
    '<!doctype html>' +
    renderToStaticMarkup(
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <title>{title}</title>
          <style dangerouslySetInnerHTML={{ __html: css }} />
        </head>
        <body>
          <div className="mhead" style={{ display: 'flex' }}>
            <Logo size={30} />
            <b>{heading}</b>
          </div>
          <main className="report-main">{body}</main>
        </body>
      </html>,
    )
  );
}

/** A reference check's results as its own check-like view. A draft's reference list is reported this way too. */
export interface RefsReportView {
  name: string;
  date: string;
  score: number;
  results: RefResult[];
}

function refsReport(c: RefsReportView): string {
  const dups = duplicates(c.results);
  const number = (r: RefResult, position: number) => (r.i ?? position) + 1;
  return page(
    `Siyasat verification report · ${c.name}`,
    'Siyasat verification report',
    <>
      <h1 className="page-h">{c.name}</h1>
      <p className="lead" style={{ marginBottom: 18 }}>
        Checked {new Date(c.date).toString()} · {c.results.length} references · Integrity score <b>{c.score}/100</b>
        <br />
        Sources queried: Crossref REST API (incl. Retraction Watch data) and OpenAlex. Verdicts marked “You overrode this” were changed by the
        author. To save this report as a PDF, choose Print in your browser, then Save as PDF.
      </p>
      <section className="card">
        <h2>Each reference</h2>
        {c.results.map((r, position) => {
          const first = dups.get(position);
          return (
            <RefItem
              key={position}
              r={r}
              number={number(r, position)}
              duplicateOf={first === undefined ? undefined : number(c.results[first]!, first)}
              report
            />
          );
        })}
      </section>
      <section className="card">
        <h2>Corrected bibliography (APA 7)</h2>
        <Bibliography results={c.results} />
      </section>
    </>,
  );
}

function draftReport(c: DraftCheck): string {
  const when = new Date(c.date);
  const progress = draftProgress(tallyClaims(c.claims));
  return page(
    `Claim-faithfulness report · ${c.name}`,
    'Siyasat',
    <>
      <h1 className="page-h">Claim-faithfulness report: {c.name}</h1>
      <p className="lead" style={{ marginBottom: 18 }}>
        Verified {when.toLocaleString()} ({when.toISOString()}) · {c.claims.length} claims · {c.sources.length} sources ·{' '}
        <span className={`pill ${progress.cls}`}>{progress.t}</span>
      </p>
      <div className="stats">
        <DraftStats claims={c.claims} />
      </div>
      <p className="oneline">
        <span>
          Every Supported / Contradicted / Unverifiable verdict in this report was chosen by the author after reading the source. Siyasat
          retrieved the sources and abstracts; it did not judge the claims.
        </span>
      </p>
      <p className="help">
        Databases queried: Crossref REST API (including Retraction Watch data), OpenAlex, Europe PMC, Semantic Scholar. Each source links to
        its record so anyone can re-check it. To save this report as a PDF, choose Print in your browser, then Save as PDF.
      </p>
      {!!c.orphans?.length && (
        <p>
          <b>Cited but not in the reference list:</b> {c.orphans.map((o) => o.label).join(', ')}
        </p>
      )}
      {!!c.uncited?.length && (
        <p>
          <b>Listed but never cited:</b> {c.uncited.join(' · ')}
        </p>
      )}
      {c.claims.map((cl, i) => {
        const j = cl.judgment ? JUDGMENT[cl.judgment] : null;
        return (
          <article className="rclaim" key={i}>
            <div className="rc-h">
              <b>Claim {i + 1}</b>{' '}
              {j ? (
                <>
                  <span className={`pill ${j.cls}`}>{j.t}</span> <span className="meta">author's verdict</span>
                </>
              ) : (
                <span className="pill wait">Not reviewed by the author</span>
              )}
            </div>
            <p className="cite">{cl.sentence}</p>
            {cl.note && <p className="meta">Author's note: {cl.note}</p>}
            {cl.cites.map((ct) => {
              const x = sourceView(c, ct.key);
              return (
                <div className="rc-src" key={ct.key}>
                  <b>{ct.label}</b>:{' '}
                  {x.match ? (
                    <>
                      {x.match.title}
                      {x.recordYear ? ` (${x.recordYear})` : ''} · <a href={`https://doi.org/${x.match.doi}`}>doi.org/{x.match.doi}</a>
                    </>
                  ) : (
                    'no matching record'
                  )}{' '}
                  · <Badge verdict={x.result.verdict} />
                  {x.flag && (
                    <>
                      {' '}
                      <span className={`pill ${x.flag.cls}`}>{x.flag.t}</span>
                    </>
                  )}
                  <div className="meta">Evidence: {evidence(c, cl, ct)}</div>
                  {x.abstract && (
                    <details>
                      <summary>
                        <Chevron /> Abstract (via {x.abstractInfo.from})
                      </summary>
                      <p>{x.abstract}</p>
                    </details>
                  )}
                </div>
              );
            })}
          </article>
        );
      })}
    </>,
  );
}

/** The report for a check, or for the reference list of an uploaded draft when `refsView` is set. */
export function buildReport(c: Check, refsView = false): string {
  if (c.type === 'draft' && !refsView) return draftReport(c);
  if (c.type === 'draft') return refsReport({ name: c.name, date: c.date, score: c.refScore ?? 0, results: c.refResults ?? [] });
  return refsReport(c);
}

const refsJson = (c: RefsReportView) => ({
  tool: 'Siyasat',
  name: c.name,
  checked_at: c.date,
  integrity: c.score,
  results: c.results.map((r) => ({
    input: r.raw,
    verdict: r.verdict,
    confidence: r.confidence,
    doi: r.match?.doi,
    matched_title: r.match?.title,
    differences: r.diffs,
    note: r.note,
    apa: r.apa,
    siyasat_verdict: r.auto || r.verdict,
    overridden_by_author: !!r.auto,
    author_note: r.ovNote || undefined,
    venue: r.match?.ven || undefined,
  })),
});

export function buildJson(c: Check, refsView = false): string {
  if (c.type !== 'draft') return JSON.stringify(refsJson(c), null, 2);
  if (refsView) return JSON.stringify(refsJson({ name: c.name, date: c.date, score: c.refScore ?? 0, results: c.refResults ?? [] }), null, 2);
  return JSON.stringify(
    {
      tool: 'Siyasat',
      type: 'draft',
      name: c.name,
      checked_at: c.date,
      claims: c.claims.map((cl) => ({
        sentence: cl.sentence,
        citations: cl.cites.map((x) => x.label),
        author_verdict: cl.judgment ? JUDGMENT[cl.judgment].t : null,
        author_verdict_note: 'chosen by the author, not by Siyasat',
        author_note: cl.note || undefined,
        sources: cl.cites.map((x) => {
          const i = c.sources.findIndex((s) => s.key === x.key);
          const source = c.sources[i];
          const r = c.results[i];
          return {
            citation: x.label,
            reference: source?.ref,
            verdict: r?.verdict,
            doi: r?.match?.doi,
            abstract: source?.abstract?.text,
            abstract_from: source?.abstract?.from,
          };
        }),
      })),
      cited_not_listed: c.orphans,
      listed_not_cited: c.uncited,
    },
    null,
    2,
  );
}
