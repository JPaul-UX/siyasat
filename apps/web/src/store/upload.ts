/*
 * One-step "Upload & check": read any file, work out what it is, run every check that fits, and save the
 * outcome as one check.
 */
import {
  analyze,
  cleanText,
  integrity,
  looksLikeLibrary,
  parseLibraryFile,
  splitDraft,
  splitEntries,
  type DraftAnalysis,
  type DraftCheck,
  type RefsCheck,
} from '@siyasat/core';
import { create } from 'zustand';
import { buildRefResults, toClaims } from '../lib/draftCheck';
import { FriendlyError, readUpload } from '../lib/files';
import { checkDraftSource, pool, verifyRef } from '../lib/lookups';
import { currentPath, go, paths } from '../lib/nav';
import { saveCheck } from './checks';
import { notice } from './dialog';
import { runJob, SOFT_LIMIT } from './jobs';
import { toast } from './toast';

export const UPLOAD_STEPS = ['Reading file', 'Finding citations', 'Checking sources', 'Done'];

export interface UploadJob {
  file: string;
  /** Index into UPLOAD_STEPS; past the end once finished. */
  step: number;
  pct: number;
  text: string;
  running: boolean;
  mode?: 'refs' | 'combo';
  error?: string;
}

export const useUpload = create<{ job: UploadJob | null }>(() => ({ job: null }));

const update = (patch: Partial<UploadJob>) => useUpload.setState((s) => (s.job ? { job: { ...s.job, ...patch } } : s));
export const clearUpload = (): void => useUpload.setState({ job: null });

const UNREACHABLE = "We couldn't reach the databases. Check your internet connection and try again in a minute.";
/** The most sources an uploaded draft may cite. Longer papers are uploaded a chapter at a time. */
const MAX_SOURCES = 80;

type Detected = { mode: 'refs'; entries: string[] } | { mode: 'combo'; text: string; analysis: DraftAnalysis };

/** Decide what a file is: a reference-manager export, a draft with in-text citations, or a plain reference list. */
function detect(name: string, raw: string): Detected {
  const text = cleanText(raw);
  if (!text.trim()) throw new FriendlyError("We couldn't find any text in this file.");
  if (looksLikeLibrary(text)) {
    const entries = parseLibraryFile(name.replace(/\.(pdf|docx)$/i, '.txt'), text);
    if (entries.length) return { mode: 'refs', entries };
  }
  const analysis = analyze(text, '');
  if (analysis.claims.length) return { mode: 'combo', text, analysis };
  const entries = splitEntries(splitDraft(text).refs || text).filter((e) => /(19|20)\d{2}|10\.\d{4}/.test(e));
  if (entries.length) return { mode: 'refs', entries };
  throw new FriendlyError(
    "We couldn't find any citations like (Author, 2020) or a reference list in this file. Check that it's the right file, or paste the text into New check.",
  );
}

function finish(check: RefsCheck | DraftCheck): void {
  update({ step: UPLOAD_STEPS.length, pct: 100, text: 'Done!', running: false });
  void saveCheck(check);
  setTimeout(() => {
    clearUpload();
    if (currentPath() === paths.upload) go(paths.results(check.id), { replace: true });
    toast(`Checked ${check.file}`);
  }, 500);
}

export async function startUpload(file: File): Promise<void> {
  if (useUpload.getState().job?.running) {
    void notice('A file is already being checked', 'Please wait for it to finish.');
    return;
  }
  useUpload.setState({ job: { file: file.name, step: 0, pct: 3, text: 'Opening your file…', running: true } });
  go(paths.upload);
  try {
    const read = await readUpload(file);
    update({ pct: 12, step: 1, text: 'Finding citations and references…' });
    const found = detect(file.name, read.text);
    update({ mode: found.mode });
    const name = file.name.replace(/\.[^.]+$/, '');
    const base = { id: crypto.randomUUID(), name, date: new Date().toISOString(), file: file.name };

    if (found.mode === 'refs') {
      const { entries } = found;
      if (entries.length > SOFT_LIMIT) {
        // A big list is checked in batches from its results page, where it can be paused and resumed.
        const check: RefsCheck = { ...base, type: 'refs', inputs: entries, total: entries.length, results: [], score: 0, status: 'running' };
        await saveCheck(check);
        clearUpload();
        go(paths.results(check.id), { replace: true });
        setTimeout(() => void runJob(check.id, entries), 50);
        return;
      }
      let done = 0;
      update({ step: 2 });
      const results = await pool(
        entries,
        async (entry, i) => ({ ...(await verifyRef(entry)), i }),
        () => {
          done++;
          update({ pct: 15 + Math.round((80 * done) / entries.length), text: `Checking reference ${done} of ${entries.length}…` });
        },
      );
      if (results.every((r) => r.verdict === 'error')) throw new FriendlyError(UNREACHABLE);
      finish({ ...base, type: 'refs', total: results.length, results, score: integrity(results), status: 'done' });
      return;
    }

    const a = found.analysis;
    if (a.sources.length > MAX_SOURCES) {
      throw new FriendlyError(`That draft cites more than ${MAX_SOURCES} sources. Please upload one chapter or section at a time.`);
    }
    const listed = splitEntries(splitDraft(found.text).refs);
    const total = a.sources.length + listed.length;
    let done = 0;
    update({ step: 2 });
    const tick = () => {
      done++;
      update({ pct: 15 + Math.round(80 * Math.min(1, done / Math.max(1, total))), text: `Checking sources… ${done} of ${total}` });
    };
    const looked = await pool(
      a.sources,
      (s) => checkDraftSource(s, a.claims.find((c) => c.cites.some((x) => x.key === s.key))!.sentence, a.hasRefs),
      tick,
    );
    if (looked.every((l) => l.result.verdict === 'error')) throw new FriendlyError(UNREACHABLE);
    const results = looked.map((l) => l.result);
    const refResults = await buildRefResults(listed, a.sources.map((s, i) => ({ ref: s.ref, result: results[i]! })), null, tick);
    finish({
      ...base,
      type: 'draft',
      v: 2,
      combo: true,
      input: found.text,
      refsIn: '',
      results,
      score: integrity(results),
      claims: toClaims(a),
      sources: a.sources.map((s, i) => ({ key: s.key, label: s.label, ref: s.ref, year: s.year, abstract: looked[i]!.abstract })),
      orphans: a.orphans,
      uncited: a.uncited,
      hasRefs: a.hasRefs,
      refResults,
      refScore: integrity(refResults),
    });
  } catch (e) {
    console.error(e);
    const error =
      e instanceof FriendlyError ? e.message : 'Something went wrong while reading this file. Try again, or paste the text into New check instead.';
    update({ error, running: false, text: 'Stopped.' });
    if (currentPath() !== paths.upload) void notice("That file couldn't be checked", error);
  }
}
