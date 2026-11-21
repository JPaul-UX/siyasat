/* The browser's side of the HTTP contract in @siyasat/core. */
import type {
  Check,
  CheckIds,
  CheckPatch,
  CheckSourceRequest,
  CheckSourceResponse,
  CheckSummary,
  EnrichResponse,
  JournalAbbreviationsResponse,
  FullText,
  RefResult,
  ResultKind,
  VerifyResponse,
} from '@siyasat/core';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* A 401 or 403 means the login is missing or not approved. The app reloads the session and leaves the checker. */
let onAuthProblem: (() => void) | null = null;
let lastAuthProblem = 0;

export function setAuthProblemHandler(fn: () => void): void {
  onAuthProblem = fn;
}

function notifyAuthProblem(): void {
  const now = Date.now();
  if (now - lastAuthProblem < 2000) return;
  lastAuthProblem = now;
  onAuthProblem?.();
}

async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join('; ');
    if (body.message) return body.message;
  } catch {
    /* not JSON */
  }
  return `Request failed (${res.status})`;
}

interface RequestOptions {
  body?: unknown;
  timeoutMs?: number;
}

async function request<T>(method: string, path: string, { body, timeoutMs = 30_000 }: RequestOptions = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('/api' + path, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return (await res.json()) as T;
    // Not logged in, or logged in but not approved. The page leaves the checker.
    if (res.status === 401 || res.status === 403) notifyAuthProblem();
    // Going faster than the API allows: wait as long as it asks, then carry on.
    if (res.status === 429 && attempt < 4) {
      await sleep(Math.min(30, Number(res.headers.get('retry-after')) || 5) * 1000);
      continue;
    }
    throw new ApiError(res.status, await errorMessage(res));
  }
}

const enc = encodeURIComponent;

export const api = {
  verify: (raw: string) => request<VerifyResponse>('POST', '/verify', { body: { raw }, timeoutMs: 60_000 }),
  checkSource: (req: CheckSourceRequest) => request<CheckSourceResponse>('POST', '/draft/source', { body: req, timeoutMs: 90_000 }),
  enrich: (doi: string) => request<EnrichResponse>('GET', `/enrich?doi=${enc(doi)}`),
  journalAbbreviations: (issns: string[]) => request<JournalAbbreviationsResponse>('POST', '/journals/abbreviations', { body: { issns }, timeoutMs: 60_000 }),
  fullText: (doi: string) => request<FullText>('GET', `/fulltext?doi=${enc(doi)}`, { timeoutMs: 45_000 }),

  listChecks: () => request<CheckSummary[]>('GET', '/checks'),
  getCheck: (id: string) => request<Check>('GET', `/checks/${id}`, { timeoutMs: 60_000 }),
  putCheck: (check: Check) => request<CheckSummary>('PUT', `/checks/${check.id}`, { body: check, timeoutMs: 120_000 }),
  patchCheck: (id: string, patch: CheckPatch) => request<CheckSummary>('PATCH', `/checks/${id}`, { body: patch }),
  upsertResults: (id: string, items: RefResult[], kind: ResultKind = 'results') =>
    request<CheckSummary>('POST', `/checks/${id}/results`, { body: { kind, items }, timeoutMs: 60_000 }),
  deleteCheck: (id: string) => request<CheckIds>('DELETE', `/checks/${id}`),
  deleteAllChecks: () => request<CheckIds>('DELETE', '/checks'),
  restoreChecks: (ids: string[]) => request<CheckIds>('POST', '/checks/restore', { body: { ids } }),
};
