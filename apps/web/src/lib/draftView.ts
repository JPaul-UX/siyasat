/* How a draft check's claims and sources are described on screen and in reports. */
import { compare, terms, type AbstractInfo, type Claim, type CiteRef, type DraftCheck, type DraftSource, type Match, type RefResult } from '@siyasat/core';
import { JUDGMENT } from './labels';

export interface Flag {
  /** Short label for a pill. */
  t: string;
  cls: 'ret' | 'bad' | 'na';
  /** One line explaining it. */
  line: string;
}

export interface SourceView {
  source: Partial<DraftSource>;
  result: RefResult;
  match?: Match | null;
  /** The year written in the text, and the year of the matched record. */
  citedYear?: number;
  recordYear?: number | null;
  yearDiffers: boolean;
  flag: Flag | null;
  abstract?: string | null;
  abstractInfo: Partial<AbstractInfo>;
}

const unlisted = (r: RefResult) => /no reference list entry/.test(r.raw || '');
const unavailable = (r: RefResult) => /unavailable/.test(r.note || '');

/** Everything known about the source a citation points to. */
export function sourceView(c: DraftCheck, key: string): SourceView {
  const i = c.sources.findIndex((s) => s.key === key);
  const source: Partial<DraftSource> = c.sources[i] || {};
  const r: RefResult = c.results[i] || { raw: '', verdict: 'error' };
  const m = r.match;
  const citedYear = source.year || +(key.split('|')[1] || 0) || undefined;
  const recordYear = m?.year;

  let flag: Flag | null = null;
  if (r.verdict === 'retracted') {
    flag = { t: 'Retracted source', cls: 'ret', line: 'This paper was retracted. It should not be used as evidence.' };
  } else if (r.verdict === 'not_found' && !r.orphan && unlisted(r)) {
    flag = {
      t: 'Possible hallucination',
      cls: 'na',
      line: 'Possible hallucination. An author-and-year search found no clear match, but this may still be a real paper. Add the full reference so Siyasat can check the exact paper',
    };
  } else if (r.verdict === 'not_found') {
    flag = { t: 'AI-hallucination', cls: 'bad', line: 'Not found in global indexes. Siyasat abstains rather than guessing.' };
  } else if (r.verdict === 'error') {
    flag = { t: "Couldn't check", cls: 'na', line: "We couldn't reach the databases for this source. Try again later." };
  } else if (r.weak) {
    flag = unavailable(r)
      ? { t: "Couldn't check", cls: 'na', line: "Couldn't check. A database was unavailable. Try again later, or add it to your reference list" }
      : {
          t: 'Possible hallucination',
          cls: 'na',
          line: 'Possible hallucination. Papers by this author and year exist, but none clearly matches your sentence. Add it to your reference list',
        };
  } else if (r.orphan) {
    flag = { t: 'Possible hallucination', cls: 'na', line: 'Possible hallucination. Add it to your reference list so Siyasat can check the exact paper.' };
  }

  return {
    source,
    result: r,
    match: m,
    citedYear,
    recordYear,
    yearDiffers: !!(m && recordYear && citedYear && recordYear !== citedYear && !/^#/.test(key)),
    flag,
    abstract: source.abstract?.text,
    abstractInfo: source.abstract || {},
  };
}

/** One line of evidence for a citation: what was found, and how the sentence compares with the abstract. */
export function evidence(c: DraftCheck, claim: Claim, cite: CiteRef): string {
  const x = sourceView(c, cite.key);
  const bits: string[] = [];
  if (x.flag) bits.push(x.flag.line);
  else if (x.result.linked && x.match) {
    const title = x.match.title;
    bits.push(`Matched by author and year to “${title.slice(0, 70)}${title.length > 70 ? '…' : ''}”. Confirm it's the paper you meant`);
  }
  if (x.abstract) {
    const cmp = compare(claim.sentence, x.abstract);
    bits.push(`abstract via ${x.abstractInfo.from} · ${cmp.shared} shared term${cmp.shared === 1 ? '' : 's'}`);
    if (cmp.missing.length) bits.push(`${cmp.missing.join(', ')} not in the abstract`);
    else if (terms(claim.sentence).nums.length) bits.push('numbers appear in the abstract');
  } else if (x.match && x.result.verdict !== 'not_found') {
    bits.push('no free abstract. Open the article to read it');
  }
  if (x.yearDiffers) bits.push(`in-text year should be ${x.recordYear}`);
  return bits.join(' · ');
}

export const claimEvidence = (c: DraftCheck, claim: Claim): string => claim.cites.map((ct) => evidence(c, claim, ct)).join(' | ');

export interface PillView {
  cls: string;
  text: string;
  /** The author chose this verdict. */
  yours?: boolean;
}

/** The pill shown for a claim: the author's verdict if there is one, else the most serious warning, else "Your call". */
export function claimPill(c: DraftCheck, claim: Claim): PillView {
  if (claim.judgment) {
    const j = JUDGMENT[claim.judgment];
    return { cls: j.cls, text: j.t, yours: true };
  }
  const order = ['ret', 'bad', 'na'];
  const flags = claim.cites
    .map((ct) => sourceView(c, ct.key).flag)
    .filter((f): f is Flag => !!f)
    .sort((a, b) => order.indexOf(a.cls) - order.indexOf(b.cls));
  return flags.length ? { cls: flags[0]!.cls, text: flags[0]!.t } : { cls: 'wait', text: 'Your call' };
}

/** A citation label without its outer parentheses. */
export const bareLabel = (label: string): string => (label.startsWith('(') && label.endsWith(')') ? label.slice(1, -1) : label);

/** A claim's sentence without its citations, shortened for a list row. */
export function quote(sentence: string): string {
  const t = sentence
    .replace(/\s*\([^()]*\b(19|20)\d{2}[a-z]?[^()]*\)/g, '')
    .replace(/\s*\[[\d,\s–-]+\]/g, '')
    .trim();
  return '“' + (t.length > 150 ? t.slice(0, 140).replace(/\s+\S*$/, '') + '…' : t) + '”';
}

/** How far the author has got with a draft's claims, for lists. */
export function draftProgress(d: { claims: number; match: number; nomatch: number; unsure: number }): { t: string; cls: string } {
  const waiting = d.claims - d.match - d.nomatch - d.unsure;
  if (waiting === d.claims) return { t: 'Not reviewed yet', cls: 'wait' };
  if (waiting) return { t: `${d.claims - waiting} of ${d.claims} reviewed`, cls: 'wait' };
  if (d.nomatch) return { t: `${d.nomatch} contradicted`, cls: 'bad' };
  if (d.unsure) return { t: `${d.unsure} unverifiable`, cls: 'na' };
  return { t: 'All supported', cls: 'ok' };
}

export function tallyClaims(claims: Claim[]): { claims: number; match: number; nomatch: number; unsure: number; waiting: number } {
  const n = (k: string) => claims.filter((x) => x.judgment === k).length;
  return { claims: claims.length, match: n('match'), nomatch: n('nomatch'), unsure: n('unsure'), waiting: claims.filter((x) => !x.judgment).length };
}

/** Why a source is in the state it is in, written for the claim's detail panel. */
export function sourceNote(x: SourceView): string {
  const r = x.result;
  if (r.verdict === 'not_found' && !r.orphan && unlisted(r)) {
    return (r.note || '') + ' Siyasat abstains rather than guessing: without a reference list it only knows the author and year.';
  }
  if (r.verdict === 'not_found') return r.note || 'Marked for manual checking: try your university repository or the national library.';
  if (r.verdict === 'retracted') return "Real source, but retracted. Don't cite it as valid evidence; cite the retraction notice if you discuss it.";
  if (r.weak && unavailable(r)) return r.note || '';
  if (r.weak) {
    return 'Possible hallucination. Siyasat found papers by this author and year, but none whose title fits your sentence, so it shows nothing rather than guess. Add the full reference to your reference list (or check your university repository) and run the check again.';
  }
  if (r.orphan) return 'Possible hallucination. Add it to your reference list so Siyasat can check the exact paper you meant.';
  if (x.abstract) {
    return 'Read the abstract below, then give your verdict. Abstracts can oversell; if it matters, read the results and discussion in the full article.';
  }
  return 'No free abstract is available for this source. Open the article to check it yourself.';
}
