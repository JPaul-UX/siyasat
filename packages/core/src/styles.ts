/*
 * Writing a matched record out as a reference in a chosen citation style.
 *
 * The record is what the databases hold about the work: authors, year, title, venue, volume, issue, pages
 * and DOI. That is enough to write a journal article correctly in every style here. A book or a chapter comes
 * out with what is known (the databases do not give us its publisher or editors), so it needs a look.
 *
 * Like `apa`, these return text in which <i>…</i> marks what the style sets in italics.
 */
import { apa } from './match.js';
import type { Author, Match } from './types.js';

export type CitationStyle = 'apa' | 'mla' | 'chicago' | 'harvard' | 'ieee' | 'vancouver';

export interface StyleInfo {
  id: CitationStyle;
  name: string;
  /** The reference list is numbered in the order the sources are cited, instead of sorted by author. */
  numbered: boolean;
  /** How the number is written in front of an entry. */
  label?: (n: number) => string;
}

export const CITATION_STYLES: readonly StyleInfo[] = [
  { id: 'apa', name: 'APA 7', numbered: false },
  { id: 'mla', name: 'MLA 9', numbered: false },
  { id: 'chicago', name: 'Chicago (author-date)', numbered: false },
  { id: 'harvard', name: 'Harvard', numbered: false },
  { id: 'ieee', name: 'IEEE', numbered: true, label: (n) => `[${n}]` },
  { id: 'vancouver', name: 'Vancouver', numbered: true, label: (n) => `${n}.` },
];

export const styleInfo = (id: CitationStyle): StyleInfo => CITATION_STYLES.find((s) => s.id === id) ?? CITATION_STYLES[0]!;

/** What a formatter needs to know about a work. A stored match has all of it. */
export type Citable = Pick<Match, 'authors' | 'year' | 'title' | 'venue' | 'volume' | 'issue' | 'pages' | 'doi'>;

/* ---------- Pieces ---------- */

const named = (authors: Author[]) => (authors || []).filter((a) => a.family);
const initials = (given: string) =>
  given
    .split(/[\s.-]+/)
    .filter(Boolean)
    .map((g) => g[0]!.toUpperCase());

/** "Yann LeCun" */
const natural = (a: Author) => (a.given ? a.given + ' ' : '') + a.family;
/** "LeCun, Yann" */
const inverted = (a: Author) => a.family + (a.given ? ', ' + a.given : '');

/** Join names the way prose does: "A", "A and B", "A, B, and C". */
function series(items: string[], and = 'and', serialComma = true): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} ${and} ${items[1]}`;
  return items.slice(0, -1).join(', ') + (serialComma ? ', ' : ' ') + and + ' ' + items[items.length - 1];
}

const cleanTitle = (title: string) => title.replace(/^RETRACTED:\s*/i, '').trim();
/** Whether the text already ends a sentence, so that no full stop is added after it. */
const closed = (s: string) => /[.?!]$/.test(s);
const stop = (s: string) => (closed(s) ? s : s + '.');
const doiUrl = (doi: string) => `https://doi.org/${doi}`;

/** A page range with an en dash: "436–444". */
const pageRange = (pages?: string) => String(pages || '').replace(/\s/g, '').replace(/-+/, '–');
const isRange = (pages: string) => /[–-]/.test(pages);

/** A page range the way medical journals write it, without repeating leading digits: "436-44". */
function elidedPages(pages?: string): string {
  const m = pageRange(pages).match(/^(\d+)–(\d+)$/);
  if (!m) return pageRange(pages).replace('–', '-');
  const [, start, end] = m as unknown as [string, string, string];
  if (start.length !== end.length) return `${start}-${end}`;
  let same = 0;
  while (same < start.length - 1 && start[same] === end[same]) same++;
  return `${start}-${end.slice(same)}`;
}

/* ---------- The styles ---------- */

/** MLA 9: LeCun, Yann, et al. "Deep Learning." Nature, vol. 521, no. 7553, 2015, pp. 436–444, https://doi.org/… */
function mla(c: Citable): string {
  const au = named(c.authors);
  const who =
    au.length === 0 ? '' : au.length === 1 ? inverted(au[0]!) : au.length === 2 ? `${inverted(au[0]!)}, and ${natural(au[1]!)}` : `${inverted(au[0]!)}, et al`;
  const title = cleanTitle(c.title);
  const pages = pageRange(c.pages);
  let s = who ? stop(who) + ' ' : '';
  if (!c.venue) {
    // A work that stands on its own, such as a book: its title is in italics.
    const rest = [c.year, c.doi && doiUrl(c.doi)].filter(Boolean).join(', ');
    return s + `<i>${stop(title)}</i>` + (rest ? ' ' + rest + '.' : '');
  }
  s += `“${stop(title)}”`;
  const container = [
    `<i>${c.venue}</i>`,
    c.volume && `vol. ${c.volume}`,
    c.issue && `no. ${c.issue}`,
    c.year,
    pages && `${isRange(pages) ? 'pp.' : 'p.'} ${pages}`,
    c.doi && doiUrl(c.doi),
  ].filter(Boolean);
  return s + ' ' + container.join(', ') + '.';
}

