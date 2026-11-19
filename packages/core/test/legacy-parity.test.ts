/*
 * Parity with the original Siyasat engine.
 *
 * fixtures/legacy-golden.json holds what the original browser code produced for a set of inputs, together
 * with the Crossref and OpenAlex responses it saw. These tests check that the TypeScript port gives the same
 * answers, so a change here that alters a verdict is a deliberate one.
 *
 * Where the engine now does better than the original on purpose, the case is named below with the reason,
 * and citation-styles.test.ts says what is expected instead:
 *  - references in MLA and IEEE style are read in full (venue, volume, issue, pages, every author);
 *  - a compound surname matches with or without its particles ("van der Walt", "Walt");
 *  - a list of bare DOIs, one per line, is one reference per DOI.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  analyze,
  apa,
  closest,
  cleanText,
  compare,
  coverage,
  diffs,
  fromCrossref,
  fromOpenAlex,
  integrity,
  norm,
  parse,
  parseLibraryFile,
  score,
  sentences,
  sim,
  splitDraft,
  splitEntries,
  terms,
  toBibtex,
  toCsv,
  toEndNote,
  toRis,
  venueInfo,
  verify,
  type Candidate,
  type Lookups,
  type Segment,
} from '../src/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
const golden: any = JSON.parse(readFileSync(new URL('./fixtures/legacy-golden.json', import.meta.url), 'utf8'));

/** JSON round trip: drops undefined fields, the way the stored golden values did. */
const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x));

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** The original highlighter returned HTML; render segments the same way to compare. */
const toHtml = (segs: Segment[]) =>
  segs.map((s) => (s.m === 'n' ? `<mark class="num">${esc(s.t)}</mark>` : s.m === 'w' ? `<mark>${esc(s.t)}</mark>` : esc(s.t))).join('');

describe('reference parsing', () => {
  /** The original read these two only in part; see "reading other styles" in citation-styles.test.ts. */
  const READ_BETTER_NOW = ['Ji, Ziwei, et al.', '[12] K. He'];
  const apaLike: [string, string, any][] = golden.refs
    .map((raw: string, i: number) => [raw.slice(0, 60), raw, golden.parse[i]])
    .filter(([, raw]: [string, string, any]) => !READ_BETTER_NOW.some((start) => raw.startsWith(start)));

  it.each(apaLike)('parse: %s', (_n, raw, want) => {
    // `style` is new: the original did not say which style it had recognised.
    const { style: _style, ...fields } = plain(parse(raw));
    expect(fields).toEqual(want);
  });

  it.each(Object.entries(golden.split))('splitEntries: %s', (name, g: any) => {
    expect(cleanText(g.input)).toBe(g.clean);
    if (name === 'dois') {
      // The original ran a list of bare DOIs together into one reference.
      expect(g.entries).toHaveLength(1);
      expect(splitEntries(g.input)).toEqual(['10.1038/nature14539', '10.1038/s41586-020-2649-2', 'https://doi.org/10.1016/s0140-6736(97)11096-0']);
      return;
    }
    expect(splitEntries(g.input)).toEqual(g.entries);
  });

  it('text similarity', () => {
    for (const g of golden.sim) {
      expect(sim(g.a, g.b)).toBe(g.sim);
      expect(coverage(g.a, g.b)).toBe(g.cov);
      expect(norm(g.a)).toBe(g.norm);
    }
  });
});

describe('draft analysis', () => {
  it.each(Object.entries(golden.drafts))('analyze: %s', (_name, g: any) => {
    expect(splitDraft(g.text)).toEqual(g.split);
    expect(sentences(splitDraft(g.text).prose)).toEqual(g.sentences);
    expect(plain(analyze(g.text, g.refs))).toEqual(g.analysis);
  });

  it('terms', () => {
    golden.compares.forEach((g: any, i: number) => {
      const t = terms(g.s);
      expect({ stems: [...t.stems], nums: t.nums }).toEqual(golden.terms[i]);
    });
  });

  it('compare and closest', () => {
    for (const g of golden.compares) {
      const c = compare(g.s, g.a);
      expect(toHtml(c.sentence)).toBe(g.out.sentenceHTML);
      expect(toHtml(c.abstract)).toBe(g.out.abstractHTML);
      expect(c.shared).toBe(g.out.shared);
      expect(c.missing).toEqual(g.out.missing);
      expect(closest(g.s, g.a)).toEqual(g.closest);
    }
  });
});

