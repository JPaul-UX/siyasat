/*
 * Checking a long reference list in the background: a few references at a time, saving as it goes, so the
 * user can pause, close the tab, and resume later.
 */
import type { RefResult } from '@siyasat/core';
import { create } from 'zustand';
import { verifyRef } from '../lib/lookups';
import { currentPath, go, paths } from '../lib/nav';
import { getCheck, loadCheck, patchCheck, upsertResults } from './checks';

/** Above this many references, the user is asked before everything is checked. */
export const SOFT_LIMIT = 300;
const CONCURRENCY = 3;
const SECONDS_PER_REFERENCE = 1.6;

export const eta = (n: number): string => {
  const minutes = Math.ceil((n * SECONDS_PER_REFERENCE) / CONCURRENCY / 60);
  return minutes <= 1 ? 'about a minute' : `about ${minutes} minutes`;
};

export interface Job {
  id: string;
  total: number;
  done: number;
  stop: null | 'pause' | 'cancel';
}

export const useJobs = create<{ job: Job | null }>(() => ({ job: null }));

export const activeJob = (): Job | null => useJobs.getState().job;
export const isRunning = (id: string): boolean => activeJob()?.id === id;

export const stopJob = (how: 'pause' | 'cancel'): void => {
  useJobs.setState((s) => (s.job ? { job: { ...s.job, stop: how } } : s));
};

/** Check every reference of a check that has not been checked yet. */
export async function runJob(id: string, inputsArg?: string[]): Promise<void> {
  if (activeJob()) return;
  const check = await loadCheck(id);
  if (!check || check.type === 'draft') return;
  const inputs = inputsArg ?? check.inputs;
  if (!inputs) {
    alert("This check's list wasn't saved, so it can't be resumed.");
    return;
  }
  const doneBefore = new Set(check.results.map((r) => r.i));
  const queue = inputs.map((_, i) => i).filter((i) => !doneBefore.has(i));
  useJobs.setState({ job: { id, total: inputs.length, done: doneBefore.size, stop: null } });
  patchCheck(id, { status: 'running' });

  let buffer: RefResult[] = [];
  let lastSave = Date.now();
  const flush = () => {
    if (!buffer.length) return;
    upsertResults(id, buffer);
    buffer = [];
    lastSave = Date.now();
  };
  const worker = async () => {
    while (queue.length && !activeJob()?.stop) {
      const i = queue.shift()!;
      const result = await verifyRef(inputs[i]!);
      result.i = i;
      buffer.push(result);
      useJobs.setState((s) => (s.job ? { job: { ...s.job, done: s.job.done + 1 } } : s));
      if (buffer.length >= 10 || Date.now() - lastSave > 5000) flush();
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  flush();

  const paused = activeJob()?.stop === 'pause';
  useJobs.setState({ job: null });
  const final = getCheck(id);
  if (final && final.type !== 'draft') {
    if (paused) patchCheck(id, { status: 'paused' });
    else if (final.results.length < final.total) patchCheck(id, { status: 'done', stoppedEarly: true });
    else patchCheck(id, { status: 'done', inputs: null });
  }
  // Whoever was watching the form or the results list is taken to the finished check.
  const here = currentPath();
  if (here.startsWith('/new') || here === '/results') go(paths.results(id));
}

export function resumeJob(id: string): void {
  if (activeJob()) {
    alert('Another check is running. Wait for it or pause it first.');
    return;
  }
  go(paths.results(id));
  setTimeout(() => void runJob(id), 50);
}
