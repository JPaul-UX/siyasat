/* Turning Crossref and OpenAlex records into candidates, and comparing a candidate with what the author wrote. */
import { coverage, norm, sim, toks } from './text.js';
import type { Candidate, Diff, Match, MatchScore, ParsedRef, RefResult, Verdict, VenueInfo, VerdictCounts } from './types.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- the upstream records are loosely shaped JSON */
type Json = any;

/** Venue and open-access signals from an OpenAlex work. Fails soft: any field may be missing. */
export function venueInfo(w: Json): VenueInfo | null {
  if (!w) return null;
  const src = (w.primary_location && w.primary_location.source) || {};
  const oa = w.open_access || {};
  const pdf =
    (w.best_oa_location && (w.best_oa_location.pdf_url || w.best_oa_location.landing_page_url)) || oa.oa_url || '';
  return {
    name: src.display_name || '',
    publisher: src.host_organization_name || '',
    type: src.type || '',
    doaj: !!src.is_in_doaj,
    oaVenue: !!src.is_oa,
    isOa: !!oa.is_oa,
    oaUrl: pdf,
    cites: w.cited_by_count,
  };
}

export function fromCrossref(w: Json): Candidate {
  const title: string = (w.title || [''])[0];
  const issued = w.issued || w['published-print'] || w['published-online'] || {};
  return {
    source: 'Crossref',
    doi: (w.DOI || '').toLowerCase(),
    title,
    authors: (w.author || []).map((a: Json) => ({ family: a.family || a.name || '', given: a.given || '' })),
    year: (issued['date-parts'] || [[null]])[0][0],
    venue: (w['container-title'] || [''])[0],
    volume: w.volume,
    issue: w.issue,
    pages: (w.page || '').replace('-', '–'),
    type: w.type,
    cites: w['is-referenced-by-count'] || 0,
    retracted: !!(
      (w['updated-by'] || []).some((u: Json) => /retract/i.test(u.type)) || /^retracted\b/i.test(title)
    ),
  };
}

export function fromOpenAlex(w: Json): Candidate {
  const b = w.biblio || {};
  return {
    source: 'OpenAlex',
    doi: (w.doi || '').replace('https://doi.org/', '').toLowerCase(),
    title: w.title || '',
    authors: (w.authorships || []).map((a: Json) => {
      const name: string = (a.author && a.author.display_name) || '';
      const parts = name.trim().split(/\s+/);
      return { family: parts.pop() || '', given: parts.join(' ') };
    }),
    year: w.publication_year,
    venue: (w.primary_location && w.primary_location.source && w.primary_location.source.display_name) || '',
    volume: b.volume,
    issue: b.issue,
    pages: b.first_page ? b.first_page + (b.last_page && b.last_page !== b.first_page ? '–' + b.last_page : '') : '',
    retracted: !!w.is_retracted,
    type: w.type,
    cites: w.cited_by_count || 0,
    ven: venueInfo(w),
  };
}

/** Words that lead into a surname without being a name of their own: "van der Walt", "dela Cruz". */
const PARTICLES = new Set('de del dela della der den des di da das do dos du el la las le los san santa st ten ter van von bin ibn al'.split(' '));

/**
 * Whether a surname as cited is the family name on a record. Compound surnames are written and indexed in
 * more than one way, so these count as the same name:
 *  - with or without its particles: "Cruz" for "Dela Cruz", "Walt" for "van der Walt";
 *  - a double surname by its first part: "García" for "García Márquez".
 * A stray initial in the record ("N.Gomez") is treated like a particle. "Smith" is not "Walker-Smith".
 */
function sameSurname(cited: string, family: string): boolean {
  const a = norm(cited).split(' ').filter(Boolean);
  const b = norm(family).split(' ').filter(Boolean);
  if (!a.length || !b.length) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  const extra = long.length - short.length;
  const startsWith = short.every((w, i) => long[i] === w);
  const endsWith = short.every((w, i) => long[extra + i] === w);
  return startsWith || (endsWith && long.slice(0, extra).every((w) => PARTICLES.has(w) || w.length === 1));
}
const cites = (p: ParsedRef, c: Candidate) => (s: string) => c.authors.some((a) => sameSurname(s, a.family));

