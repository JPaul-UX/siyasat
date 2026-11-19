/*
 * Writing a matched record out as a reference in a chosen citation style.
 *
 * A style is three decisions, and each has its own file or section:
 *   - how names, dates and numbers are arranged (this file);
 *   - how the title is capitalised: sentence case or title case (casing.ts);
 *   - whether the journal is named in full or by its abbreviation (journals.ts).
 *
 * The record is what the databases hold about the work. For a journal article that is everything a
 * reference needs. For a book, a chapter or a conference paper it includes the publisher, and the place and
 * the editors when the database has them; what it does not have is left out rather than invented.
 *
 * These return text in which <i>…</i> marks what the style sets in italics.
 */
import { namesFromTitle, noEvidence, sentenceCase, titleCase, type CaseEvidence } from './casing.js';
import { abbreviateJournal, isAbbreviated, withoutStops, withStops } from './journals.js';
import { parse } from './parse.js';
import { tidyPerson } from './text.js';
import type { Author, Match, RefResult } from './types.js';

export type CitationStyle = 'apa' | 'mla' | 'chicago' | 'harvard' | 'ieee' | 'vancouver';

export interface StyleInfo {
  id: CitationStyle;
  name: string;
  /** The reference list is numbered in the order the sources are cited, instead of sorted by author. */
  numbered: boolean;
  /** How the number is written in front of an entry. */
  label?: (n: number) => string;
  /** How the style capitalises the title of an article. */
  titles: 'sentence' | 'title';
  /** Whether the style names journals by their abbreviation. */
  abbreviates: boolean;
}

export const CITATION_STYLES: readonly StyleInfo[] = [
  { id: 'apa', name: 'APA 7', numbered: false, titles: 'sentence', abbreviates: false },
  { id: 'mla', name: 'MLA 9', numbered: false, titles: 'title', abbreviates: false },
  { id: 'chicago', name: 'Chicago (author-date)', numbered: false, titles: 'title', abbreviates: false },
  { id: 'harvard', name: 'Harvard', numbered: false, titles: 'sentence', abbreviates: false },
  { id: 'ieee', name: 'IEEE', numbered: true, label: (n) => `[${n}]`, titles: 'sentence', abbreviates: true },
  { id: 'vancouver', name: 'Vancouver', numbered: true, label: (n) => `${n}.`, titles: 'sentence', abbreviates: true },
];

export const styleInfo = (id: CitationStyle): StyleInfo => CITATION_STYLES.find((s) => s.id === id) ?? CITATION_STYLES[0]!;

/** What a formatter needs to know about a work. A stored match has all of it. */
export type Citable = Pick<Match, 'authors' | 'year' | 'title' | 'venue' | 'volume' | 'issue' | 'pages' | 'doi'> &
  Partial<Pick<Match, 'type' | 'publisher' | 'place' | 'editors' | 'lang' | 'titleSentence' | 'venueShort' | 'venueNlm'>>;

export interface FormatOptions {
  /** What is known about how the title's words are written, beyond what the record carries. */
  evidence?: CaseEvidence;
}

/* ---------- What kind of work it is ---------- */

type Kind = 'article' | 'book' | 'chapter' | 'conference' | 'preprint';

function kindOf(c: Citable): Kind {
  const t = c.type || '';
  if (/posted-content|preprint/.test(t)) return 'preprint';
  // A paper or a chapter is cited inside the book it is in. Without that book's name it can only stand alone.
  if (/proceedings-article|conference-paper/.test(t)) return c.venue ? 'conference' : 'book';
  if (/chapter|book-section|book-part|reference-entry/.test(t)) return c.venue ? 'chapter' : 'book';
  if (/^(book|monograph|edited-book|reference-book|report|dissertation|thesis|proceedings|standard)/.test(t)) return 'book';
  // Nothing it appeared in: it stands on its own, like a book.
  return c.venue ? 'article' : 'book';
}

