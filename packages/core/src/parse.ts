/*
 * Reading one reference, in whatever citation style it was written, into the fields the checker compares:
 * authors' surnames, year, title, venue, volume, issue, pages and DOI.
 *
 * Styles differ in where they put the year, whether the title is in quotation marks, and how names are
 * written, so each family of styles is recognised by its own tell-tale shape:
 *
 *   APA        LeCun, Y., Bengio, Y., & Hinton, G. (2015). Deep learning. Nature, 521(7553), 436–444.
 *   Harvard    LeCun, Y., Bengio, Y. and Hinton, G. (2015) 'Deep learning', Nature, 521(7553), pp. 436–444.
 *   MLA        LeCun, Yann, et al. "Deep Learning." Nature, vol. 521, no. 7553, 2015, pp. 436–44.
 *   Chicago    LeCun, Yann, Yoshua Bengio, and Geoffrey Hinton. 2015. "Deep Learning." Nature 521 (7553): 436–44.
 *   IEEE       Y. LeCun, Y. Bengio, and G. Hinton, "Deep learning," Nature, vol. 521, no. 7553, pp. 436–444, 2015.
 *   Vancouver  LeCun Y, Bengio Y, Hinton G. Deep learning. Nature. 2015;521(7553):436-44.   (also AMA)
 *   ACS        LeCun, Y.; Bengio, Y.; Hinton, G. Deep Learning. Nature 2015, 521 (7553), 436–444.
 *
 * A reference in no recognisable shape still gets its DOI, year and first surname read, and is matched on
 * how much of a candidate's title appears in it.
 */
import type { ParsedRef } from './types.js';

/** A year a publication could plausibly carry. An issue number such as "(7553)" is not one. */
const YEAR = '(?:1[5-9]|20)\\d{2}';
const PAGES = '[A-Za-z]?\\d[\\dA-Za-z]*(?:\\s*[–-]\\s*[A-Za-z]?\\d[\\dA-Za-z]*)?';
const NAME = "[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+";
/** Lower-case words that belong to a surname: "van der Walt", "dela Cruz". */
const PARTICLES = '(?:van|von|de|del|dela|der|den|da|dos|du|la|le|di|bin|al)';

const tidyPages = (p: string) => p.replace(/\s/g, '').replace('-', '–');
const lastWord = (s: string) => s.trim().split(/\s+/).pop() || '';

/* ---------- Authors, by the way each style writes names ---------- */

