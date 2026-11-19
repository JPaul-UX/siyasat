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

/** Split a reference list into entries, even when every line is hard-wrapped (as when copying from a PDF). */
export function splitEntries(input?: string | null): string[] {
  const txt = cleanText(input).trim();
  if (!txt) return [];
  const fin = (p: string) => p.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').replace(NUM, '').trim();
  const blocks = txt
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const complete = (b: string) => YEAR.test(b) || /10\.\d{4,9}\//.test(b);
  if (
    blocks.length > 1 &&
    blocks.filter((b) => complete(b) && b.length > 25 && (START.test(b) || NUM.test(b))).length >= blocks.length * 0.8
  ) {
    return blocks.map(fin).filter((p) => p.length > 8);
  }
  const lines = txt
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const numbered = lines.filter((l) => NUM.test(l)).length >= Math.max(2, lines.length * 0.15);
  const out: string[] = [];
  let cur = '';
  for (const l of lines) {
    const isStart = numbered ? NUM.test(l) : START.test(l) && (!cur || complete(cur));
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
