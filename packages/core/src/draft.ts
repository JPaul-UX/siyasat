/*
 * Draft check: find the in-text citations in a draft, link each to its reference, and line the sentence up
 * with what the source says. This is a reading aid only. It never judges whether a source supports a claim.
 */
import { parse } from './parse.js';
import { cleanText, splitEntries } from './text.js';
import type { Citation, CiteRef, DraftAnalysis, SourceInput } from './types.js';

const HEAD = /^\s*(references|reference list|bibliography|works cited|sources|literature cited)\s*:?\s*$/im;

/** Split a draft into its prose and the reference list under a "References" heading, if there is one. */
export function splitDraft(input: string): { prose: string; refs: string } {
  const text = cleanText(input);
  const m = text.match(HEAD);
  if (!m) return { prose: text.trim(), refs: '' };
  return { prose: text.slice(0, m.index).trim(), refs: text.slice(m.index! + m[0].length).trim() };
}

interface ListedRef {
  num: number;
  raw: string;
  first: string;
  year?: number;
  cited: boolean;
}

function refList(input: string): { refs: ListedRef[]; numbered: boolean } {
  const txt = cleanText(input || '').trim();
  if (!txt) return { refs: [], numbered: false };
  const numbered = /^\s*\[?\d{1,3}[\].)]\s+/m.test(txt) && (txt.match(/^\s*\[?\d{1,3}[\].)]\s+/gm) || []).length >= 2;
  const refs = splitEntries(txt).map((p, i) => {
    const pr = parse(p);
    return { num: i + 1, raw: p, first: (pr.surnames[0] || '').toLowerCase(), year: pr.year, cited: false };
  });
  if (numbered) {
    // Keep the author's own numbering when every entry has a number.
    const nums = [...txt.matchAll(/^\s*\[?(\d{1,3})[\].)]\s+/gm)].map((m) => +m[1]!);
    if (nums.length === refs.length) refs.forEach((r, i) => (r.num = nums[i]!));
  }
  return { refs, numbered };
}

/* Drop section headings ("Introduction", "2. Literature Review") so they don't glue onto the first sentence. */
const HEADW =
  /^(?:\d+(?:\.\d+)*\.?\s+)?(?:abstract|introduction|background|literature review|review of (?:related )?literature|related work|theoretical framework|conceptual framework|methods?|methodology|materials and methods|results|findings|discussion|conclusions?|limitations|recommendations|chapter\s+\w+)\s*:?$/i;
