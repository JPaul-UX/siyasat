/* One checked reference, and the corrected bibliography built from all of them. Also used in downloaded reports. */
import { stripTags, type Match, type RefResult, type Verdict } from '@siyasat/core';
import { ArrowRight, Copy, ExternalLink, FileText, Link2, SlidersHorizontal } from 'lucide-react';
import { useState, type Ref } from 'react';
import { EXPLAIN, LABEL, MAIN_VERDICTS } from '../lib/labels';
import { ApaText, Badge, CopyButton, External, NewTab, plainApa, plainTitle, ReadButton } from './bits';

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
  onOverride?: (to: Verdict, note: string) => void;
}

export function RefItem({ r, number, duplicateOf, report = false, onOverride }: RefItemProps) {
  const [changing, setChanging] = useState(false);
  const m = r.match;
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
      {!report && (
        <div className="item-foot">
          {r.apa && r.verdict !== 'retracted' && <CopyButton text={plainApa(r.apa)} label="Copy corrected reference" />}
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

/** The corrected APA 7 bibliography: confirmed references A–Z, and a list of what was left out. */
export function Bibliography({ results, listRef }: { results: RefResult[]; listRef?: Ref<HTMLDivElement> }) {
  const seen = new Set<string>();
  const entries = results
    .filter((r) => {
      if (!r.apa || r.verdict === 'retracted') return false;
      const doi = r.match?.doi;
      if (doi && seen.has(doi)) return false;
      if (r.match) seen.add(doi ?? '');
      return true;
    })
    .map((r) => r.apa!)
    .sort((a, b) => stripTags(a).localeCompare(stripTags(b)));
  const leftOut = results.filter((r) => ['not_found', 'retracted', 'error'].includes(r.verdict));
  return (
    <>
      <div className="apa" ref={listRef}>
        {entries.length ? (
          entries.map((entry, i) => (
            <p key={i}>
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