describe('library files', () => {
  it.each(Object.entries(golden.libs))('parseLibraryFile: %s', (name, g: any) => {
    expect(parseLibraryFile(name, g.text)).toEqual(g.out);
  });
});

describe('matching', () => {
  it('candidates, scores, differences and APA', () => {
    expect(golden.cands.length).toBeGreaterThan(5);
    for (const g of golden.cands) {
      const c = g.kind === 'cr' ? fromCrossref(g.w) : fromOpenAlex(g.w);
      expect(plain(c)).toEqual(g.cand);
      expect(apa(c)).toBe(g.apa);
      golden.refs.slice(0, 8).forEach((raw: string, i: number) => {
        const p = parse(raw);
        // Compound surnames: the original counted "Walt" (for van der Walt) and "Gomez" (indexed as
        // "N.Gomez") as wrong authors. Those pairs are checked in citation-styles.test.ts instead.
        const compound = c.authors.some((a) => /[\s.]/.test(a.family.trim()) && p.surnames.some((s) => norm(a.family).endsWith(' ' + s)));
        if (compound) return;
        expect(score(p, c)).toEqual(g.scored[i].score);
        expect(plain(diffs(p, c))).toEqual(g.scored[i].diffs);
      });
    }
  });
});

/* ---------- verify(), replayed against the recorded responses ---------- */

const fixture = (url: string): { status: number; body: any } | undefined => golden.fixtures[url];

/**
 * What the original fetch helper returned: the JSON, null for "not there", or a thrown error for "busy".
 * OpenAlex lookups are `soft`: once it rate-limited the recording, the original skipped it without asking,
 * so a missing recording means "unavailable".
 */
function replay(url: string, soft: boolean): any {
  const f = fixture(url);
  if (!f && soft) return null;
  if (!f) throw new Error('No recorded response for ' + url);
  if (f.status === 404) return null;
  if (f.status === 200) return f.body;
  if (soft || (f.status >= 400 && f.status < 500 && f.status !== 429)) return null;
  throw new Error('busy');
}

const recorded: Lookups = {
  async crossrefByDoi(doi) {
    try {
      const w = replay(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, false);
      return w ? fromCrossref(w.message) : null;
    } catch {
      return null;
    }
  },
  async crossrefSearch(q) {
    const r = replay(`https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(q)}&rows=5`, false);
    return (r.message.items as any[]).map(fromCrossref);
  },
  async openalexSearch(q) {
    const r = replay(`https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=5`, true);
    return r ? (r.results as any[]).map(fromOpenAlex) : null;
  },
  async enrich(doi) {
    const w = replay(
      `https://api.openalex.org/works/doi:${doi}?select=is_retracted,primary_location,open_access,best_oa_location,cited_by_count`,
      true,
    );
    return w ? { retracted: !!w.is_retracted, ven: venueInfo(w) } : { ven: null };
  },
  async crossrefRetractionNotice(doi) {
    let n: any = null;
    try {
      n = replay(`https://api.crossref.org/works?filter=updates:${encodeURIComponent(doi)}&rows=5`, false);
    } catch {
      /* treated as "no notice found" */
    }
    return !!n && n.message.items.some((it: any) => (it['update-to'] || []).some((u: any) => /retract/i.test(u.type) && u.DOI.toLowerCase() === doi));
  },
};