/** "LeCun, Y., Bengio, Y., & Hinton, G.": a surname is whatever stands before ", X." (APA, Harvard, ACS). */
const surnamesBeforeInitials = (a: string) => a.match(/[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+(?=,\s*[A-Z]\.)/g) || [];

/** "Y. LeCun, Y. Bengio, and G. Hinton": a surname follows its initials (IEEE). */
const surnamesAfterInitials = (a: string) =>
  [...a.matchAll(new RegExp(`(?:[A-Z]\\.[\\s-]*)+((?:${PARTICLES}\\s+)*${NAME}(?:\\s+${NAME})*)`, 'g'))].map((m) => m[1]!);

/** "LeCun Y, Bengio Y, van der Walt SJ": a surname is followed by bare initials (Vancouver, AMA). */
const surnamesBeforeBareInitials = (a: string) =>
  [...a.matchAll(new RegExp(`((?:${PARTICLES}\\s+)*${NAME}(?:\\s+[A-ZÀ-Ý][a-zà-ÿ'’-]+)*)\\s+[A-Z]{1,3}(?=\\s*(?:[,;.]|$))`, 'g'))].map((m) => m[1]!);

/** "LeCun, Yann, Yoshua Bengio, and Geoffrey Hinton": the first author is inverted, the rest are not (MLA, Chicago). */
function surnamesInvertedFirst(a: string): string[] {
  const parts = a
    .replace(/,?\s*et al\.?\s*$/i, '')
    .split(/\s*,\s*(?:and\s+)?|\s+and\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return [];
  // parts[1] is the first author's given name; every later part is "Given Family".
  return [parts[0]!, ...parts.slice(2).map(lastWord)];
}

/* ---------- Volume, issue and pages ---------- */

/** "vol. 521, no. 7553, pp. 436–444" (MLA, IEEE). */
function labelled(s: string, r: ParsedRef): void {
  const vol = s.match(/\bvol(?:ume)?\.?\s*(\d+)/i);
  const no = s.match(/\b(?:no|issue)\.?\s*([\w-]+)/i);
  const pp = s.match(new RegExp(`\\bpp?\\.\\s*(${PAGES})`, 'i'));
  if (vol) r.volume = vol[1];
  if (no) r.issue = no[1];
  if (pp) r.pages = tidyPages(pp[1]!);
}

/** The first plausible year in a piece of text that is not part of a page range. */
function yearIn(s: string): number | undefined {
  const withoutPages = s.replace(new RegExp(`\\bpp?\\.\\s*${PAGES}`, 'gi'), ' ');
  const m = withoutPages.match(new RegExp(`\\b(${YEAR})\\b`));
  return m ? +m[1]! : undefined;
}

/** The venue's name at the start of what follows a title: everything before the first number or label. */
function leadingVenue(after: string): string | undefined {
  const s = after
    .replace(/^[\s,.;:]+/, '')
    .replace(/^in[:\s]+/i, '')
    .replace(/\s*\d[\s\S]*$/, '')
    .replace(/[\s,;:(]*\b(?:vol(?:ume)?|no|issue|pp?)\.?[\s,;:(]*$/i, '')
    .replace(/[\s,.;:(]+$/, '');
  return s.length > 1 ? s : undefined;
}

/* ---------- The shapes ---------- */

/** APA: "Authors (2015). Title. Venue, 521(7553), 436–444." */
function apaShape(raw: string, r: ParsedRef): boolean {
  const apa = raw.match(new RegExp(`^(.+?)\\s*\\((${YEAR})[a-z]?[^)]*\\)\\.?\\s*(.+?[.?!])\\s+(.*)$`));
  // A title in quotation marks before the year means the year belongs to the journal issue, not the authors.
  if (!apa || /[“"]/.test(apa[1]!)) return false;
  r.style = 'apa';
  r.authorsText = apa[1];
  r.title = apa[3]!.replace(/\.$/, '');
  r.rest = apa[4];
  // A title ending in "?" or "!" often continues with a subtitle before the venue.
  const sub = /[?!]$/.test(r.title) && r.rest!.match(/^([^.\d]{3,200}?)\.\s+(.*\d.*)$/);
  if (sub) {
    r.title += ' ' + sub[1];
    r.rest = sub[2];
  }
  r.surnames = surnamesBeforeInitials(r.authorsText!);
  const v = r.rest!.match(new RegExp(`^(.+?),\\s*(\\d+)\\s*(?:\\((\\w+)\\))?\\s*,\\s*(?:pp?\\.\\s*)?(${PAGES})`));
  if (v) {
    r.venue = v[1];
    r.volume = v[2];
    r.issue = v[3];
    r.pages = tidyPages(v[4]!);
  } else {
    r.venue = r.rest!.split(/[,.]/)[0];
  }
  return true;
}

/** Harvard: "Authors (2015) 'Title', Venue, 521(7553), pp. 436–444." */
function harvardShape(raw: string, r: ParsedRef): boolean {
  // The title's closing quotation mark is followed by punctuation, or has the comma inside it. A quoted
  // phrase that merely opens an APA title ("New normal" learning in schools) is followed by a word instead.
  const m = raw.match(new RegExp(`^(.+?)\\s*\\((${YEAR})[a-z]?[^)]*\\)[.,]?\\s*['‘“"](.+?)(?:[,.]['’”"]|['’”"](?=\\s*[,.;:]|\\s*$))(.*)$`));
  if (!m || /[“"‘]/.test(m[1]!)) return false;
  r.style = 'harvard';
  r.authorsText = m[1];
  r.year = +m[2]!;
  r.title = m[3];
  r.surnames = surnamesBeforeInitials(m[1]!);
  const after = m[4]!;
  const v = after.match(new RegExp(`^[\\s,]*(.+?),\\s*(\\d+)\\s*(?:\\(([\\w-]+)\\))?\\s*,\\s*(?:pp?\\.\\s*)?(${PAGES})`));
  if (v) {
    r.venue = v[1];
    r.volume = v[2];
    r.issue = v[3];
    r.pages = tidyPages(v[4]!);
  } else {
    r.venue = leadingVenue(after);
    labelled(after, r);
  }
  return true;
}

/** MLA, Chicago and IEEE put the title in double quotation marks, with the authors before it. */
function quotedShape(raw: string, r: ParsedRef): boolean {
  const q = raw.match(/^(.*?)[“"](.+?)[,.]?[”"](.*)$/);
  if (!q) return false;
  r.title = q[2];
  let authors = q[1]!.replace(/^\s*(\[\d{1,3}\]|\d{1,3}[.)])\s+/, '');
  const after = q[3]!;

  // Chicago author-date puts the year between the authors and the title: "Hinton. 2015."
  const authorYear = authors.match(new RegExp(`[.,]?\\s*\\(?(${YEAR})[a-z]?\\)?[.,]?\\s*$`));
  if (authorYear) authors = authors.slice(0, authorYear.index);
  authors = authors.replace(/[\s,.]+$/, '');
  if (authors) r.authorsText = authors;

  // Chicago: "Nature 521 (7553): 436–44." or "Nature 521, no. 7553 (2015): 436–44."
  const chicago = after.match(new RegExp(`^[\\s,.]*(.+?)\\s+(\\d+)\\s*(?:,\\s*no\\.\\s*([\\w-]+))?\\s*(?:\\(([^)]+)\\))?\\s*:\\s*(${PAGES})`));
  if (chicago) {
    r.style = 'chicago';
    r.venue = chicago[1]!.replace(/[\s,]+$/, '');
    r.volume = chicago[2];
    const inBrackets = chicago[4];
    const bracketYear = inBrackets?.match(new RegExp(`\\b(${YEAR})\\b`));
    r.issue = chicago[3] ?? (bracketYear ? undefined : inBrackets);
    r.pages = tidyPages(chicago[5]!);
    r.year = authorYear ? +authorYear[1]! : bracketYear ? +bracketYear[1]! : yearIn(after);
  } else {
    r.venue = leadingVenue(after);
    labelled(after, r);
    r.year = authorYear ? +authorYear[1]! : yearIn(after);
  }

  if (/^(?:[A-Z]\.[\s-]*)+[A-ZÀ-Ý]/.test(authors)) {
    r.style = 'ieee';
    r.surnames = surnamesAfterInitials(authors);
  } else {
    r.style ??= 'mla';
    r.surnames = /,\s*[A-Z]\./.test(authors) ? surnamesBeforeInitials(authors) : surnamesInvertedFirst(authors);
  }
  return true;
}

/** Vancouver and AMA: "Authors. Title. Journal. 2015;521(7553):436-44." */
function vancouverShape(body: string, r: ParsedRef): boolean {
  const m = body.match(new RegExp(`^(.+?)\\.\\s+(.+)\\.\\s+([^.]+?)\\.\\s*(${YEAR})[^;:]{0,14};\\s*(\\d+)\\s*(?:\\(([^)]+)\\))?\\s*:\\s*(${PAGES})`));
  if (!m) return false;
  r.style = 'vancouver';
  r.authorsText = m[1];
  r.title = m[2];
  r.venue = m[3];
  r.year = +m[4]!;
  r.volume = m[5];
  r.issue = m[6];
  r.pages = tidyPages(m[7]!);
  r.surnames = surnamesBeforeBareInitials(m[1]!);
  return true;
}

/** ACS: "LeCun, Y.; Bengio, Y.; Hinton, G. Deep Learning. Nature 2015, 521 (7553), 436–444." */
function acsShape(body: string, r: ParsedRef): boolean {
  const m = body.match(
    new RegExp(`^((?:[^;.]+,\\s*(?:[A-Z]\\.[\\s-]*)+;\\s*)*[^;.]+,\\s*(?:[A-Z]\\.[\\s-]*)+)\\s+(.+)\\.\\s+([^.]+?)\\s+(${YEAR}),\\s*(\\d+)\\s*(?:\\(([^)]+)\\))?\\s*,\\s*(${PAGES})`),
  );
  if (!m) return false;
  r.style = 'acs';
  r.authorsText = m[1]!.trim();
  r.title = m[2];
  r.venue = m[3];
  r.year = +m[4]!;
  r.volume = m[5];
  r.issue = m[6];
  r.pages = tidyPages(m[7]!);
  r.surnames = surnamesBeforeInitials(m[1]!);
  return true;
}

/** Author-date without brackets or quotation marks: "Authors. 2015. Title. Venue…" (CSE, Chicago books). */
function authorDateShape(body: string, r: ParsedRef): boolean {
  const m = body.match(new RegExp(`^(.+?)\\.\\s+(${YEAR})[a-z]?\\.\\s+(.+?)[.?!]\\s+(.*)$`));
  if (!m || /\d/.test(m[1]!)) return false;
  r.style = 'author-date';
  r.authorsText = m[1];
  r.year = +m[2]!;
  r.title = m[3];
  r.venue = leadingVenue(m[4]!);
  labelled(m[4]!, r);
  const a = m[1]!;
  r.surnames = /,\s*[A-Z]\./.test(a)
    ? surnamesBeforeInitials(a)
    : /\s[A-Z]{1,3}(?:,|$)/.test(a)
      ? surnamesBeforeBareInitials(a)
      : surnamesInvertedFirst(a);
  return true;
}

/** Pull the recognisable fields out of one reference, whatever citation style it is in. */
export function parse(raw: string): ParsedRef {
  const r: ParsedRef = { raw, surnames: [] };

  const d = raw.match(/10\.\d{4,9}\/[^\s"<>]+/i);
  if (d) r.doi = d[0].replace(/[.,;)\]]+$/, '');

  // The text without its list number, DOI and links, for the shapes that are read from end to end.
  const body = raw
    .replace(/^\s*(\[\d{1,3}\]|\d{1,3}[.)])\s+/, '')
    .replace(/\s*(?:https?:\/\/\S+|\bdoi:?\s*10\.\S+|\b10\.\d{4,9}\/\S+)/gi, '')
    .trim();

  const y = raw.match(new RegExp(`\\((${YEAR})[a-z]?\\)`)) || raw.match(/\b(19|20)\d{2}\b/);
  if (y) r.year = +(y[1]!.length === 4 ? y[1]! : y[0]);

  const recognised =
    harvardShape(raw, r) || apaShape(raw, r) || quotedShape(raw, r) || vancouverShape(body, r) || acsShape(body, r) || authorDateShape(body, r);

  if (!recognised || !r.surnames.length) {
    // No recognisable author list: at least take the word the reference starts with.
    const a = r.authorsText || body.split(/[.(]/)[0] || '';
    const first = a.match(/^[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+/);
    if (first) r.surnames = [first[0]];
  }
  r.surnames = r.surnames.map((s) => s.toLowerCase());
  return r;
}
