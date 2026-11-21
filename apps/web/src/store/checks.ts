/*
 * Saved checks. The browser keeps a working copy so the interface updates at once; every change is also
 * sent to the API, one request at a time per check so they arrive in order.
 */
import {
  integrity,
  summarizeCheck,
  type Check,
  type CheckPatch,
  type CheckSummary,
  type RefResult,
  type ResultKind,
} from '@siyasat/core';
import { create } from 'zustand';
import { api, ApiError } from '../lib/api';
import { toastOncePer } from './toast';

interface ChecksState {
  status: 'loading' | 'ready' | 'error';
  /** Every saved check, newest first, without its results. */
  summaries: CheckSummary[];
  /** The checks that have been opened in full. */
  docs: Record<string, Check>;
  /** Ids the server said do not exist. */
  missing: Record<string, true>;
}

export const useChecks = create<ChecksState>(() => ({ status: 'loading', summaries: [], docs: {}, missing: {} }));

const byNewest = (a: CheckSummary, b: CheckSummary) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);

export async function initChecks(): Promise<void> {
  useChecks.setState({ status: 'loading' });
  try {
    const summaries = await api.listChecks();
    useChecks.setState({ status: 'ready', summaries });
  } catch (e) {
    console.error(e);
    useChecks.setState({ status: 'error' });
  }
}

/* ---------- Saving ---------- */

const queues = new Map<string, Promise<unknown>>();

/** Run a save after the ones already queued for the same check. A failure is reported, not thrown. */
function enqueue(id: string, save: () => Promise<unknown>): Promise<void> {
  const next = (queues.get(id) ?? Promise.resolve()).then(save).then(
    () => undefined,
    (e: unknown) => {
      console.error('Saving failed', e);
      toastOncePer('save-failed', 20_000, "Couldn't save your latest changes. Check your connection.");
    },
  );
  queues.set(id, next);
  void next.finally(() => {
    if (queues.get(id) === next) queues.delete(id);
  });
  return next;
}

/** Resolves once everything queued for a check has been sent. */
export const whenSaved = (id: string): Promise<unknown> => queues.get(id) ?? Promise.resolve();

/* ---------- Reading ---------- */

export const getCheck = (id: string): Check | undefined => useChecks.getState().docs[id];

const loading = new Map<string, Promise<Check | null>>();

/** The full check, from the working copy or the server. Null when it does not exist. */
export function loadCheck(id: string): Promise<Check | null> {
  const have = getCheck(id);
  if (have) return Promise.resolve(have);
  let p = loading.get(id);
  if (!p) {
    p = api
      .getCheck(id)
      .then((check) => {
        // Something may have changed the working copy while this was on its way; that copy wins.
        const current = getCheck(id);
        if (current) return current;
        useChecks.setState((s) => ({ docs: { ...s.docs, [id]: check } }));
        return check;
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && (e.status === 404 || e.status === 400)) {
          useChecks.setState((s) => ({ missing: { ...s.missing, [id]: true } }));
          return null;
        }
        throw e;
      })
      .finally(() => loading.delete(id));
    loading.set(id, p);
  }
  return p;
}

/* ---------- Writing ---------- */

/** Put a check into the working copy and refresh its line in the list. */
function store(check: Check): void {
  useChecks.setState((s) => {
    const summary = summarizeCheck(check);
    const rest = s.summaries.filter((x) => x.id !== check.id);
    const { [check.id]: _gone, ...missing } = s.missing;
    return { docs: { ...s.docs, [check.id]: check }, summaries: [summary, ...rest].sort(byNewest), missing };
  });
}

/** Save a new check, or replace an existing one entirely. */
export function saveCheck(check: Check): Promise<void> {
  store(check);
  return enqueue(check.id, () => api.putCheck(check));
}

/** Change fields of a check (not its results). */
export function patchCheck(id: string, patch: CheckPatch): Check | null {
  const current = getCheck(id);
  if (!current) return null;
  const next = { ...current, ...patch } as Check;
  for (const [k, v] of Object.entries(patch)) if (v === null) delete (next as unknown as Record<string, unknown>)[k];
  store(next);
  void enqueue(id, () => api.patchCheck(id, patch));
  return next;
}

/** Add results to a check, replacing any at the same position, and recompute its score. */
export function upsertResults(id: string, items: RefResult[], kind: ResultKind = 'results'): Check | null {
  const current = getCheck(id);
  if (!current || !items.length) return current ?? null;
  const merged = new Map<number, RefResult>();
  const existing = (kind === 'refResults' ? (current.type === 'draft' ? current.refResults : undefined) : current.results) ?? [];
  existing.forEach((r, position) => merged.set(r.i ?? position, r));
  items.forEach((r) => merged.set(r.i!, r));
  const results = [...merged.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r);
  const next: Check =
    kind === 'refResults' && current.type === 'draft'
      ? { ...current, refResults: results, refScore: integrity(results) }
      : { ...current, results, score: integrity(results) };
  store(next);
  void enqueue(id, () => api.upsertResults(id, items, kind));
  return next;
}

/** Delete checks. Answers with the ids that were deleted, which `restoreChecks` takes back. */
export async function deleteChecks(ids: string[] | 'all'): Promise<string[]> {
  const before = useChecks.getState();
  const gone = ids === 'all' ? before.summaries.map((s) => s.id) : ids;
  useChecks.setState((s) => ({ summaries: s.summaries.filter((x) => !gone.includes(x.id)) }));
  try {
    if (ids === 'all') await api.deleteAllChecks();
    else await Promise.all(ids.map((id) => whenSaved(id).then(() => api.deleteCheck(id))));
    return gone;
  } catch (e) {
    console.error(e);
    useChecks.setState({ summaries: before.summaries });
    toastOncePer('delete-failed', 5000, "Couldn't delete that. Check your connection and try again.");
    return [];
  }
}

export async function restoreChecks(ids: string[]): Promise<void> {
  try {
    await api.restoreChecks(ids);
    useChecks.setState({ summaries: await api.listChecks() });
  } catch (e) {
    console.error(e);
    toastOncePer('restore-failed', 5000, "Couldn't restore that. Check your connection and try again.");
  }
}

/** Forget every check in the working copy, when the account they belong to is no longer signed in. */
export function clearChecks(): void {
  useChecks.setState({ status: 'loading', summaries: [], docs: {}, missing: {} });
}
