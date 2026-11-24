/* One checked reference, and the corrected bibliography built from all of them. Also used in downloaded reports. */
import { AI_CHECK_VERDICTS, stripTags, styleInfo, type AiFinding, type CitationStyle, type Match, type RefResult, type Verdict } from '@siyasat/core';
import { ArrowRight, Copy, ExternalLink, FileText, Globe, Link2, RotateCw, SlidersHorizontal, Sparkles } from 'lucide-react';
import { useState, type Ref } from 'react';
import { ApiError } from '../lib/api';
import { AI_OUTCOME, EXPLAIN, fmtDate, LABEL, MAIN_VERDICTS } from '../lib/labels';
import { referenceIn } from '../lib/reference';
import { toast } from '../store/toast';
import { ApaText, Badge, CopyButton, External, NewTab, plainApa, plainTitle, ReadButton, Spinner } from './bits';

/** Only link to web addresses: a record's "free PDF" link comes from a database, not from us. */
const webUrl = (u?: string | null): string | null => (u && /^https?:\/\//i.test(u) ? u : null);

/**
 * Which results repeat an earlier one: same DOI, or same title and year. Maps a result's position to the
 * position of the first occurrence.
 */
export function duplicates(results: RefResult[]): Map<number, number> {
  const seen = new Map<string, number>();
  const out = new Map<number, number>();
  results.forEach((r, position) => {
    const m = r.match;
    const keys: string[] = [];
    if (m?.doi) keys.push('d:' + m.doi);
    if (m?.title && m.title.length > 15) {
      keys.push('t:' + m.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + '|' + (m.year || ''));
    }
    const first = keys.map((k) => seen.get(k)).find((p) => p !== undefined);
    if (first !== undefined) out.set(position, first);
    keys.forEach((k) => {
      if (!seen.has(k)) seen.set(k, position);
    });
  });
  return out;
}

function Venue({ m }: { m: Match }) {
  const v = m.ven;
  if (!v && !m.venue) return null;
  const bits: string[] = [];
  if (v?.publisher) bits.push(v.publisher);
  if (v?.type && v.type !== 'journal') bits.push(v.type);
  if (v?.cites != null) bits.push(`cited ${(+v.cites).toLocaleString()} times`);
  return (
    <div className="vline">
      {v?.name || m.venue}
      {bits.length ? ' · ' + bits.join(' · ') : ''}
      {v?.doaj && <span className="vpill">In DOAJ</span>}
      {v?.oaVenue && <span className="vpill">Open-access venue</span>}
      {v?.isOa && !v.oaVenue && <span className="vpill">Free to read</span>}
    </div>
  );
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** What the AI web search found, shown beside the verdict and never in place of it. */
function AiFindingView({ f }: { f: AiFinding }) {
  const w = f.work;
  const workUrl = webUrl(w?.url);
  const outcome = AI_OUTCOME[f.outcome];
  return (
    <>
      <div className="ai-head">
        <Sparkles className="ic" aria-hidden="true" />
        <b>AI web search: {outcome.t}</b>
        <span className="meta">
          {f.model} · {fmtDate(f.date)}
        </span>
      </div>
      <p className="ai-help">{outcome.help}</p>
      <p>{f.summary}</p>
      {w && (
        <p className="ai-work">
          <span className="sr">What it found: </span>
          {workUrl ? (
            <External href={workUrl}>
              {w.title}
              <NewTab />
            </External>
          ) : (
            <i>{w.title}</i>
          )}
          {[w.authors, w.year, w.venue, w.kind].filter(Boolean).length > 0 && ' · ' + [w.authors, w.year, w.venue, w.kind].filter(Boolean).join(' · ')}
          {w.doi && (
            <>
              {' · '}
              <External href={`https://doi.org/${w.doi}`}>doi.org/{w.doi}</External> (checked in Crossref)
            </>
          )}
        </p>
      )}
      {f.sources.length > 0 && (
        <ul className="ai-sources" aria-label="Pages the AI found">
          {f.sources.map((s) => (
            <li key={s.url}>
              <External href={s.url}>
                {s.title}
                <NewTab />
              </External>{' '}
              <span className="host">{hostOf(s.url)}</span>
            </li>
          ))}
        </ul>
      )}
      {f.adjusted && <p className="note">Siyasat checked the AI’s answer: {f.adjusted}</p>}
      {f.queries.length > 0 && (
        <details className="ai-queries">
          <summary>What it searched for</summary>
          <ul>
            {f.queries.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/** The AI web search for one reference: its finding, and the button that starts or repeats it. */
function AiPanel({ r, report, onAiCheck, aiLeft }: { r: RefResult; report: boolean; onAiCheck?: (fresh: boolean) => Promise<void>; aiLeft?: number }) {
  const [running, setRunning] = useState(false);
  const offered = !report && !!onAiCheck && AI_CHECK_VERDICTS.includes(r.auto ?? r.verdict);
  if (!r.ai && !offered) return null;
  const run = async (fresh: boolean) => {
    if (!onAiCheck || running) return;
    setRunning(true);
    try {
      await onAiCheck(fresh);
    } catch (e) {
      toast(e instanceof ApiError || e instanceof Error ? e.message : 'The AI web search failed. Try again.');
    } finally {
      setRunning(false);
    }
  };
  const left = aiLeft != null ? ` You have ${aiLeft} left today.` : '';
  return (
    <section className={`ai-find${r.ai ? ' ai-' + r.ai.outcome : ''}`} aria-label="AI web search" aria-busy={running}>
      {r.ai && <AiFindingView f={r.ai} />}
      {offered && !r.ai && (
        <p className="ai-help">
          Books, reports, theses and local journals are often missing from Crossref and OpenAlex. An AI can look for this one on the open web.
          It only advises: the verdict stays as it is unless you change it.{left}
        </p>
      )}
      {offered && (
        <div className="ai-actions">
          {running ? (
            <span className="ai-running" role="status">
              <Spinner /> Searching the web… this can take a minute.
            </span>
          ) : r.ai ? (
            <button type="button" className="link" disabled={aiLeft === 0} onClick={() => void run(true)}>
              <RotateCw className="ic" aria-hidden="true" /> Search again
            </button>
          ) : (
            <button type="button" className="ghost sm" disabled={aiLeft === 0} onClick={() => void run(false)}>
              <Globe className="ic" aria-hidden="true" /> Search the web with AI
            </button>
          )}
          {aiLeft === 0 && <span className="meta">No AI web searches left today.</span>}
        </div>
      )}
    </section>
  );
}

/** "Change this verdict": the author knows better than the databases sometimes. */
function OverrideForm({ r, onSave, onReset }: { r: RefResult; onSave: (to: Verdict, note: string) => void; onReset: () => void }) {
  const [to, setTo] = useState<Verdict>(r.verdict);
  const [note, setNote] = useState(r.ovNote || '');
  return (
    <div className="ovr-form">
      <label>
        New verdict
        <select value={to} onChange={(e) => setTo(e.target.value as Verdict)}>
          {MAIN_VERDICTS.map((v) => (
            <option value={v} key={v}>
              {LABEL[v]}
            </option>
          ))}
        </select>
      </label>
      <label className="grow">
        Why (optional)
        <input type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I found it in the library catalogue" />
      </label>
      <button type="button" className="primary sm" onClick={() => onSave(to, note.trim())}>
        Save my verdict
      </button>
      {r.auto && (
        <button type="button" className="link" onClick={onReset}>
          Go back to Siyasat's verdict ({LABEL[r.auto]})
        </button>
      )}
    </div>
  );
}

interface RefItemProps {
  r: RefResult;
  /** The reference's number in the list, starting from 1. */
  number: number;
  /** The number of the reference this one repeats. */
  duplicateOf?: number;
  /** In a downloaded report there is nothing to click except links. */
  report?: boolean;
  /** The citation style "Copy corrected reference" writes. */
  style?: CitationStyle;
  onOverride?: (to: Verdict, note: string) => void;
  /** Look for this reference on the web with AI. Given only when the AI web search is on for this site. */
  onAiCheck?: (fresh: boolean) => Promise<void>;
  /** AI web searches the account has left today. */
  aiLeft?: number;
}

export function RefItem({ r, number, duplicateOf, report = false, style = 'apa', onOverride, onAiCheck, aiLeft }: RefItemProps) {
  const [changing, setChanging] = useState(false);
  const m = r.match;
  const corrected = r.verdict === 'retracted' ? null : referenceIn(r, style);
  const doiFix =
    (r.diffs || []).find((d) => d.field === 'DOI') ||
    (r.verdict === 'correction' && m?.doi && !/10\.\d{4,9}\//.test(r.raw) ? { cited: '(none)', actual: m.doi, add: true } : null);
  const oaUrl = webUrl(m?.ven?.oaUrl);
  return (
    <article className={`item v-${r.verdict}`} aria-label={`Reference ${number}: ${LABEL[r.verdict]}`}>
      <div className="item-head">
        <Badge verdict={r.verdict} />
        {duplicateOf != null && (
          <span className="chip-note">
            <Copy className="ic" aria-hidden="true" /> Duplicate of reference {duplicateOf}
          </span>
        )}
        {r.auto && (
          <span className="chip-note yours" title={`Siyasat said: ${LABEL[r.auto]}`}>
            You overrode this
          </span>
        )}
        <span className="n">Reference {number}</span>
        {r.confidence != null && <span className="conf">Match confidence {Math.round(r.confidence * 100)}%</span>}
      </div>
      <p className="cite">
        <span className="sr">You wrote: </span>
        {r.raw}
      </p>
      <p className="what">{EXPLAIN[r.verdict]}</p>
      {r.auto && (
        <p className="what">
          Siyasat said “{LABEL[r.auto]}”. You changed it{r.ovNote ? `: ${r.ovNote}` : '.'}
        </p>
      )}
      {doiFix && (
        <div className="msg info">
          <b>{'add' in doiFix ? 'Add this DOI' : 'Corrected DOI'}:</b>{' '}
          {!('add' in doiFix) && (
            <>
              <s>{doiFix.cited}</s> <ArrowRight className="ic" aria-label="becomes" />{' '}
            </>
          )}
          <External href={`https://doi.org/${doiFix.actual}`}>{doiFix.actual}</External>
        </div>
      )}
      {m && (
        <div className="record">
          <div className="rt">
            <span className="meta">Matched record · {m.source}</span>
            <br />
            <External href={`https://doi.org/${m.doi}`}>
              {plainTitle(m.title)}
              <NewTab />
            </External>
          </div>
          <Venue m={m} />
          <div className="enr">
            {m.doi && (
              <External className="btn ghost sm" href={`https://doi.org/${m.doi}`}>
                <Link2 className="ic" aria-hidden="true" /> doi.org/{m.doi}
              </External>
            )}
            {m.doi && !report && <CopyButton text={`https://doi.org/${m.doi}`} label="Copy DOI" />}
            {!report && <ReadButton doi={m.doi} label="Read in Siyasat" />}
            {oaUrl && (
              <External className="btn ghost sm" href={oaUrl}>
                <FileText className="ic" aria-hidden="true" /> Open free PDF <ExternalLink className="ic" aria-hidden="true" />
              </External>
            )}
          </div>
        </div>
      )}
      {r.note && r.verdict !== 'uncertain' && <p className="what">{r.note}</p>}
      {!!r.diffs?.length && (
        <div className="tbl">
          <table>
            <caption className="sr">Differences</caption>
            <thead>
              <tr>
                <th scope="col">Detail</th>
                <th scope="col">You wrote</th>
                <th scope="col">Official record</th>
              </tr>
            </thead>
            <tbody>
              {r.diffs.map((d) => (
                <tr key={d.field}>
                  <td>{d.field}</td>
                  <td className="was">{d.cited}</td>
                  <td className={d.suspect ? '' : 'fix'}>
                    {d.field === 'Title' ? plainTitle(d.actual) : d.actual}
                    {d.note && <div className="note">{d.note}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AiPanel r={r} report={report} onAiCheck={onAiCheck} aiLeft={aiLeft} />
      {!report && (
        <div className="item-foot">
          {corrected && <CopyButton text={plainApa(corrected)} label={`Copy corrected reference (${styleInfo(style).name})`} />}
          {onOverride && (
            <button type="button" className="link" aria-expanded={changing} onClick={() => setChanging((open) => !open)}>
              <SlidersHorizontal className="ic" aria-hidden="true" /> Change this verdict
            </button>
          )}
        </div>
      )}
      {!report && onOverride && changing && (
        // Keyed by the verdict so the form starts from the new state after a change or an undo.
        <OverrideForm
          key={`${r.verdict}|${r.auto ?? ''}|${r.ovNote ?? ''}`}
          r={r}
          onSave={(to, note) => {
            setChanging(false);
            onOverride(to, note);
          }}
          onReset={() => {
            setChanging(false);
            if (r.auto) onOverride(r.auto, '');
          }}
        />
      )}
    </article>
  );
}

/**
 * The corrected bibliography in a citation style, and a list of what was left out of it. Styles that number
 * their references keep the order of the list that was checked; the others are sorted A–Z.
 */
export function Bibliography({ results, style = 'apa', listRef }: { results: RefResult[]; style?: CitationStyle; listRef?: Ref<HTMLDivElement> }) {
  const info = styleInfo(style);
  const seen = new Set<string>();
  const entries = results
    .filter((r) => {
      if (!r.match || r.verdict === 'retracted' || r.verdict === 'not_found' || r.verdict === 'error') return false;
      const doi = r.match.doi;
      if (doi && seen.has(doi)) return false;
      seen.add(doi ?? '');
      return true;
    })
    .flatMap((r) => referenceIn(r, style) ?? []);
  if (!info.numbered) entries.sort((a, b) => stripTags(a).localeCompare(stripTags(b)));
  const leftOut = results.filter((r) => ['not_found', 'retracted', 'error'].includes(r.verdict));
  return (
    <>
      <div className="apa" ref={listRef}>
        {entries.length ? (
          entries.map((entry, i) => (
            <p key={i}>
              {info.label && info.label(i + 1) + ' '}
              <ApaText html={entry} />
            </p>
          ))
        ) : (
          <div className="empty">No confirmed references to list.</div>
        )}
      </div>
      {leftOut.length > 0 && (
        <div className="leftout">
          <b>Left out, please review:</b>
          <ul>
            {leftOut.map((r, i) => (
              <li key={i}>
                <Badge verdict={r.verdict} /> {r.raw.slice(0, 110)}
                {r.raw.length > 110 ? '…' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