/** A whole volume of proceedings is titled with the conference's name, which keeps its capitals in every style. */
const titleIsAName = (c: Citable) => /^proceedings$/.test(c.type || '');

/* ---------- Pieces ---------- */

const named = (people?: Author[]) => (people || []).filter((a) => a.family).map(tidyPerson);
const initials = (given: string) =>
  given
    .split(/[\s.-]+/)
    .filter(Boolean)
    .map((g) => g[0]!.toUpperCase());

/** "Yann LeCun" */
const natural = (a: Author) => (a.given ? a.given + ' ' : '') + a.family;
/** "LeCun, Yann" */
const inverted = (a: Author) => a.family + (a.given ? ', ' + a.given : '');
/** "Y. LeCun" */
const initialsFirst = (a: Author) => (a.given ? initials(a.given).map((i) => i + '.').join(' ') + ' ' : '') + a.family;
/** "LeCun, Y." (APA puts a space between initials, Harvard does not) */
const initialsLast = (a: Author, gap = ' ') => a.family + (a.given ? ', ' + initials(a.given).map((i) => i + '.').join(gap) : '');
/** "LeCun Y" */
const bareInitials = (a: Author) => a.family + (a.given ? ' ' + initials(a.given).join('') : '');

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
const joined = (parts: (string | number | false | null | undefined)[], by = ', ') => parts.filter(Boolean).join(by);

/** A page range with an en dash: "436–444". */
const pageRange = (pages?: string) => {
  const range = String(pages || '').replace(/\s/g, '').replace(/-+/, '–');
  const [first, last] = range.split('–');
  // Databases write a single page as "5–5".
  return first && first === last ? first : range;
};
const isRange = (pages: string) => /[–-]/.test(pages);
const pp = (pages: string) => `${isRange(pages) ? 'pp.' : 'p.'} ${pages}`;

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

/** "Cambridge, MA: MIT Press", or whichever half is known. */
const imprint = (c: Citable) => joined([c.place, c.publisher], ': ');

/* ---------- Titles and journal names ---------- */

interface Words {
  /** The work's title in sentence case. `subtitle` says whether the word after a colon gets a capital. */
  sentence(subtitle?: 'capital' | 'lower'): string;
  /** The work's title in title case. */
  title(rules: 'mla' | 'chicago'): string;
  /** The name of what the work is in, in title case: a book's or a proceedings' title. */
  container(rules: 'mla' | 'chicago'): string;
  /** The journal's abbreviation, with or without ISO 4's full stops. */
  journal(stops: boolean): string;
}

function wordsOf(c: Citable, options: FormatOptions): Words {
  const evidence = options.evidence ?? noEvidence();
  // A title the API has already put in sentence case, using the abstract, is the better starting point.
  const base = cleanTitle(c.titleSentence || c.title);
  return {
    sentence: (subtitle = 'capital') => (titleIsAName(c) ? base : sentenceCase(base, { evidence, lang: c.lang, subtitle })),
    title: (rules) => (titleIsAName(c) ? base : titleCase(base, { evidence, lang: c.lang, rules })),
    container: (rules) => titleCase(c.venue, { rules }),
    journal: (stops) => {
      // The catalogued abbreviation, else the publisher's own, else the standard's rules.
      const short = c.venueNlm || (isAbbreviated(c.venueShort, c.venue) ? c.venueShort! : abbreviateJournal(c.venue));
      return stops ? withStops(short, c.venue) : withoutStops(short);
    },
  };
}

/* ---------- APA 7 ---------- */