/** "436–44" means 436–444: write a page range out in full so that both spellings compare equal. */
function fullPages(pages: string): string {
  const m = pages.replace(/\s/g, '').match(/^(\d+)[–-](\d+)$/);
  if (!m) return norm(pages);
  const [, start, end] = m as unknown as [string, string, string];
  return start + ' ' + (end.length < start.length ? start.slice(0, start.length - end.length) + end : end);
}

/**
 * How much of a venue as cited survives as the start of a word in the record's venue. Journals are often
 * cited by abbreviation ("N Engl J Med", "Proc. IEEE CVPR"), which shares few whole words with the full name.
 */
function abbreviates(cited: string, actual: string): number {
  const short = toks(cited);
  const long = toks(actual);
  if (!short.length || !long.length) return 0;
  return short.filter((w) => long.some((full) => full.startsWith(w))).length / short.length;
}

/** How well a candidate record matches the parsed reference. `total` is 0 to 1. */
export function score(p: ParsedRef, c: Candidate): MatchScore {
  const tSim = p.title ? sim(p.title, c.title) : coverage(c.title, p.raw);
  const aOk = p.surnames.length ? p.surnames.filter(cites(p, c)).length / p.surnames.length : 0.5;
  const yOk = p.year && c.year ? (Math.abs(p.year - c.year) === 0 ? 1 : Math.abs(p.year - c.year) <= 1 ? 0.6 : 0) : 0.5;
  const vOk = p.venue && c.venue ? Math.max(sim(p.venue, c.venue), coverage(c.venue, p.raw)) : 0.5;
  const doiOk = p.doi && c.doi && p.doi.toLowerCase() === c.doi ? 1 : 0;
  return {
    total: doiOk ? Math.max(0.9, tSim) : 0.6 * tSim + 0.2 * aOk + 0.1 * yOk + 0.1 * vOk,
    tSim,
    aOk,
    yOk,
    vOk,
    doiOk,
  };
}

const REPOST_NOTE =
  'The only record found is a much later repost or preprint. The original is probably not indexed, so your year may be right. Please double-check.';

/** The details that differ between what the author wrote and the official record. */
export function diffs(p: ParsedRef, c: Candidate): Diff[] {
  const out: Diff[] = [];

  if (p.surnames.length) {
    const miss = p.surnames.filter((s) => !cites(p, c)(s));
    if (miss.length || (c.authors[0] && !sameSurname(p.surnames[0]!, c.authors[0].family))) {
      out.push({
        field: 'Authors',
        cited: p.authorsText || p.surnames.join(', '),
        actual:
          c.authors
            .slice(0, 6)
            .map((a) => a.family + (a.given ? ', ' + a.given[0] + '.' : ''))
            .join('; ') + (c.authors.length > 6 ? ' et al.' : ''),
      });
    }
  }
  if (p.year && c.year && p.year !== c.year) {
    // A later year on a preprint or a barely-cited record usually means a repost, not a mistake by the author.
    const suspect =
      c.year > p.year &&
      (/^(posted-content|preprint|other|dataset)$/.test(c.type || '') || (c.year - p.year > 2 && (c.cites || 0) < 50));
    out.push({ field: 'Year', cited: String(p.year), actual: String(c.year), suspect, note: suspect ? REPOST_NOTE : '' });
  }
  if (p.title && sim(p.title, c.title) < 0.9) out.push({ field: 'Title', cited: p.title, actual: c.title });
  if (p.venue && c.venue && sim(p.venue, c.venue) < 0.6 && coverage(c.venue, p.raw) < 0.8 && abbreviates(p.venue, c.venue) < 0.6) {
    out.push({ field: 'Venue', cited: p.venue, actual: c.venue });
  }
  if (p.volume && c.volume && p.volume !== String(c.volume)) {
    out.push({ field: 'Volume', cited: p.volume, actual: String(c.volume) });
  }
  if (p.pages && c.pages && fullPages(p.pages) !== fullPages(c.pages)) out.push({ field: 'Pages', cited: p.pages, actual: c.pages });
  if (p.doi && c.doi && p.doi.toLowerCase() !== c.doi) out.push({ field: 'DOI', cited: p.doi, actual: c.doi });
  return out;
}

