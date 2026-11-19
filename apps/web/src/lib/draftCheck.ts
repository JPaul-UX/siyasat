/* Running a draft check: look every cited source up, then build the saved check. */
import {
  analyze,
  integrity,
  splitDraft,
  splitEntries,
  type AbstractInfo,
  type Claim,
  type DraftAnalysis,
  type DraftCheck,
  type DraftSource,
  type RefResult,
} from '@siyasat/core';
import { getCheck, saveCheck } from '../store/checks';
import type { Editing } from '../store/forms';
import { toast, type UndoEntry } from '../store/toast';
import { checkDraftSource, pool, verifyRef } from './lookups';

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const squash = (s?: string | null) => (s || '').replace(/\s+/g, ' ').trim();

/** Identifies a claim across edits: the same sentence citing the same sources. */
const claimKey = (cl: Pick<Claim, 'sentence' | 'cites'>) => squash(cl.sentence) + '|' + cl.cites.map((x) => x.key).join(',');

/** The sentence that cites a source, used to pick the right paper when the draft gives only author and year. */
const citingSentence = (a: DraftAnalysis, key: string) => a.claims.find((c) => c.cites.some((x) => x.key === key))!.sentence;

export const toClaims = (a: DraftAnalysis): Claim[] =>
  a.claims.map((cl) => ({ sentence: cl.sentence, cites: cl.cites.map((x) => ({ label: x.label, key: x.key })), judgment: null }));

/**
 * Results for every entry of a reference list. An entry that a cited source already resolved, or that an
 * earlier version of the check already has, is reused instead of being looked up again.
 */
export function buildRefResults(
  entries: string[],
  sources: { ref?: string | null; result: RefResult }[],
  previous?: RefResult[] | null,
  onDone?: () => void,
): Promise<RefResult[]> {
  return pool(
    entries,
    async (entry, i) => {
      const cited = sources.find((s) => s.ref && squash(s.ref) === squash(entry));
      let r: RefResult | null = cited && cited.result.verdict !== 'error' ? { ...cited.result } : null;
      if (!r && previous) {
        const before = previous.find((p) => squash(p.raw) === squash(entry) && p.verdict !== 'error');
        if (before) r = { ...before };
      }
      if (!r) r = await verifyRef(entry);
      r.raw = entry;
      r.i = i;
      return r;
    },
    onDone,
  );
}

export interface DraftProgress {
  stage(index: number): void;
  status(text: string): void;
}

export type DraftProblem = 'empty' | 'no-citations' | 'too-many' | 'unreachable';

export type DraftOutcome =
  | { ok: false; problem: DraftProblem }
  | { ok: true; check: DraftCheck; updated?: { kept: number; undo: UndoEntry } };

/** The most sources one draft check looks up. Longer drafts are checked a section at a time. */
export const MAX_DRAFT_SOURCES = 60;

/**
 * Check a pasted draft. When `editing` names a saved check, that check is updated to a new version: sources
 * that did not change are not looked up again, and the author's verdicts are kept for unchanged sentences.
 */
