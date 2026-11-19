/* The verification decision: given a reference and a way to look records up, decide what it is. */
import { evidenceFromText, namesFromTitle, sentenceCase } from './casing.js';
import { diffs, score, toMatch } from './match.js';
import { parse } from './parse.js';
import { SCORING } from './scoring.js';
import { norm } from './text.js';
import { apa } from './styles.js';
import type { Candidate, MatchScore, RefResult, VenueInfo } from './types.js';

export interface Enrichment {
  retracted?: boolean;
  ven: VenueInfo | null;
  /** The language of the work, as a code such as "en". */
  lang?: string;
  /** The abstract, as evidence of how the words of the title are written in running text. */
  abstract?: string;
}

/** The lookups `verify` needs. The API implements these against Crossref and OpenAlex. */
export interface Lookups {
  /** The Crossref record for a DOI, or null when there is no such DOI. Throws when Crossref cannot be reached. */
  crossrefByDoi(doi: string): Promise<Candidate | null>;
  /** Crossref's best matches for a free-text reference. Throws when Crossref cannot be reached. */
  crossrefSearch(query: string): Promise<Candidate[]>;
  /** OpenAlex's best matches for a title, or null when OpenAlex is unavailable. Must not throw. */
  openalexSearch(query: string): Promise<Candidate[] | null>;
  /** Retraction flag and venue info from OpenAlex. `ven` is null when unavailable. Must not throw. */
  enrich(doi: string): Promise<Enrichment>;
  /** Whether Crossref lists a retraction notice that updates this DOI. Must not throw. */
  crossrefRetractionNotice(doi: string): Promise<boolean>;
}

const REPOST_NOTE =
  'We found this title, but only as a much later repost or preprint, so we could not confirm the original publication details. Check it yourself before citing.';

interface Scored {
  c: Candidate;
  s: MatchScore;
}

/** The best-scoring candidate. The current leader keeps its place unless another scores strictly higher. */
function pickBest(p: ReturnType<typeof parse>, cands: Candidate[], current: Scored | null): Scored | null {
  let top = current;
  for (const c of cands) {
    const s = score(p, c);
    if (!top || s.total > top.s.total) top = { c, s };
  }
  return top;
}

/** Decide whether a matched record is retracted, and attach venue info to it along the way. */
async function checkRetraction(c: Candidate, lk: Lookups): Promise<boolean> {
  const e = c.doi ? await lk.enrich(c.doi) : null;
  if (e && e.ven) c.ven = e.ven;
  if (e?.lang && !c.lang) c.lang = e.lang;
  if (e?.abstract && !c.abstract) c.abstract = e.abstract;
  if (c.retracted) return true;
  if (!c.doi) return false;
  if (await lk.crossrefRetractionNotice(c.doi)) return true;
  return !!(e && e.retracted);
}

/** Look one reference up and decide whether it is real, correct, and not retracted. */
export async function verify(raw: string, lk: Lookups): Promise<RefResult> {
  const p = parse(raw);
  const cands: Candidate[] = [];

  let doiLookupFailed: unknown = null;
  if (p.doi) {
    try {
      const byDoi = await lk.crossrefByDoi(p.doi);
      if (byDoi) cands.push(byDoi);
    } catch (e) {
      // Carry on with a text search, but remember: without this answer we cannot say the reference is made up.
      doiLookupFailed = e ?? new Error('DOI lookup failed');
    }
  }
  const q = raw.replace(/https?:\/\/\S+|10\.\d{4,9}\/\S+/g, '').slice(0, 400);
  if (q.replace(/\W/g, '').length > 15) {
    cands.push(...(await lk.crossrefSearch(q)).filter((c) => c.title));
  }

  let top = pickBest(p, cands, null);

  // Crossref had nothing convincing: try OpenAlex, which indexes more preprints and regional journals.
  if (!top || top.s.total < SCORING.askOpenAlexBelow) {
    const t = (p.title || q).slice(0, 250);
    const oa = t.trim() ? await lk.openalexSearch(t) : null;
    if (oa) cands.push(...oa.filter((c) => c.title));
    top = pickBest(p, cands, top);
  }
  // Crossref found the title but the details disagree: see whether OpenAlex has a record that agrees better.
  if (top && top.s.tSim >= SCORING.sameTitle && diffs(p, top.c).length && !cands.some((c) => c.source === 'OpenAlex')) {
    const oa = await lk.openalexSearch((p.title || top.c.title).slice(0, 250));
    if (oa) cands.push(...oa.filter((c) => c.title));
  }
  // Among strong title matches, prefer the record that agrees with the citation most.
  if (top && top.s.tSim >= SCORING.sameTitle) {
    const floor = top.s.total - SCORING.sameTitleWindow;
    const strong = cands.map((c) => ({ c, s: score(p, c) })).filter((x) => x.s.tSim >= SCORING.sameTitle && x.s.total >= floor);
    const cost = SCORING.disagreement;
    const disagreement = (c: Candidate) =>
      (p.year && c.year && c.year - p.year > SCORING.repost.yearsLater ? cost.muchLater : 0) +
      (c.type === 'posted-content' ? cost.preprint : 0) +
      diffs(p, c).reduce((n, d) => n + (/Authors|Year/.test(d.field) ? cost.authorsOrYear : cost.otherDetail), 0) -
      Math.log10(1 + (c.cites || 0)) * cost.perTenfoldCitations;
    strong.sort((x, y) => disagreement(x.c) - disagreement(y.c));
    if (strong.length) top = strong[0]!;
  }

  if (!top || top.s.total < SCORING.accept || (top.s.tSim < SCORING.titleFloor && !top.s.doiOk)) {
    if (doiLookupFailed) throw doiLookupFailed;
    return {
      raw,
      verdict: 'not_found',
      confidence: top ? top.s.total : 0,
      note: top
        ? `Closest record in Crossref/OpenAlex is a different work ("${top.c.title}"), title similarity ${(top.s.tSim * 100) | 0}%. No real publication matches this citation.`
        : 'No candidate records found.',
      match: null,
    };
  }
  const found = top.c;
  const s = top.s;

  const retracted = await checkRetraction(found, lk);
  const all = diffs(p, found);

  // How the title's words are really written. The abstract shows it; so does any other copy of the same title
  // written in sentence case, whether the author's own or a second database record. With that, the title can
  // be put in sentence case without losing the capitals of names.
  const evidence = evidenceFromText(found.abstract);
  namesFromTitle(p.title, evidence);
  const sameTitle = norm(found.title);
  for (const c of cands) if (c !== found && norm(c.title) === sameTitle) namesFromTitle(c.title, evidence);
  found.titleSentence = sentenceCase(found.title, { evidence, lang: found.lang });

  const res: RefResult = { raw, verdict: 'verified', confidence: s.total, diffs: all, apa: apa(found, { evidence }), match: toMatch(found) };

  if (!retracted && all.some((d) => d.suspect)) {
    // Keep the author's year in the APA entry, and list the real differences before the suspect one.
    res.apa = apa({ ...found, year: p.year ?? null }, { evidence });
    res.diffs = all.filter((d) => !d.suspect).concat(all.filter((d) => d.suspect));
    res.confidence = Math.min(s.total, 0.6);
    res.verdict = 'uncertain';
    res.note = REPOST_NOTE;
    return res;
  }
  res.verdict = retracted ? 'retracted' : all.length ? 'correction' : 'verified';
  return res;
}