/** An APA 7 reference for a record. The venue and volume are wrapped in <i> tags. */
export function apa(c: Pick<Match, 'authors' | 'year' | 'title' | 'venue' | 'volume' | 'issue' | 'pages' | 'doi'>): string {
  const au = c.authors.filter((a) => a.family);
  const fmt = (a: { family: string; given: string }) =>
    a.family +
    (a.given
      ? ', ' +
        a.given
          .split(/[\s-]+/)
          .filter(Boolean)
          .map((g) => g[0]!.toUpperCase() + '.')
          .join(' ')
      : '');
  const A =
    au.length === 0
      ? ''
      : au.length === 1
        ? fmt(au[0]!)
        : au.length <= 20
          ? au.slice(0, -1).map(fmt).join(', ') + ', & ' + fmt(au[au.length - 1]!)
          : au.slice(0, 19).map(fmt).join(', ') + ', … ' + fmt(au[au.length - 1]!);
  let s = (A ? A + ' ' : '') + `(${c.year || 'n.d.'}). ${c.title.replace(/^RETRACTED:\s*/i, '')}${/[?!.]$/.test(c.title) ? '' : '.'}`;
  if (c.venue) {
    s += ` <i>${c.venue}</i>`;
    if (c.volume) s += `, <i>${c.volume}</i>`;
    if (c.issue) s += `(${c.issue})`;
    if (c.pages) s += `, ${c.pages}`;
    s += '.';
  }
  if (c.doi) s += ` https://doi.org/${c.doi}`;
  return s;
}

/** The parts of a candidate worth storing with a result. */
export function toMatch(c: Candidate): Match {
  const m: Match = {
    doi: c.doi,
    title: c.title,
    source: c.source,
    authors: (c.authors || []).slice(0, 40).map((a) => ({ family: a.family, given: a.given })),
    year: c.year,
    venue: c.venue,
    volume: c.volume,
    issue: c.issue,
    pages: c.pages,
    type: c.type,
  };
  if (c.ven !== undefined) m.ven = c.ven;
  return m;
}

export const emptyCounts = (): VerdictCounts => ({
  verified: 0,
  correction: 0,
  uncertain: 0,
  not_found: 0,
  retracted: 0,
  error: 0,
});

export function countVerdicts(results: readonly Pick<RefResult, 'verdict'>[]): VerdictCounts {
  const c = emptyCounts();
  for (const r of results) c[r.verdict] = (c[r.verdict] || 0) + 1;
  return c;
}

/** How much each verdict counts towards the integrity score, in tenths so the sum stays exact. */
const WEIGHT_TENTHS: Record<Verdict, number> = { verified: 10, correction: 6, uncertain: 7, retracted: 0, not_found: 0, error: 5 };

/** Integrity score from 0 to 100, from a tally of verdicts. */
export function integrityFromCounts(counts: Partial<VerdictCounts>): number {
  let n = 0;
  let tenths = 0;
  for (const [verdict, k] of Object.entries(counts) as [Verdict, number][]) {
    n += k;
    tenths += (WEIGHT_TENTHS[verdict] ?? 0) * k;
  }
  return n ? Math.round((10 * tenths) / n) : 0;
}

/** Integrity score from 0 to 100: 100 means every reference was found with correct details. */
export function integrity(results: readonly Pick<RefResult, 'verdict'>[]): number {
  return integrityFromCounts(countVerdicts(results));
}