export async function runDraftCheck(
  form: { name: string; input: string; refsIn: string },
  editing: Editing | null,
  progress: DraftProgress,
): Promise<DraftOutcome> {
  const a = analyze(form.input, form.refsIn);
  if (!form.input.trim()) return { ok: false, problem: 'empty' };
  if (!a.claims.length) return { ok: false, problem: 'no-citations' };
  if (a.sources.length > MAX_DRAFT_SOURCES) return { ok: false, problem: 'too-many' };

  progress.stage(0);
  await pause(300);
  progress.stage(1);

  const existing = editing ? getCheck(editing.id) : undefined;
  const old = existing?.type === 'draft' ? existing : undefined;
  const looked: { result: RefResult; abstract: AbstractInfo | null | undefined }[] = [];
  let errors = 0;
  for (let i = 0; i < a.sources.length; i++) {
    const s = a.sources[i]!;
    progress.status(`Source ${i + 1} of ${a.sources.length}: ${s.label} · linking and retrieving its abstract…`);
    if (i === Math.floor(a.sources.length / 2)) progress.stage(2);
    const at = old ? old.sources.findIndex((p) => p.key === s.key && (p.ref || '') === (s.ref || '')) : -1;
    const before = at >= 0 ? old!.results[at] : undefined;
    if (before && before.verdict !== 'error') {
      looked.push({ result: before, abstract: old!.sources[at]!.abstract });
      continue;
    }
    const r = await checkDraftSource(s, citingSentence(a, s.key), a.hasRefs);
    if (r.result.verdict === 'error') errors++;
    looked.push(r);
  }
  progress.stage(3);
  await pause(250);
  progress.stage(4);
  if (errors === a.sources.length) return { ok: false, problem: 'unreachable' };

  const results = looked.map((l) => l.result);
  const check: DraftCheck = {
    id: crypto.randomUUID(),
    name: form.name.trim() || 'Draft check ' + new Date().toLocaleDateString(),
    type: 'draft',
    v: 2,
    date: new Date().toISOString(),
    results,
    score: integrity(results),
    claims: toClaims(a),
    sources: a.sources.map((s, i): DraftSource => ({ key: s.key, label: s.label, ref: s.ref, year: s.year, abstract: looked[i]!.abstract })),
    orphans: a.orphans,
    uncited: a.uncited,
    hasRefs: a.hasRefs,
    input: form.input,
    refsIn: form.refsIn,
  };
  if (!old) {
    await saveCheck(check);
    return { ok: true, check };
  }

  // A new version of a saved check: carry over the author's verdicts and notes for sentences that did not change.
  const previous = new Map(old.claims.map((cl) => [claimKey(cl), cl]));
  let kept = 0;
  for (const cl of check.claims) {
    const o = previous.get(claimKey(cl));
    if (!o) continue;
    cl.judgment = o.judgment || null;
    if (o.note) cl.note = o.note;
    if (o.judgment) kept++;
  }
  if (old.combo) {
    check.combo = true;
    check.file = old.file;
    const entries = splitEntries(check.refsIn.trim() ? check.refsIn : splitDraft(check.input).refs);
    progress.status('Checking your reference list…');
    check.refResults = await buildRefResults(
      entries,
      a.sources.map((s, i) => ({ ref: s.ref, result: results[i]! })),
      old.refResults,
    );
    check.refScore = integrity(check.refResults);
  }
  check.id = old.id;
  check.version = (old.version || 1) + 1;
  check.created = old.created || old.date;
  await saveCheck(check);
  const undo: UndoEntry = {
    label: `updated "${check.name}" to version ${check.version}`,
    run: () => void saveCheck(old),
  };
  return { ok: true, check, updated: { kept, undo } };
}

/** The text to put in the form when a saved draft check is edited. Older checks did not keep their text. */
export function draftText(c: DraftCheck): { input: string; refsIn: string } {
  if (c.input != null) return { input: c.input, refsIn: c.refsIn || '' };
  const refs = c.sources.map((s) => s.ref).filter(Boolean);
  return { input: c.claims.map((x) => x.sentence).join(' ') + (refs.length ? '\n\nReferences\n' + refs.join('\n') : ''), refsIn: '' };
}

/**
 * Re-check one claim after the author rewrites its sentence. Sources already known are not looked up again.
 * Answers with a message for the author when the sentence cannot be checked.
 */
export async function recheckClaim(id: string, index: number, text: string): Promise<{ ok: true; check: DraftCheck } | { ok: false; message: string }> {
  const before = getCheck(id);
  if (!before || before.type !== 'draft') return { ok: false, message: '' };
  if (!text) return { ok: false, message: 'The sentence is empty.' };
  if (text === before.claims[index]!.sentence) return { ok: false, message: 'Nothing changed yet.' };
  const refs = before.sources.map((s) => s.ref).filter(Boolean);
  const a = analyze(text + (refs.length ? '\n\nReferences\n' + refs.join('\n') : ''), '');
  const claim = a.claims[0];
  if (!claim || !claim.cites.length) return { ok: false, message: "We couldn't find a citation in that sentence. Keep one like (Ji et al., 2023)." };

  const sources = [...before.sources];
  const results = [...before.results];
  for (const cite of claim.cites) {
    if (sources.some((s) => s.key === cite.key)) continue;
    const s = a.sources.find((x) => x.key === cite.key);
    if (!s) continue;
    const r = await checkDraftSource(s, text, a.hasRefs);
    sources.push({ key: s.key, label: s.label, ref: s.ref, year: s.year, abstract: r.abstract });
    results.push(r.result);
  }
  const oldSentence = before.claims[index]!.sentence;
  const original = draftText(before);
  const claims = before.claims.map((cl, i): Claim =>
    i === index
      ? { sentence: claim.sentence, cites: claim.cites.map((x) => ({ label: x.label, key: x.key })), judgment: null, note: cl.note }
      : cl,
  );
  const after: DraftCheck = {
    ...before,
    claims,
    sources,
    results,
    score: integrity(results),
    input: original.input.includes(oldSentence) ? original.input.replace(oldSentence, text) : original.input,
    refsIn: original.refsIn,
  };
  await saveCheck(after);
  toast(`Claim ${index + 1} re-checked · pick your verdict again`, {
    label: `edited claim ${index + 1}`,
    run: () => void saveCheck(before),
  });
  return { ok: true, check: after };
}