function apa7(c: Citable, o: FormatOptions): string {
  const w = wordsOf(c, o);
  const au = named(c.authors).map((a) => initialsLast(a));
  // Up to twenty authors are listed; beyond that, the first nineteen, an ellipsis, and the last.
  const who =
    au.length === 0 ? '' : au.length === 1 ? au[0]! : au.length <= 20 ? au.slice(0, -1).join(', ') + ', & ' + au[au.length - 1] : au.slice(0, 19).join(', ') + ', … ' + au[au.length - 1];
  const head = (who ? who + ' ' : '') + `(${c.year || 'n.d.'}). `;
  const doi = c.doi ? ` ${doiUrl(c.doi)}` : '';
  const title = w.sentence();
  const pages = pageRange(c.pages);
  const kind = kindOf(c);

  if (kind === 'book') return head + `<i>${stop(title)}</i>` + (c.publisher ? ` ${stop(c.publisher)}` : '') + doi;
  if (kind === 'preprint') return head + `<i>${stop(title)}</i>` + (c.venue || c.publisher ? ` ${stop(c.venue || c.publisher!)}` : '') + doi;
  if (kind === 'chapter' || kind === 'conference') {
    const eds = named(c.editors).map(initialsFirst);
    const edited = eds.length ? `${series(eds, '&')} (${eds.length > 1 ? 'Eds.' : 'Ed.'}), ` : '';
    return head + stop(title) + ` In ${edited}<i>${c.venue}</i>` + (pages ? ` (${pp(pages)})` : '') + '.' + (c.publisher ? ` ${stop(c.publisher)}` : '') + doi;
  }
  let s = head + stop(title);
  if (c.venue) {
    s += ` <i>${c.venue}</i>`;
    if (c.volume) s += `, <i>${c.volume}</i>`;
    if (c.issue) s += `(${c.issue})`;
    if (pages) s += `, ${pages}`;
    s += '.';
  }
  return s + doi;
}

/* ---------- MLA 9 ---------- */

function mla(c: Citable, o: FormatOptions): string {
  const w = wordsOf(c, o);
  const au = named(c.authors);
  const who =
    au.length === 0 ? '' : au.length === 1 ? inverted(au[0]!) : au.length === 2 ? `${inverted(au[0]!)}, and ${natural(au[1]!)}` : `${inverted(au[0]!)}, et al`;
  const head = who ? stop(who) + ' ' : '';
  const title = w.title('mla');
  const pages = pageRange(c.pages);
  const link = c.doi && doiUrl(c.doi);
  const kind = kindOf(c);

  const after = (rest: string) => (rest ? ` ${rest}.` : '');
  if (kind === 'book') return head + `<i>${stop(title)}</i>` + after(joined([c.publisher, c.year, link]));
  const quoted = `“${stop(title)}”`;
  if (kind === 'chapter' || kind === 'conference') {
    const eds = named(c.editors).map(natural);
    return head + quoted + after(joined([`<i>${w.container('mla')}</i>`, eds.length && `edited by ${series(eds)}`, c.publisher, c.year, pages && pp(pages), link]));
  }
  // A preprint has no journal; the server that holds it stands in its place.
  const where = c.venue ? `<i>${c.venue}</i>` : c.publisher;
  return head + quoted + after(joined([where, c.volume && `vol. ${c.volume}`, c.issue && `no. ${c.issue}`, c.year, pages && pp(pages), link]));
}

/* ---------- Chicago 17, author-date ---------- */