/** Chicago 17, author-date: LeCun, Yann, Yoshua Bengio, and Geoffrey Hinton. 2015. "Deep Learning." Nature 521 (7553): 436–444. */
function chicago(c: Citable): string {
  const au = named(c.authors);
  // Up to ten authors are listed; beyond that, the first seven and "et al."
  const listed = au.length > 10 ? au.slice(0, 7) : au;
  const names = listed.map((a, i) => (i === 0 ? inverted(a) : natural(a)));
  const who = au.length > 10 ? names.join(', ') + ', et al' : series(names);
  const title = cleanTitle(c.title);
  const pages = pageRange(c.pages);
  let s = (who ? stop(who) + ' ' : '') + `${stop(String(c.year || 'n.d.'))} `;
  if (!c.venue) return s + `<i>${stop(title)}</i>` + (c.doi ? ` ${doiUrl(c.doi)}.` : '');
  s += `“${stop(title)}” <i>${c.venue}</i>`;
  if (c.volume) s += ` ${c.volume}`;
  if (c.issue) s += c.volume ? ` (${c.issue})` : `, no. ${c.issue}`;
  if (pages) s += c.volume || c.issue ? `: ${pages}` : `, ${pages}`;
  s += '.';
  if (c.doi) s += ` ${doiUrl(c.doi)}.`;
  return s;
}

/** Harvard (Cite Them Right): LeCun, Y., Bengio, Y. and Hinton, G. (2015) 'Deep learning', Nature, 521(7553), pp. 436–444. */
function harvard(c: Citable): string {
  const au = named(c.authors);
  const name = (a: Author) => a.family + (a.given ? ', ' + initials(a.given).map((i) => i + '.').join('') : '');
  // One to three authors are all named; four or more become the first author and "et al."
  const who = au.length > 3 ? `${name(au[0]!)} <i>et al.</i>` : series(au.map(name), 'and', false);
  const title = cleanTitle(c.title);
  const pages = pageRange(c.pages);
  let s = (who ? who + ' ' : '') + `(${c.year || 'no date'}) `;
  if (!c.venue) return s + `<i>${stop(title)}</i>` + (c.doi ? ` Available at: ${doiUrl(c.doi)}.` : '');
  s += `‘${title}’, <i>${c.venue}</i>`;
  if (c.volume) s += `, ${c.volume}` + (c.issue ? `(${c.issue})` : '');
  else if (c.issue) s += `, (${c.issue})`;
  if (pages) s += `, ${isRange(pages) ? 'pp.' : 'p.'} ${pages}`;
  s += '.';
  if (c.doi) s += ` Available at: ${doiUrl(c.doi)}.`;
  return s;
}

/** IEEE: Y. LeCun, Y. Bengio, and G. Hinton, "Deep learning," Nature, vol. 521, no. 7553, pp. 436–444, 2015, doi: 10.1038/… */
function ieee(c: Citable): string {
  const au = named(c.authors);
  const name = (a: Author) => (a.given ? initials(a.given).map((i) => i + '.').join(' ') + ' ' : '') + a.family;
  // Up to six authors are listed; more than six become the first author and "et al."
  const who = au.length > 6 ? `${name(au[0]!)} <i>et al.</i>` : series(au.map(name));
  const title = cleanTitle(c.title);
  const pages = pageRange(c.pages);
  if (!c.venue) {
    const rest = [c.year, c.doi && `doi: ${c.doi}`].filter(Boolean).join(', ');
    return (who ? who + ', ' : '') + `<i>${title}</i>` + (rest ? `. ${rest}.` : '.');
  }
  // The comma goes inside the quotation marks, unless the title ends in its own punctuation.
  const parts = [
    `<i>${c.venue}</i>`,
    c.volume && `vol. ${c.volume}`,
    c.issue && `no. ${c.issue}`,
    pages && `${isRange(pages) ? 'pp.' : 'p.'} ${pages}`,
    c.year,
    c.doi && `doi: ${c.doi}`,
  ].filter(Boolean);
  return (who ? who + ', ' : '') + `“${title}${/[?!]$/.test(title) ? '' : ','}” ` + parts.join(', ') + '.';
}

/** Vancouver: LeCun Y, Bengio Y, Hinton G. Deep learning. Nature. 2015;521(7553):436-44. doi: 10.1038/… */
function vancouver(c: Citable): string {
  const au = named(c.authors);
  const name = (a: Author) => a.family + (a.given ? ' ' + initials(a.given).join('') : '');
  // The first six authors are listed, then "et al."
  const who = au.slice(0, 6).map(name).join(', ') + (au.length > 6 ? ', et al' : '');
  const pages = elidedPages(c.pages);
  let s = (who ? stop(who) + ' ' : '') + stop(cleanTitle(c.title));
  if (c.venue) s += ` ${stop(c.venue)}`;
  if (c.year || c.volume || pages) {
    s += ` ${c.year || ''}`;
    if (c.volume || c.issue) s += `;${c.volume || ''}${c.issue ? `(${c.issue})` : ''}`;
    if (pages) s += `:${pages}`;
    s += '.';
  }
  if (c.doi) s += ` doi: ${c.doi}.`;
  return s;
}

const FORMATTERS: Record<CitationStyle, (c: Citable) => string> = { apa, mla, chicago, harvard, ieee, vancouver };

/** A reference for a record, in the given style. */
export function formatReference(record: Citable, style: CitationStyle): string {
  return (FORMATTERS[style] ?? apa)(record);
}
