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

/* Checks saved before accounts existed were keyed to this browser. They are not part of a login. */
try {
  localStorage.removeItem('siyasat.workspace.v1');
} catch {
  /* ignore */
}

async function errorBody(res: Response): Promise<{ message: string; code?: string }> {
  try {
    const body = (await res.json()) as { message?: string | string[]; code?: string };
    const message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
    return { message: message || `Request failed (${res.status})`, code: body.code };
  } catch {
    return { message: `Request failed (${res.status})` };
  }
}

interface RequestOptions {
  body?: unknown;
  timeoutMs?: number;
}

async function request<T>(method: string, path: string, { body, timeoutMs = 30_000 }: RequestOptions = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return (await res.json()) as T;
    const err = await errorBody(res);
    // The session is missing or no longer valid.
    if (res.status === 401 && !window.location.pathname.startsWith('/login')) {
      const next = window.location.pathname + window.location.search;
      window.location.assign(`/login?next=${encodeURIComponent(next)}`);
    }
    if (res.status === 403 && err.code === 'not_approved' && window.location.pathname !== '/pending') {
      window.location.assign('/pending');
    }
    // Going faster than the API allows: wait as long as it asks, then carry on.
    if (res.status === 429 && attempt < 4) {
      await sleep(Math.min(30, Number(res.headers.get('retry-after')) || 5) * 1000);
      continue;
    }
    throw new ApiError(res.status, err.message);
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