function chicago(c: Citable, o: FormatOptions): string {
  const w = wordsOf(c, o);
  const au = named(c.authors);
  // Up to ten authors are listed; beyond that, the first seven and "et al."
  const listed = au.length > 10 ? au.slice(0, 7) : au;
  const names = listed.map((a, i) => (i === 0 ? inverted(a) : natural(a)));
  // The first name is turned round, so a comma closes it even when only two are listed: "LeCun, Yann, and Yoshua Bengio".
  const who = au.length > 10 ? names.join(', ') + ', et al' : names.length === 2 ? `${names[0]}, and ${names[1]}` : series(names);
  const head = (who ? stop(who) + ' ' : '') + `${stop(String(c.year || 'n.d.'))} `;
  const title = w.title('chicago');
  const pages = pageRange(c.pages);
  const link = c.doi ? ` ${doiUrl(c.doi)}.` : '';
  const kind = kindOf(c);

  if (kind === 'book') return head + `<i>${stop(title)}</i>` + (imprint(c) ? ` ${imprint(c)}.` : '') + link;
  const quoted = `“${stop(title)}”`;
  if (kind === 'chapter' || kind === 'conference') {
    const eds = named(c.editors).map(natural);
    return head + quoted + ' In ' + joined([`<i>${w.container('chicago')}</i>`, eds.length && `edited by ${series(eds)}`, pages]) + '.' + (imprint(c) ? ` ${imprint(c)}.` : '') + link;
  }
  let s = head + quoted;
  if (c.venue) {
    s += ` <i>${c.venue}</i>`;
    if (c.volume) s += ` ${c.volume}`;
    if (c.issue) s += c.volume ? ` (${c.issue})` : `, no. ${c.issue}`;
    if (pages) s += c.volume || c.issue ? `: ${pages}` : `, ${pages}`;
    s += '.';
  } else if (c.publisher) s += ` ${stop(c.publisher)}`;
  return s + link;
}

/* ---------- Harvard (Cite Them Right) ---------- */

function harvard(c: Citable, o: FormatOptions): string {
  const w = wordsOf(c, o);
  const name = (a: Author) => initialsLast(a, '');
  const au = named(c.authors);
  // One to three authors are all named; four or more become the first author and "et al."
  const who = au.length > 3 ? `${name(au[0]!)} <i>et al.</i>` : series(au.map(name), 'and', false);
  const head = (who ? who + ' ' : '') + `(${c.year || 'no date'}) `;
  const title = w.sentence('lower');
  const pages = pageRange(c.pages);
  const link = c.doi ? ` Available at: ${doiUrl(c.doi)}.` : '';
  const kind = kindOf(c);

  if (kind === 'book') return head + `<i>${stop(title)}</i>` + (imprint(c) ? ` ${imprint(c)}.` : '') + link;
  if (kind === 'chapter' || kind === 'conference') {
    const eds = named(c.editors).map(name);
    const edited = eds.length ? `${series(eds, 'and', false)} (${eds.length > 1 ? 'eds.' : 'ed.'}) ` : '';
    return head + `‘${title}’, in ${edited}<i>${c.venue}</i>. ` + joined([imprint(c), pages && pp(pages)]) + (imprint(c) || pages ? '.' : '') + link;
  }
  let s = head + `‘${title}’`;
  if (c.venue) {
    s += `, <i>${c.venue}</i>`;
    if (c.volume) s += `, ${c.volume}` + (c.issue ? `(${c.issue})` : '');
    else if (c.issue) s += `, (${c.issue})`;
    if (pages) s += `, ${pp(pages)}`;
  } else if (c.publisher) s += `. ${c.publisher}`;
  return stop(s) + link;
}

/* ---------- IEEE ---------- */

function ieee(c: Citable, o: FormatOptions): string {
  const w = wordsOf(c, o);
  const au = named(c.authors);
  // Up to six authors are listed; more than six become the first author and "et al."
  const who = au.length > 6 ? `${initialsFirst(au[0]!)} <i>et al.</i>` : series(au.map(initialsFirst));
  const head = who ? who + ', ' : '';
  const title = w.sentence();
  const pages = pageRange(c.pages);
  const kind = kindOf(c);

  if (kind === 'book') {
    const rest = joined([imprint(c), c.year, c.doi && `doi: ${c.doi}`]);
    return head + `<i>${w.title('chicago')}</i>.` + (rest ? ` ${rest}.` : '');
  }
  // The comma goes inside the quotation marks, unless the title ends in its own punctuation.
  const quoted = `“${title}${/[?!]$/.test(title) ? '' : ','}”`;
  if (kind === 'chapter') {
    const eds = named(c.editors).map(initialsFirst);
    const book = `<i>${w.container('chicago')}</i>` + (eds.length ? `, ${series(eds)}, ${eds.length > 1 ? 'Eds' : 'Ed'}.` : '');
    const rest = joined([imprint(c), c.year, pages && pp(pages), c.doi && `doi: ${c.doi}`]);
    return head + quoted + ' in ' + book + (eds.length ? ' ' : ', ') + rest + '.';
  }
  if (kind === 'conference') {
    return head + quoted + ' in ' + joined([`<i>${w.journal(true)}</i>`, c.year, pages && pp(pages), c.doi && `doi: ${c.doi}`]) + '.';
  }
  return head + quoted + ' ' + joined([c.venue ? `<i>${w.journal(true)}</i>` : c.publisher, c.volume && `vol. ${c.volume}`, c.issue && `no. ${c.issue}`, pages && pp(pages), c.year, c.doi && `doi: ${c.doi}`]) + '.';
}

