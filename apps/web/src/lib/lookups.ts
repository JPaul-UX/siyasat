/* Asking the API to look things up. These never throw: a failed lookup is a result with the `error` verdict. */
import type { AbstractInfo, RefResult, SourceInput } from '@siyasat/core';
import { api } from './api';
import { toastOncePer } from '../store/toast';

function noteBusy(busy?: string[]): void {
  if (!busy?.length) return;
  toastOncePer(
    'busy',
    60_000,
    busy.every((h) => /openalex/.test(h))
      ? 'OpenAlex is busy — continuing with Crossref only'
      : 'A lookup service is busy — retrying, then finishing with what we have',
  );
}

const failure = (e: unknown): string =>
  e instanceof Error && e.name !== 'TimeoutError' && e.name !== 'TypeError' ? e.message : "We couldn't reach Siyasat's server. Check your internet connection.";

/** Check one reference. */
export async function verifyRef(raw: string): Promise<RefResult> {
  try {
    const { result, busy } = await api.verify(raw);
    noteBusy(busy);
    return result;
  } catch (e) {
    return { raw, verdict: 'error', note: failure(e) };
  }
}

/** Check one source cited in a draft and fetch its abstract. */
export async function checkDraftSource(
  source: SourceInput,
  claim: string,
  hasRefs: boolean,
): Promise<{ result: RefResult; abstract: AbstractInfo | null }> {
  try {
    const { result, abstract, busy } = await api.checkSource({ source, claim, hasRefs });
    noteBusy(busy);
    return { result, abstract };
  } catch (e) {
    return { result: { raw: source.ref || source.label, verdict: 'error', note: failure(e) }, abstract: null };
  }
}

/** Run `task` over every item, a few at a time, keeping the results in order. */
export async function pool<T, R>(items: T[], task: (item: T, index: number) => Promise<R>, onDone: () => void = () => {}, size = 3): Promise<R[]> {
  let next = 0;
  const out = new Array<R>(items.length);
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await task(items[i]!, i);
        onDone();
      }
    }),
  );
  return out;
}
