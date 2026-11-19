/* Text helpers: normalising, comparing, and splitting a pasted reference list into entries. */

/** Lower-case, strip accents, tags and punctuation, and collapse whitespace. */
export const norm = (s?: string | null): string =>
  (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const STOP = new Set('a an the of and in on for to with by from at as is are or'.split(' '));

export const toks = (s?: string | null): string[] => norm(s).split(' ').filter((w) => w && !STOP.has(w));

/** Dice similarity of the two strings' word sets, from 0 to 1. */
export function sim(a?: string | null, b?: string | null): number {
  const A = toks(a);
  const B = toks(b);
  if (!A.length || !B.length) return 0;
  const sa = new Set(A);
  const sb = new Set(B);
  let shared = 0;
  sa.forEach((w) => {
    if (sb.has(w)) shared++;
  });
  return (2 * shared) / (sa.size + sb.size);
}

/** Share of the title's words that appear anywhere in the text. */
export function coverage(title?: string | null, text?: string | null): number {
  const T = [...new Set(toks(title))];
  const X = new Set(toks(text));
  if (!T.length) return 0;
  return T.filter((w) => X.has(w)).length / T.length;
}

/** Remove HTML-ish tags, for showing a record's title as plain text. */
export const stripTags = (s?: string | null): string => String(s ?? '').replace(/<[^>]+>/g, '');

/**
 * Normalise text pasted or extracted from PDFs and Word files: invisible characters, odd hyphens,
 * page breaks, and DOIs or URLs that wrap onto the next line.
 */
export function cleanText(input?: string | null): string {
  let t = String(input || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n')
    .replace(/[​-‍⁠﻿­]/g, '')
    .replace(/[‐‑]/g, '-')
    .replace(/[   ]/g, ' ');
  // A DOI or URL that wraps onto the next line: glue it back together.
  for (let i = 0; i < 3; i++) {
    t = t
      .replace(
        /((?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?10\.\d{4,9}\/[^\s"<>]*[-\/._=(])[ \t]*\n[ \t]*([A-Za-z0-9][^\s"<>]*)/g,
        '$1$2',
      )
      .replace(/(https?:\/\/[^\s"<>]*[-\/._=?&])[ \t]*\n[ \t]*([A-Za-z0-9][^\s"<>]*)/g, '$1$2');
  }
  return t;
}

const YEAR = /\((?:19|20)\d{2}[a-z]?(?:,[^)]*)?\)|\(n\.d\.\)|\b(?:19|20)\d{2}[a-z]?\.(?:\s|$)/;
const START =
  /^(?:[A-ZÀ-ÝÇŠŽ][\p{L}'’-]+(?:\s+(?:[A-ZÀ-Ý][\p{L}'’-]+|van|von|de|del|der|den|da|dos|du|la|le|di|y))*,\s*(?:[A-ZÀ-Ý]\.|[A-ZÀ-Ý][\p{L}'’-]+)|[A-ZÀ-Ý][\p{L}&'’ .-]{2,80}\.\s*\((?:19|20)\d{2})/u;
const NUM = /^\s*(\[\d{1,3}\]|\d{1,3}[.)])\s+/;
const HAS_DOI = /10\.\d{4,9}\//;
/** A line that is nothing but a DOI, bare or as a link. */
const DOI_ONLY = /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?10\.\d{4,9}\/\S+$/i;
/** Long enough, and dated or identified: text that can be a whole reference on its own, in any style. */
const standsAlone = (s: string) => s.length > 25 && (/\b(?:1[5-9]|20)\d{2}[a-z]?\b/.test(s) || HAS_DOI.test(s));

/** Split a reference list into entries, even when every line is hard-wrapped (as when copying from a PDF). */
export function splitEntries(input?: string | null): string[] {
  const txt = cleanText(input).trim();
  if (!txt) return [];
  const fin = (p: string) => p.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').replace(NUM, '').trim();
  const blocks = txt
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const complete = (b: string) => YEAR.test(b) || HAS_DOI.test(b);
  // References separated by blank lines: each block is one reference, however its lines are wrapped.
  if (blocks.length > 1 && blocks.filter(standsAlone).length >= blocks.length * 0.8) {
    return blocks.map(fin).filter((p) => p.length > 8);
  }
  const lines = txt
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const numbered = lines.filter((l) => NUM.test(l)).length >= Math.max(2, lines.length * 0.15);
  // One whole reference on each line, in any citation style: nearly every line stands alone.
  const written = lines.filter((l) => !DOI_ONLY.test(l));
  const perLine = written.length > 1 && written.filter(standsAlone).length >= written.length * 0.8;
  const out: string[] = [];
  let cur = '';
  for (const l of lines) {
    const isStart = numbered
      ? NUM.test(l)
      : DOI_ONLY.test(l)
        ? // A DOI on its own line belongs to the reference above it, unless that one already has a DOI.
          !!cur && HAS_DOI.test(cur)
        : perLine
          ? true
          : // Hard-wrapped text: only a line that begins like an author list starts a new reference.
            START.test(l) && (!cur || complete(cur));
    if (isStart && cur) {
      out.push(cur);
      cur = l;
    } else if (!cur) {
      cur = l;
    } else {
      // A URL or DOI broken across lines is joined without a space.
      const brokenLink =
        /[-\/]$/.test(cur) && /^[a-z0-9]/.test(l) && /\S+[-\/]$/.test(cur) && /(https?:|10\.\d)/.test(cur.split(' ').pop()!);
      cur = brokenLink ? cur + l : cur + ' ' + l;
    }
  }
  if (cur) out.push(cur);
  return out.map(fin).filter((p) => p.length > 8);
}

/** Small words inside a surname that are written in lower case: "van der Walt", "de la Cruz". */
const NAME_PARTICLES = new Set(['van', 'von', 'der', 'den', 'de', 'del', 'la', 'ter']);

/**
 * A person some databases hold in capitals ("RUMELHART, DAVID E.") written the usual way. A name that
 * already has lower-case letters is left alone, and so are initials.
 */
export function tidyPerson<T extends { family: string; given: string }>(person: T): T {
  const whole = `${person.family} ${person.given}`;
  if (/\p{Ll}/u.test(whole) || !/\p{Lu}{3}/u.test(whole)) return person;
  const tidy = (name: string) =>
    name.replace(/\p{L}{2,}/gu, (word, at: number) => {
      const lower = word.toLowerCase();
      if (NAME_PARTICLES.has(lower) && at + word.length < name.length) return lower;
      return word[0] + lower.slice(1);
    });
  return { ...person, family: tidy(person.family), given: tidy(person.given) };
}