/* ---------- Vancouver ---------- */

function vancouver(c: Citable, o: FormatOptions): string {
  const w = wordsOf(c, o);
  // The first six authors are listed, then "et al."
  const list = (people: Author[]) => people.slice(0, 6).map(bareInitials).join(', ') + (people.length > 6 ? ', et al' : '');
  const who = list(named(c.authors));
  const head = (who ? stop(who) + ' ' : '') + stop(w.sentence('lower'));
  const pages = elidedPages(c.pages);
  const doi = c.doi ? ` doi: ${c.doi}.` : '';
  const kind = kindOf(c);
  const published = joined([imprint(c), c.year], '; ');

  // A book, or a preprint that names no journal: who put it out, and when.
  if (kind === 'book' || !c.venue) return head + (published ? ` ${published}.` : '') + doi;
  if (kind === 'chapter' || kind === 'conference') {
    const eds = named(c.editors);
    const edited = eds.length ? `${list(eds)}, ${eds.length > 1 ? 'editors' : 'editor'}. ` : '';
    return head + ` In: ${edited}${stop(c.venue)}` + (published ? ` ${published}.` : '') + (pages ? ` p. ${pages}.` : '') + doi;
  }
  let s = head;
  if (c.venue) s += ` ${stop(w.journal(false))}`;
  if (c.year || c.volume || pages) {
    s += ` ${c.year || ''}`;
    if (c.volume || c.issue) s += `;${c.volume || ''}${c.issue ? `(${c.issue})` : ''}`;
    if (pages) s += `:${pages}`;
    s += '.';
  }
  return s + doi;
}

const FORMATTERS: Record<CitationStyle, (c: Citable, o: FormatOptions) => string> = { apa: apa7, mla, chicago, harvard, ieee, vancouver };

/** A reference for a record, in the given style. */
export function formatReference(record: Citable, style: CitationStyle, options: FormatOptions = {}): string {
  return (FORMATTERS[style] ?? apa7)(record, options);
}

/** An APA 7 reference for a record. */
export const apa = (record: Citable, options: FormatOptions = {}): string => apa7(record, options);

/* ---------- From a checked reference ---------- */

/**
 * What the author's own reference shows about which words of the title are names. Only a title they typed in
 * sentence case tells us anything: there, a capital in mid-sentence is deliberate.
 */
export function evidenceFromCitation(raw: string): CaseEvidence {
  return namesFromTitle(parse(raw).title);
}

/**
 * The corrected reference for a checked reference, in a citation style. Null when no real record was found
 * to write one from.
 */
export function correctedReference(r: RefResult, style: CitationStyle): string | null {
  if (!r.match || r.verdict === 'not_found' || r.verdict === 'error') return null;
  // Where the only record found is a later repost, the author's own year is kept.
  const kept = r.diffs?.find((d) => d.field === 'Year' && d.suspect);
  const year = kept ? Number(kept.cited) || r.match.year : r.match.year;
  return formatReference({ ...r.match, year }, style, { evidence: evidenceFromCitation(r.raw) });
}
