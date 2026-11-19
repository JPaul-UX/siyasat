/* Reading reference-manager exports (.ris, .bib, .csv) into one reference string per record. */

interface LibraryRecord {
  authors?: string[];
  year?: string;
  title?: string;
  venue?: string;
  volume?: string;
  pages?: string;
  doi?: string;
}

/** Write a record out as an APA-like reference, which is what the checker reads. */
function toRef(o: LibraryRecord): string {
  const initials = (name: string) => {
    const a = name.trim();
    let family: string;
    let given: string;
    if (a.includes(',')) {
      [family = '', given = ''] = a.split(/,\s*/);
    } else {
      const p = a.split(/\s+/);
      family = p.pop() || '';
      given = p.join(' ');
    }
    return (
      family +
      (given
        ? ', ' +
          given
            .split(/[\s.-]+/)
            .filter(Boolean)
            .map((x) => x[0]!.toUpperCase() + '.')
            .join(' ')
        : '')
    );
  };
  const A = (o.authors || []).slice(0, 20).map(initials);
  const au = A.length > 1 ? A.slice(0, -1).join(', ') + ', & ' + A[A.length - 1] : A.join('');
  let s = (au ? au + ' ' : '') + `(${o.year || 'n.d.'}). ${(o.title || '').replace(/[{}]/g, '')}.`;
  if (o.venue) s += ' ' + o.venue.replace(/[{}]/g, '') + (o.volume ? ', ' + o.volume : '') + (o.pages ? ', ' + o.pages : '') + '.';
  if (o.doi) s += ' https://doi.org/' + o.doi.replace(/^https?:\/\/doi\.org\//, '');
  return s;
}

/** A small CSV reader that understands quoted fields. */
export function parseCsv(t: string, sep = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (quoted) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

const RIS_START = /^\s*TY\s{1,2}-/m;

/** True when the text looks like a RIS or BibTeX export rather than prose. */
export const looksLikeLibrary = (text: string): boolean => RIS_START.test(text) || /@\w+\s*\{/.test(text);

function parseRis(t: string): string[] {
  const out: string[] = [];
  t.split(/^\s*(?=TY\s{1,2}-)/m).forEach((block) => {
    if (!/^TY\s{1,2}-/.test(block)) return;
    const o: LibraryRecord & { authors: string[]; ab?: string } = { authors: [] };
    let last: string | null = null;
    block.split('\n').forEach((line) => {
      const m = line.match(/^([A-Z][A-Z0-9])\s{1,2}-\s?(.*)$/);
      if (!m) {
        // A continuation line of a wrapped title or abstract.
        if (last && line.trim() && /^(TI|T1|AB)$/.test(last)) {
          if (last === 'AB') o.ab = (o.ab ?? '') + ' ' + line.trim();
          else o.title = (o.title ?? '') + ' ' + line.trim();
        }
        return;
      }
      const k = m[1]!;
      const v = m[2]!.trim();
      last = k;
      if (k === 'ER') return;
      if (k === 'AU' || k === 'A1') {
        if (v) o.authors.push(v);
      } else if (k === 'TI' || k === 'T1' || (k === 'CT' && !o.title)) o.title = o.title ? o.title : v;
      else if (/^(PY|Y1|DA|Y2)$/.test(k)) o.year = o.year || (v.match(/\b(1[5-9]|20)\d{2}\b/) || [])[0];
      else if (/^(JO|JF|T2|JA|J2|BT)$/.test(k)) o.venue = o.venue || v;
      else if (k === 'VL') o.volume = v;
      else if (k === 'SP') o.pages = v;
      else if (k === 'EP' && o.pages) o.pages = o.pages + '–' + v;
      else if (k === 'DO') o.doi = o.doi || v.replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
      else if ((k === 'UR' || k === 'L3' || k === 'M3' || k === 'N1') && !o.doi) {
        const d = v.match(/10\.\d{4,9}\/\S+/);
        if (d) o.doi = d[0];
      }
    });
    if (o.title || o.doi) out.push(toRef(o));
  });
  return out;
}

function parseBibtex(t: string): string[] {
  const out: string[] = [];
  t.split(/\n(?=\s*@)/).forEach((entry) => {
    if (!/@\w+\s*[{(]/.test(entry) || /^\s*@(comment|preamble|string)/i.test(entry)) return;
    const field = (k: string) => {
      const m =
        entry.match(new RegExp('\\b' + k + '\\s*=\\s*\\{((?:[^{}]|\\{(?:[^{}]|\\{[^{}]*\\})*\\})*)\\}', 'i')) ||
        entry.match(new RegExp('\\b' + k + '\\s*=\\s*"([^"]*)"', 'i')) ||
        entry.match(new RegExp('\\b' + k + '\\s*=\\s*(\\d+)', 'i'));
      return m ? m[1]!.replace(/\s+/g, ' ').trim() : '';
    };
    const author = field('author');
    const o: LibraryRecord = {
      title: field('title'),
      year: field('year') || (field('date').match(/\d{4}/) || [''])[0],
      venue: field('journal') || field('journaltitle') || field('booktitle'),
      volume: field('volume'),
      pages: field('pages').replace(/-+/, '–'),
      doi: field('doi').replace(/^https?:\/\/(dx\.)?doi\.org\//, ''),
      authors: author ? author.split(/\s+and\s+/i).map((a) => a.replace(/[{}]/g, '').trim()) : [],
    };
    if (o.title || o.doi) out.push(toRef(o));
  });
  return out;
}

function parseTable(t: string): string[] {
  const out: string[] = [];
  const first = t.split('\n')[0]!;
  const count = (re: RegExp) => (first.match(re) || []).length;
  const sep = count(/\t/g) > count(/,/g) ? '\t' : count(/;/g) > count(/,/g) ? ';' : ',';
  const rows = parseCsv(t, sep);
  if (rows.length < 2) return out;
  const head = rows[0]!.map((x) => x.toLowerCase().replace(/^"|"$/g, '').trim());
  const col = (re: RegExp) => head.findIndex((x) => re.test(x));
  const iT = col(/^(title|article title|document title|item title|primary title)$/);
  const iA = col(/^(authors?|author full names|creators?)$/);
  const iY = col(/(^year$|publication year|^py$|^date$|pubyear)/);
  const iV = col(/(source title|journal|publication title|^source$|^so$|book series title)/);
  const iD = col(/^doi$/);
  const iVol = col(/^volume$/);
  const iP = col(/^(pages|page start|start page)$/);
  if (iT < 0 && iD < 0) return out;
  rows.slice(1).forEach((r) => {
    const o: LibraryRecord = {
      title: r[iT],
      authors: iA >= 0 && r[iA] ? r[iA]!.split(/;\s*/) : [],
      year: iY >= 0 ? (String(r[iY]).match(/\d{4}/) || [])[0] : '',
      venue: iV >= 0 ? r[iV] : '',
      volume: iVol >= 0 ? r[iVol] : '',
      pages: iP >= 0 ? r[iP] : '',
      doi: iD >= 0 ? (r[iD] || '').replace(/^https?:\/\/(dx\.)?doi\.org\//, '') : '',
    };
    if (o.title || o.doi) out.push(toRef(o));
  });
  return out;
}

/**
 * Read a library export into reference strings. Understands RIS (Zotero, Mendeley, EndNote, databases),
 * BibTeX, and CSV or tab-separated files with a Title or DOI column.
 */
export function parseLibraryFile(name: string, text: string): string[] {
  const t = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (RIS_START.test(t)) return parseRis(t);
  if (/\.bib(tex)?$/i.test(name) || /@\w+\s*[{(]/.test(t)) return parseBibtex(t);
  return parseTable(t);
}
