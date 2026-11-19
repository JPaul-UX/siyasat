import type { FullText } from '@siyasat/core';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { External, NewTab, Spinner } from '../components/bits';
import { api } from '../lib/api';

const cleanDoi = (doi: string) =>
  doi
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '');

const VERSION: Record<string, string> = {
  publishedVersion: 'the published version',
  acceptedVersion: "the author's accepted manuscript (same content, before the journal's final formatting)",
  submittedVersion: 'a preprint (an earlier draft, before peer review, so it may differ from the final paper)',
};

/** Results and Discussion are where a claim should be checked, so the jump list points them out. */
const jumpClass = (title: string) => (/result|finding/i.test(title) ? 'key-r' : /discussion|conclusion|limitation/i.test(title) ? 'key-d' : '');

const SpinTip = () => (
  <div className="rd-tip" role="note">
    <b>💡 Read past the abstract.</b> Abstracts sometimes sound more certain than the actual findings ("spin"). Before you cite a claim,
    jump to <b>Results</b> and <b>Discussion</b> and check the paper really says it, including any limits the authors mention.
  </div>
);

const found = new Map<string, FullText>();

function Article({ o, onRetry }: { o: FullText; onRetry: () => void }) {
  const m = o.meta || {};
  const head = (
    <p className="meta">
      {m.authors ? m.authors + ' · ' : ''}
      {m.journal ? m.journal + ' · ' : ''}
      {m.year ? m.year + ' · ' : ''}
      <External href={`https://doi.org/${o.doi}`}>
        doi.org/{o.doi}
        <NewTab />
      </External>
    </p>
  );

  if (o.kind === 'pmc') {
    const secs = o.secs ?? [];
    const jump = (id: string) => {
      const section = document.getElementById(id);
      if (!section) return;
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      section.focus({ preventScroll: true });
    };
    return (
      <>
        {/* The title and sections are HTML the API built from a fixed set of tags, with all text escaped. */}
        {o.title ? <h1 className="rd-title" dangerouslySetInnerHTML={{ __html: o.title }} /> : <h1 className="rd-title">{m.title || 'Full text'}</h1>}
        {head}
        <p className="rd-src">
          <span className="badge verified">Free full text</span> From Europe PMC ({o.pmcid}).{' '}
          <External href={`https://europepmc.org/article/PMC/${o.pmcid}`}>
            Open on Europe PMC
            <NewTab />
          </External>
        </p>
        <SpinTip />
        <div className="rd-wrap">
          <nav className="rd-jump" aria-label="Jump to section">
            <b>Jump to</b>
            <ol>
              {secs.map((s, i) => (
                <li key={i}>
                  <a
                    href={`#rd-s${i}`}
                    className={jumpClass(s.title)}
                    onClick={(e) => {
                      e.preventDefault();
                      jump(`rd-s${i}`);
                    }}
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <article className="rd-body">
            {secs.map((s, i) => (
              <section id={`rd-s${i}`} tabIndex={-1} key={i}>
                <h2>{s.title}</h2>
                <div dangerouslySetInnerHTML={{ __html: s.html }} />
              </section>
            ))}
            {o.license && <p className="meta rd-lic">License: {o.license}</p>}
            <p className="meta">Figures, tables and equations aren't shown here. Open the original to see them.</p>
          </article>
        </div>
      </>
    );
  }

  if (o.kind === 'oa') {
    const link = o.pdf || o.url || `https://doi.org/${o.doi}`;
    return (
      <>
        <h1 className="rd-title">{m.title || 'Free version found'}</h1>
        {head}
        <p className="rd-src">
          <span className="badge verified">Free version found</span> Found through Unpaywall. This copy is{' '}
          {(o.version && VERSION[o.version]) || 'a free copy'}
          {o.host === 'repository' ? ', kept in a university or public repository' : ''}.
        </p>
        <SpinTip />
        <p>
          <External className="rd-open" href={link}>
            📄 Open free {o.pdf ? 'PDF' : 'version'}
            <NewTab />
          </External>{' '}
          {o.pdf && o.url && o.url !== o.pdf && (
            <span style={{ marginLeft: 10 }}>
              <External href={o.url}>
                Article page
                <NewTab />
              </External>
            </span>
          )}
        </p>
        {o.pdf && (
          <details className="rd-prev" open>
            <summary>Preview here</summary>
            <p className="meta">
              Some websites don't allow previews inside other sites. If the box below is blank or shows an error, use the <b>Open free PDF</b>{' '}
              button above.
            </p>
            <iframe src={o.pdf} title="PDF preview" loading="lazy" referrerPolicy="no-referrer" />
          </details>
        )}
      </>
    );
  }

  return (
    <>
      <h1 className="rd-title">{m.title || 'No free full text found'}</h1>
      {head}
      <div className="rd-none">
        <p>
          <b>No free full text found — this paper may be paywalled.</b>
        </p>
        <p>You can still open the publisher's page. Your university library (or the author, by email) can often give you a copy.</p>
        <p>
          <External className="rd-open" href={`https://doi.org/${o.doi}`}>
            Go to the paper's page
            <NewTab />
          </External>
        </p>
        {o.errors.length > 0 && (
          <p className="meta">
            Note: we couldn't reach {o.errors.join(' and ')} just now.{' '}
            <button type="button" className="ghost" onClick={onRetry}>
              Try again
            </button>
          </p>
        )}
      </div>
      <SpinTip />
    </>
  );
}

/** The built-in reader: a free, legal full text for a DOI when one exists. */
export function Reader() {
  const [params] = useSearchParams();
  const doi = cleanDoi(params.get('doi') ?? '');
  const [attempt, setAttempt] = useState(0);
  const [article, setArticle] = useState<FullText | null>(() => found.get(doi) ?? null);

  useEffect(() => {
    const cached = found.get(doi);
    if (cached) {
      setArticle(cached);
      return;
    }
    let current = true;
    setArticle(null);
    api
      .fullText(doi)
      .catch((): FullText => ({ doi, kind: 'none', errors: ['the search services'] }))
      .then((o) => {
        if (!o.errors.length) found.set(doi, o);
        if (current) setArticle(o);
      });
    return () => {
      current = false;
    };
  }, [doi, attempt]);

  return (
    <div className="reader">
      {article ? (
        <Article o={article} onRetry={() => setAttempt((n) => n + 1)} />
      ) : (
        <>
          <h1 className="sr">Full-text reader</h1>
          <p className="rd-load" role="status">
            <Spinner /> Looking for a free full text… (this can take a few seconds)
          </p>
        </>
      )}
    </div>
  );
}