describe('verify', () => {
  const cases = golden.verify.filter((v: any) => v.result);

  it('covers every kind of verdict the sample produces', () => {
    const verdicts = new Set(cases.map((v: any) => v.result.verdict));
    expect(verdicts.size).toBeGreaterThanOrEqual(3);
  });

  /** Results that are better than the original's on purpose: what changes, and why. */
  const BETTER_NOW: [start: string, why: string, expected: (was: any) => any][] = [
    [
      'Harris, C. R., Millman, K. J., van der Walt',
      'the original called a correct reference "Fix details" because "Walt" was not "van der Walt"',
      (was) => ({ ...was, verdict: 'verified', diffs: [] }),
    ],
    [
      'Vaswani, A., Shazeer, N.',
      'the record lists one author as "N.Gomez"; citing "Gomez" is not an error',
      (was) => ({ ...was, diffs: was.diffs.filter((d: any) => d.field !== 'Authors') }),
    ],
    ['Ji, Ziwei, et al.', 'the venue of an MLA reference is now read, and it matches', (was) => ({ ...was, confidence: 1 })],
    ['[12] K. He', 'the authors of an IEEE reference are now read, and they match', (was) => ({ ...was, confidence: expect.closeTo(0.95, 5) })],
    [
      'World Health Organization.',
      'an organisation as author now matches the same organisation on a record, so the closest (still wrong) record is one of its own',
      (was) => ({ ...was, confidence: expect.any(Number), note: expect.stringContaining('No real publication matches this citation') }),
    ],
  ];

  it.each(cases.map((v: any) => [v.result.verdict, v.raw.slice(0, 70), v]) as [string, string, any][])('%s: %s', async (_verdict, _name, v) => {
    const better = BETTER_NOW.find(([start]) => v.raw.startsWith(start));
    const got = plain(await verify(v.raw, recorded));
    if (!better) return expect(got).toEqual(v.result);
    expect(got).toEqual(better[2](v.result));
    // The verdict itself only moves where the reason says so.
    if (better[0].startsWith('Harris')) expect([v.result.verdict, got.verdict]).toEqual(['correction', 'verified']);
    else expect(got.verdict).toBe(v.result.verdict);
  });

  it('reports an error rather than "not found" when Crossref cannot be searched', async () => {
    const down: Lookups = { ...recorded, crossrefSearch: () => Promise.reject(new Error('Service busy')) };
    await expect(verify(golden.refs[1], down)).rejects.toThrow('Service busy');
  });

  it('never calls a reference made up when its DOI could not be looked up', async () => {
    const doiDown: Lookups = { ...recorded, crossrefByDoi: () => Promise.reject(new Error('Crossref is busy')) };
    await expect(verify('10.1038/s41586-020-2649-2', doiDown)).rejects.toThrow('Crossref is busy');
    // With a text search to fall back on, a real reference is still confirmed.
    const searchWorks: Lookups = { ...doiDown, crossrefSearch: () => recorded.crossrefSearch(golden.refs[1]) };
    const r = await verify(golden.refs[1] + ' https://doi.org/10.1038/nature14539', searchWorks);
    expect(r.verdict).toBe('verified');
  });

  it('keeps going on Crossref alone when OpenAlex is unavailable', async () => {
    const noOpenAlex: Lookups = { ...recorded, openalexSearch: async () => null, enrich: async () => ({ ven: null }) };
    const r = await verify(golden.refs[1], noOpenAlex);
    expect(r.verdict).toBe('verified');
    expect(r.match?.ven).toBeUndefined();
  });

  it('marks a retracted match even when its details are right', async () => {
    const paper: Candidate = {
      source: 'Crossref', doi: '10.1/x', title: 'A study of something important', authors: [{ family: 'Smith', given: 'Jane' }],
      year: 2010, venue: 'Journal of Things', volume: '1', pages: '1–2', cites: 10, retracted: false,
    };
    const lk: Lookups = {
      crossrefByDoi: async () => null,
      crossrefSearch: async () => [paper],
      openalexSearch: async () => null,
      enrich: async () => ({ ven: null }),
      crossrefRetractionNotice: async () => true,
    };
    const r = await verify('Smith, J. (2010). A study of something important. Journal of Things, 1, 1–2.', lk);
    expect(r.verdict).toBe('retracted');
  });
});

describe('exports', () => {
  it('CSV, BibTeX, RIS and EndNote', () => {
    const { check } = golden.exports;
    expect(toCsv(check)).toBe(golden.exports.csv);
    expect(toBibtex(check)).toBe(golden.exports.bib);
    expect(toBibtex(check, true)).toBe(golden.exports.bibScreened);
    expect(toRis(check)).toBe(golden.exports.ris);
    expect(toRis(check, true)).toBe(golden.exports.risScreened);
    expect(toEndNote(check)).toBe(golden.exports.enw);
  });

  it('integrity score', () => {
    for (const g of golden.integrity) {
      expect(integrity(g.verdicts.map((verdict: any) => ({ verdict })))).toBe(g.score);
    }
  });
});
