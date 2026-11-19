/* Exports: spreadsheet (CSV), BibTeX, RIS, EndNote (.enw), and the screened library for reviews. */
import { correctedReference, styleInfo, type CitationStyle } from './styles.js';
import { stripTags } from './text.js';
import type { Match, RefResult, Verdict } from './types.js';

/** What the exporters need from a check. */
export interface Exportable {
  name: string;
  results: RefResult[];
}

type Matched = RefResult & { match: Match };

const good = (r: RefResult) => !!r.match && (r.verdict === 'verified' || r.verdict === 'correction');

/**
 * The matched records worth exporting, without duplicates. `screened` keeps only confirmed sources
 * ("Looks good" and "Fix details"); otherwise everything real and not retracted is kept.
 */
export function exportableRecords(c: Exportable, screened = false): Matched[] {
  const seen = new Set<string>();
  return c.results
    .filter((r): r is Matched => (screened ? good(r) : !!r.match && !['not_found', 'retracted', 'error'].includes(r.verdict)))
    .filter((r) => {
      const k = r.match.doi || r.match.title;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
}

const authors = (m: Match) => (m.authors || []).filter((a) => a.family);
const authorName = (a: { family: string; given: string }) => a.family + (a.given ? ', ' + a.given : '');
const risType = (t?: string) =>
  /book-chapter/.test(t || '')
    ? 'CHAP'
    : /book/.test(t || '')
      ? 'BOOK'
      : /proceedings/.test(t || '')
        ? 'CONF'
        : /posted|preprint/.test(t || '')
          ? 'UNPB'
          : 'JOUR';
const doiUrl = (m: Match) => (m.doi ? 'https://doi.org/' + m.doi : '');

type Field = [string, string | number | null | undefined];
const filled = (fields: Field[]) => fields.filter((f): f is [string, string | number] => !!f[1]);

function csvCell(value: unknown): string {
  const v = String(value == null ? '' : value);
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

const CSV_VERDICT: Record<Verdict, string> = {
  verified: 'Looks good (verified)',
  correction: 'Fix details (minor error)',
  uncertain: 'Double-check',
  not_found: 'AI-hallucination (not found in any database)',
  retracted: 'Retracted',
  error: "Couldn't check",
};

/**
 * Every reference and its verdict as a spreadsheet. The last column is the corrected reference, in the
 * citation style asked for.
 */
export function toCsv(c: Exportable, style: CitationStyle = 'apa'): string {
  const head = [
    '#', 'You wrote', 'Verdict', 'Overridden by you', 'Your note', 'Match confidence', 'DOI', 'DOI link', 'Title', 'Authors',
    'Year', 'Venue', 'Volume', 'Issue', 'Pages', 'Differences', 'Open-access link', styleInfo(style).name,
  ];
  const rows = c.results.map((r, i) => {
    const m: Partial<Match> = r.match || {};
    const v = m.ven || undefined;
    return [
      (r.i != null ? r.i : i) + 1,
      r.raw,
      CSV_VERDICT[r.verdict] || r.verdict,
      r.auto ? 'yes (was ' + (CSV_VERDICT[r.auto] || r.auto) + ')' : '',
      r.ovNote || '',
      r.confidence != null ? Math.round(r.confidence * 100) + '%' : '',
      m.doi || '',
      m.doi ? 'https://doi.org/' + m.doi : '',
      m.title || '',
      (m.authors || []).filter((a) => a.family).map(authorName).join('; '),
      m.year || '',
      m.venue || v?.name || '',
      m.volume || '',
      m.issue || '',
      m.pages || '',
      (r.diffs || []).map((d) => d.field + ': ' + d.cited + ' → ' + d.actual).join(' | '),
      v?.oaUrl || '',
      stripTags(correctedReference(r, style) ?? ''),
    ];
  });
  // The byte-order mark makes Excel read the file as UTF-8.
  return '﻿' + [head as unknown[]].concat(rows).map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function toBibtex(c: Exportable, screened = false): string {
  const used: Record<string, number> = {};
  return (
    exportableRecords(c, screened)
      .map((r) => {
        const m = r.match;
        let key = ((authors(m)[0] || { family: '' }).family || 'ref').replace(/[^A-Za-z]/g, '') + (m.year || '');
        used[key] = (used[key] || 0) + 1;
        if (used[key]! > 1) key += String.fromCharCode(95 + used[key]!);
        const t = risType(m.type);
        const type = t === 'BOOK' ? 'book' : t === 'CHAP' ? 'incollection' : t === 'CONF' ? 'inproceedings' : t === 'UNPB' ? 'unpublished' : 'article';
        const fields = filled([
          ['author', authors(m).map(authorName).join(' and ')],
          ['title', m.title],
          [type === 'article' ? 'journal' : 'booktitle', m.venue],
          ['year', m.year],
          ['volume', m.volume],
          ['number', m.issue],
          ['pages', String(m.pages || '').replace('–', '--')],
          ['doi', m.doi],
          ['url', doiUrl(m)],
        ]);
        return `@${type}{${key},\n${fields.map(([a, b]) => `  ${a} = {${String(b).replace(/[{}]/g, '')}}`).join(',\n')}\n}`;
      })
      .join('\n\n') + '\n'
  );
}

export function toRis(c: Exportable, screened = false): string {
  return (
    exportableRecords(c, screened)
      .map((r) => {
        const m = r.match;
        const [sp, ep] = String(m.pages || '').split(/[–-]/);
        const lines: Field[] = [['TY', risType(m.type)]];
        authors(m).forEach((a) => lines.push(['AU', authorName(a)]));
        lines.push(['TI', m.title], ['T2', m.venue], ['PY', m.year], ['VL', m.volume], ['IS', m.issue], ['SP', sp], ['EP', ep], ['DO', m.doi], ['UR', doiUrl(m)]);
        if (screened) lines.push(['N1', 'Screened by Siyasat: ' + (r.verdict === 'verified' ? 'verified' : 'real source, details corrected')]);
        return filled(lines).map(([a, b]) => `${a}  - ${b}`).join('\r\n') + '\r\nER  - ';
      })
      .join('\r\n\r\n') + '\r\n'
  );
}

export function toEndNote(c: Exportable): string {
  return (
    exportableRecords(c)
      .map((r) => {
        const m = r.match;
        const t = risType(m.type);
        const lines: Field[] = [['%0', t === 'BOOK' ? 'Book' : t === 'CHAP' ? 'Book Section' : t === 'CONF' ? 'Conference Proceedings' : 'Journal Article']];
        authors(m).forEach((a) => lines.push(['%A', authorName(a)]));
        lines.push(['%T', m.title], [t === 'JOUR' ? '%J' : '%B', m.venue], ['%D', m.year], ['%V', m.volume], ['%N', m.issue], ['%P', m.pages], ['%R', m.doi], ['%U', doiUrl(m)]);
        return filled(lines).map(([a, b]) => `${a} ${b}`).join('\n');
      })
      .join('\n\n') + '\n'
  );
}

export type ExportKind = 'csv' | 'bib' | 'ris' | 'enw' | 'screened';

export interface ExportFile {
  name: string;
  data: string;
  type: string;
}

/** Build the download for one export format. */
export function exportFile(kind: ExportKind, c: Exportable, style: CitationStyle = 'apa'): ExportFile {
  const base = `siyasat-${c.name.replace(/[^\w-]+/g, '-').slice(0, 40)}`;
  switch (kind) {
    case 'csv':
      return { name: base + '.csv', data: toCsv(c, style), type: 'text/csv;charset=utf-8' };
    case 'bib':
      return { name: base + '.bib', data: toBibtex(c), type: 'application/x-bibtex' };
    case 'ris':
      return { name: base + '.ris', data: toRis(c), type: 'application/x-research-info-systems' };
    case 'enw':
      return { name: base + '.enw', data: toEndNote(c), type: 'application/x-endnote-refer' };
    case 'screened':
      return { name: base + '-screened.ris', data: toRis(c, true), type: 'application/x-research-info-systems' };
  }
}
