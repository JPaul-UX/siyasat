import type { ParsedRef } from './types.js';

/** Pull the recognisable fields out of one reference, whatever citation style it is in. */
export function parse(raw: string): ParsedRef {
  const r: ParsedRef = { raw, surnames: [] };

  const d = raw.match(/10\.\d{4,9}\/[^\s"<>]+/i);
  if (d) r.doi = d[0].replace(/[.,;)\]]+$/, '');

  const y = raw.match(/\((\d{4})[a-z]?\)/) || raw.match(/\b(19|20)\d{2}\b/);
  if (y) r.year = +(y[1]!.length === 4 ? y[1]! : y[0]);

  const apa = raw.match(/^(.+?)\s*\((\d{4})[a-z]?[^)]*\)\.?\s*(.+?[.?!])\s+(.*)$/);
  if (apa) {
    r.authorsText = apa[1];
    r.title = apa[3]!.replace(/\.$/, '');
    r.rest = apa[4];
    // A title ending in "?" or "!" often continues with a subtitle before the venue.
    const sub = /[?!]$/.test(r.title) && r.rest!.match(/^([^.\d]{3,200}?)\.\s+(.*\d.*)$/);
    if (sub) {
      r.title += ' ' + sub[1];
      r.rest = sub[2];
    }
  } else {
    const q = raw.match(/[“"](.+?)[,.]?[”"]/);
    if (q) r.title = q[1];
  }

  const a = r.authorsText || raw.split(/[.(]/)[0] || '';
  r.surnames = (a.match(/[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+(?=,\s*[A-Z]\.)/g) || []).map((s) => s.toLowerCase());
  if (!r.surnames.length) {
    const m = a.match(/^[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+/);
    if (m) r.surnames = [m[0].toLowerCase()];
  }

  if (r.rest) {
    const v = r.rest.match(/^(.+?),\s*(\d+)\s*(?:\((\w+)\))?\s*,\s*([\dA-Za-z]+(?:\s*[–-]\s*[\dA-Za-z]+)?)/);
    if (v) {
      r.venue = v[1];
      r.volume = v[2];
      r.issue = v[3];
      r.pages = v[4]!.replace(/\s/g, '').replace('-', '–');
    } else {
      r.venue = r.rest.split(/[,.]/)[0];
    }
  }
  return r;
}