const TITLE_WORD = /^(?:[A-Z0-9][\w’'-]*\.?|of|and|the|in|on|for|to|a|an|&|with|among|vs\.?)$/;

function stripHeadings(prose: string): string {
  const L = prose.split('\n');
  return L.filter((l, i) => {
    const t = l.trim();
    if (!t) return true;
    if (HEADW.test(t)) return false;
    const prevEnd = i === 0 || !L[i - 1]!.trim() || /[.!?:]\s*$/.test(L[i - 1]!);
    const w = t.split(/\s+/);
    const next = L[i + 1];
    const looksLikeHeading =
      prevEnd &&
      w.length <= 8 &&
      !/[.,;!?)]$/.test(t) &&
      !/\(\s*(?:19|20)\d{2}/.test(t) &&
      w.every((x) => TITLE_WORD.test(x)) &&
      (next === undefined || !next.trim() || /^[A-Z]/.test(next.trim()));
    return !looksLikeHeading;
  }).join('\n');
}

/* Abbreviations whose full stops must not end a sentence. */
const PROTECT: [RegExp, string][] = [
  [/\bet al\./g, 'et al§'],
  [/\be\.g\./g, 'e§g§'],
  [/\bi\.e\./g, 'i§e§'],
  [/\bcf\./g, 'cf§'],
  [/\bpp?\./g, 'p§'],
  [/\bvs\./g, 'vs§'],
  [/\b([A-Z])\.(?=\s?[A-Z]?\.?\s?[A-Z][a-z])/g, '$1§'],
];

export function sentences(prose: string): string[] {
  let t = prose.replace(/\s*\n\s*/g, ' ');
  PROTECT.forEach(([re, s]) => (t = t.replace(re, s)));
  return t
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"(\[])/)
    .map((s) => s.replace(/§/g, '.').trim())
    .filter(Boolean);
}

const NAME = "[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+(?:\\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+)?";
const PAREN_CITE = new RegExp(
  '^(' + NAME + '(?:,?\\s+(?:&|and)\\s+' + NAME + '|\\s+et al\\.?|(?:,\\s*' + NAME + ')*,?\\s*(?:&|and)\\s*' + NAME + ')?),?\\s+((?:19|20)\\d{2}[a-z]?)',
);
const NARRATIVE_CITE =
  '(' + NAME + '(?:(?:,\\s+' + NAME + ')*,?\\s+(?:&|and)\\s+' + NAME + '|\\s+et al\\.)?)\\s+\\(((?:19|20)\\d{2}[a-z]?)(?:,[^)]*)?\\)';

/** The in-text citations in one sentence: (A & B, 2020), Smith et al. (2019), and [1] when the list is numbered. */
export function citations(sent: string, numbered: boolean): Citation[] {
  const out: Citation[] = [];
  const push = (authors: string, year: string, label: string) => {
    const first = (authors.match(/[A-ZÀ-Ý][A-Za-zÀ-ÿ'’-]+/) || [''])[0];
    if (!first || /^(In|See|The|Table|Figure)$/.test(first)) return;
    out.push({
      label,
      authors: authors.trim(),
      first: first.toLowerCase(),
      year: +year.slice(0, 4),
      key: first.toLowerCase() + '|' + year.slice(0, 4),
    });
  };
  // Parenthetical: (A & B, 2020; C et al., 2019)
  for (const m of sent.matchAll(/\(([^()]*?\b(?:19|20)\d{2}[a-z]?[^()]*)\)/g)) {
    m[1]!.split(/;\s*/).forEach((part) => {
      const p = part.replace(/^(see|e\.g\.,?|cf\.|also)\s+/i, '').trim();
      const a = p.match(PAREN_CITE);
      if (a) push(a[1]!, a[2]!, '(' + p.replace(/,\s*pp?\.\s*[\d–-]+$/, '') + ')');
    });
  }
  // Narrative: Navarro and Kim (2020), Smith et al. (2019)
  for (const m of sent.matchAll(new RegExp(NARRATIVE_CITE, 'g'))) {
    const au = m[1]!.replace(/^(As|In|By|According to|While|Unlike|Following)\s+/, '');
    push(au, m[2]!, au + ' (' + m[2] + ')');
  }
  if (numbered) {
    for (const m of sent.matchAll(/\[(\d{1,3}(?:\s*[-–,]\s*\d{1,3})*)\]/g)) {
      m[1]!.split(/\s*,\s*/).forEach((r) => {
        const [a, b] = r.split(/\s*[-–]\s*/).map(Number) as [number, number | undefined];
        for (let n = a; n <= (b || a) && n - a < 50; n++) out.push({ label: '[' + n + ']', num: n, key: '#' + n });
      });
    }
  }
  const seen = new Set<string>();
  return out.filter((c) => !seen.has(c.key) && seen.add(c.key));
}

/** Find every cited sentence in a draft and link its citations to the reference list. */
export function analyze(text: string, extraRefs?: string): DraftAnalysis {
  const sp = splitDraft(text);
  const { refs, numbered } = refList(extraRefs && extraRefs.trim() ? extraRefs : sp.refs);
  const claims: DraftAnalysis['claims'] = [];
  sentences(stripHeadings(sp.prose)).forEach((s) => {
    const cs = citations(s, numbered);
    if (cs.length) claims.push({ sentence: s, cites: cs, judgment: null });
  });
  const sources = new Map<string, SourceInput>();
  const orphans: CiteRef[] = [];
  claims.forEach((cl) =>
    cl.cites.forEach((c) => {
      const ref =
        c.num != null
          ? refs.find((r) => r.num === c.num)
          : refs.find((r) => r.first === c.first && r.year === c.year) ||
            refs.find((r) => r.first === c.first && !!r.year && r.year === c.year && r.raw.toLowerCase().includes(c.first!));
      if (ref) {
        ref.cited = true;
        c.ref = ref.raw;
      } else if (refs.length && !orphans.some((o) => o.key === c.key)) {
        orphans.push({ label: c.label, key: c.key });
      }
      if (!sources.has(c.key)) {
        sources.set(c.key, { key: c.key, label: c.label, ref: c.ref || null, authors: c.authors, year: c.year, first: c.first });
      }
    }),
  );
  return {
    claims,
    sources: [...sources.values()],
    orphans,
    uncited: refs.filter((r) => !r.cited).map((r) => r.raw),
    hasRefs: refs.length > 0,
  };
}

/* ---------- Reading aid: shared terms and numbers ---------- */

const STOP = new Set(
  'about above after again against also among an and any are because been before being between both but can could did does doing during each few from further had has have having here into its itself more most much must only other ought over same should some such than that their them then there these they this those through under until very was were what when where which while who whom why will with would your our we us found show shows shown study studies research results paper report reports suggest suggests using used use based however across within without among'.split(
    ' ',
  ),
);
const stem = (w: string) =>
  w
    .toLowerCase()
    .replace(/[’']s$/, '')
    .replace(/(ies)$/, 'y')
    .replace(/(ing|ed|es|s)$/, '');

const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?\s?%?|\d+(?:\.\d+)?\s?%?/g;

export interface Terms {
  stems: Set<string>;
  nums: string[];
}

/** The meaningful word stems and the numbers in a sentence, ignoring its citations. */
export function terms(sentence: string): Terms {
  const s = sentence.replace(/\([^()]*\b(19|20)\d{2}[^()]*\)/g, ' ').replace(/\[[\d,\s–-]+\]/g, ' ');
  const words = (s.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ-]{3,}/g) || []).filter((w) => !STOP.has(w.toLowerCase()));
  const nums = (s.match(NUMBER) || []).map((n) => n.replace(/\s/g, '')).filter((n) => !/^(19|20)\d{2}$/.test(n));
  return { stems: new Set(words.map(stem)), nums: [...new Set(nums)] };
}

/** A run of text. `m` marks a word shared with the other text ('w') or a matching number ('n'). */
export interface Segment {
  t: string;
  m?: 'w' | 'n';
}

function highlight(text: string, stems: Set<string>, nums: string[]): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  const plain = (to: number) => {
    if (to > last) out.push({ t: text.slice(last, to) });
  };
  const re = /(\d{1,3}(?:,\d{3})+(?:\.\d+)?\s?%?|\d+(?:\.\d+)?\s?%?)|([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ-]{3,})/g;
  for (const m of text.matchAll(re)) {
    const [whole, n, w] = m;
    let mark: Segment['m'];
    if (n) {
      const k = n.replace(/\s/g, '');
      if (nums.some((x) => x === k || x.replace('%', '') === k.replace('%', ''))) mark = 'n';
    } else if (w && stems.has(stem(w)) && !STOP.has(w.toLowerCase())) {
      mark = 'w';
    }
    if (!mark) continue;
    plain(m.index);
    out.push({ t: whole, m: mark });
    last = m.index + whole.length;
  }
  plain(text.length);
  return out;
}

export interface Comparison {
  sentence: Segment[];
  abstract: Segment[];
  /** How many word stems the sentence and the abstract share. */
  shared: number;
  /** Numbers in the sentence that the abstract does not contain. */
  missing: string[];
}

/** Mark the words and numbers a sentence shares with a source's abstract. */
export function compare(sentence: string, abs?: string | null): Comparison {
  const t = terms(sentence);
  const at = abs ? terms(abs) : { stems: new Set<string>(), nums: [] };
  const shared = new Set([...t.stems].filter((x) => at.stems.has(x)));
  const an = ((abs || '').match(NUMBER) || []).map((n) => n.replace(/\s/g, '').replace('%', ''));
  const missing = t.nums.filter((n) => !an.includes(n.replace('%', '')));
  const present = t.nums.filter((n) => !missing.includes(n));
  return {
    sentence: highlight(sentence, shared, present),
    abstract: abs ? highlight(abs, shared, present) : [],
    shared: shared.size,
    missing,
  };
}

/** The abstract sentence that shares the most words with the claim. */
export function closest(sentence: string, abs?: string | null): { text: string; shared: number } | null {
  if (!abs) return null;
  const st = terms(sentence).stems;
  let best: string | null = null;
  let bs = 0;
  sentences(abs).forEach((x) => {
    const n = [...terms(x).stems].filter((w) => st.has(w)).length;
    if (n > bs) {
      bs = n;
      best = x;
    }
  });
  return best ? { text: best, shared: bs } : null;
}

/* ---------- Finding a cited paper by author and year, when the draft has no reference for it ---------- */

export interface AuthorYearHit {
  doi?: string;
  title?: string;
  strength: 'strong' | 'weak';
  /** OpenAlex was unavailable, so only Crossref was searched. */
  partial?: boolean;
}

export interface AuthorYearLookups {
  /** Crossref works by this author about these words, published between two years. Null when unavailable. */
  crossrefAuthorYear(
    surname: string,
    words: string,
    fromYear: number,
    toYear: number,
  ): Promise<{ doi: string; title: string; firstFamily: string }[] | null>;
  /** OpenAlex works matching the query, published between two years. Null when unavailable. */
  openalexAuthorYear(
    query: string,
    fromYear: number,
    toYear: number,
  ): Promise<{ doi: string | null; title: string; firstAuthor: string }[] | null>;
}

const fold = (s?: string | null) =>
  (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');

/**
 * Search for the paper an in-text citation refers to, using only its first author, its year and the sentence
 * that cites it. A "strong" hit has a title that fits the sentence; a "weak" one only shares author and year.
 */
export async function findByAuthorYear(
  src: { authors: string; first: string; year: number },
  claim: string,
  lk: AuthorYearLookups,
): Promise<AuthorYearHit | null> {
  const words = claim
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .slice(0, 220);
  const claimStems = terms(claim).stems;
  const family = fold(src.first);
  const fit = (title?: string | null) => {
    const tt = [...terms(title || '').stems];
    if (!tt.length) return 0;
    return tt.filter((x) => claimStems.has(x)).length / tt.length;
  };
  const surname = src.authors.replace(/\s+et al\.?/, '').split(/\s*(?:,|&|\band\b)\s*/)[0]!;

  let weak: AuthorYearHit | null = null;
  let crossrefAnswered = false;
  for (const slack of [0, 1]) {
    const found = await lk.crossrefAuthorYear(surname, words, src.year - slack, src.year + slack);
    if (found) crossrefAnswered = true;
    const items = (found || []).filter((w) => fold(w.firstFamily).includes(family));
    const scored = items.map((w) => ({ w, f: fit(w.title) })).sort((x, y) => y.f - x.f);
    if (scored[0] && scored[0].f >= 0.3) return { doi: scored[0].w.doi, title: scored[0].w.title, strength: 'strong' };
    if (!weak && items[0]) weak = { doi: items[0].doi, title: items[0].title, strength: 'weak' };
  }
  const oa = await lk.openalexAuthorYear(surname + ' ' + words, src.year - 1, src.year + 1);
  const hit =
    oa &&
    oa
      .map((p) => ({ p, f: fit(p.title) }))
      .filter((x) => fold(x.p.firstAuthor).includes(family))
      .sort((x, y) => y.f - x.f)[0];
  if (hit && hit.f >= 0.25 && hit.p.doi) {
    return { doi: hit.p.doi.replace('https://doi.org/', ''), title: hit.p.title, strength: 'strong' };
  }
  // Crossref is the main index. If it never answered, finding nothing is an outage, not evidence about the citation.
  if (!crossrefAnswered) throw new Error('Crossref is busy — try again in a minute');
  if (!oa && !weak) return { strength: 'weak', partial: true };
  return weak;
}
