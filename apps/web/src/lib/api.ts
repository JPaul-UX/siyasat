/* The browser's side of the HTTP contract in @siyasat/core. */
import type {
  AdminApproveAllResponse,
  AdminEventFilter,
  AdminEventList,
  AdminOverview,
  AdminPendingCount,
  AdminSettings,
  AdminUserDetail,
  AdminUserList,
  AdminUserSort,
  AiStatus,
  AuthConfig,
  AuthResponse,
  Check,
  CheckIds,
  CheckPatch,
  CheckSourceRequest,
  CheckSourceResponse,
  CheckSummary,
  EnrichResponse,
  JournalAbbreviationsResponse,
  FullText,
  MeResponse,
  RefResult,
  ResultKind,
  SignInRequest,
  SignUpRequest,
  UserStatus,
  VerifyResponse,
  WebCheckRequest,
  WebCheckResponse,
} from '@siyasat/core';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Problems with particular form fields, by field name, when the server named them. */
    readonly fields: Record<string, string> = {},
    /** A machine-readable cause, e.g. "pending_approval". */
    readonly reason?: string,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/*
 * The session is an httpOnly cookie the server sets at sign-in, so scripts on the page never see it and
 * every request to /api carries it. Before accounts, each browser had an anonymous workspace whose token
 * lived in local storage; signing up or in from that browser hands the token over once, so its checks move
 * into the account.
 */
const LEGACY_TOKEN_KEY = 'siyasat.workspace.v1';

export function legacyWorkspaceToken(): string | undefined {
  try {
    return localStorage.getItem(LEGACY_TOKEN_KEY) || undefined;
  } catch {
    return undefined;
  }
}

export function forgetLegacyWorkspace(): void {
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Called when the server turns the session away: `ended` when it is over (signed out elsewhere, expired,
 * suspended), `pending` when the account is still waiting for the super admin's approval.
 */
export type SessionProblem = 'ended' | 'pending';
let onSessionProblem: ((problem: SessionProblem) => void) | null = null;
export const setSessionProblemHandler = (fn: (problem: SessionProblem) => void): void => {
  onSessionProblem = fn;
};

async function failure(res: Response): Promise<ApiError> {
  let message = `Request failed (${res.status})`;
  const fields: Record<string, string> = {};
  let reason: string | undefined;
  try {
    const body = (await res.json()) as { message?: string | string[]; field?: string; reason?: string };
    reason = body.reason;
    const messages = Array.isArray(body.message) ? body.message : body.message ? [body.message] : [];
    // The validation pipe writes "field: problem"; a message about one field can also name it in `field`.
    const plain = messages.map((m) => {
      const named = /^([a-zA-Z]+): (.+)$/.exec(m);
      if (!named) return m;
      fields[named[1]!] ??= named[2]!;
      return named[2]!;
    });
    if (body.field && plain[0]) fields[body.field] ??= plain[0];
    if (plain.length) message = plain.join(' ');
  } catch {
    /* not JSON */
  }
  if (res.status === 429 && message.startsWith('Request failed')) message = 'Too many requests. Wait a minute, then try again.';
  return new ApiError(res.status, message, fields, reason);
}

const jsonHeaders = (body: unknown): HeadersInit => (body !== undefined ? { 'Content-Type': 'application/json' } : {});

interface RequestOptions {
  body?: unknown;
  timeoutMs?: number;
  /** Wait and try again when rate-limited. */
  retry?: boolean;
}

/** A request that needs a session. Waits and retries when rate-limited; reports a lost session. */
async function request<T>(method: string, path: string, { body, timeoutMs = 30_000, retry = true }: RequestOptions = {}): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch('/api' + path, {
      method,
      headers: jsonHeaders(body),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return (await res.json()) as T;
    if (res.status === 401) {
      onSessionProblem?.('ended');
      throw await failure(res);
    }
    if (res.status === 403) {
      const error = await failure(res);
      if (error.reason === 'pending_approval') onSessionProblem?.('pending');
      throw error;
    }
    // Going faster than the API allows: wait as long as it asks, then carry on.
    if (res.status === 429 && retry && attempt < 4) {
      await sleep(Math.min(30, Number(res.headers.get('retry-after')) || 5) * 1000);
      continue;
    }
    throw await failure(res);
  }
}

/** A request about signing in or out: no retries, and a 401 is an answer, not a lost session. */
async function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch('/api' + path, {
    method,
    headers: jsonHeaders(body),
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw await failure(res);
  return (await res.json()) as T;
}

export const authApi = {
  config: () => send<AuthConfig>('GET', '/auth/config'),
  me: () => send<MeResponse>('GET', '/auth/me'),
  signIn: (req: SignInRequest) => send<AuthResponse>('POST', '/auth/signin', req),
  signUp: (req: SignUpRequest) => send<AuthResponse>('POST', '/auth/signup', req),
  signOut: () => send<{ ok: true }>('POST', '/auth/signout'),
};

const enc = encodeURIComponent;

export const api = {
  verify: (raw: string) => request<VerifyResponse>('POST', '/verify', { body: { raw }, timeoutMs: 60_000 }),
  checkSource: (req: CheckSourceRequest) => request<CheckSourceResponse>('POST', '/draft/source', { body: req, timeoutMs: 90_000 }),
  enrich: (doi: string) => request<EnrichResponse>('GET', `/enrich?doi=${enc(doi)}`),
  journalAbbreviations: (issns: string[]) => request<JournalAbbreviationsResponse>('POST', '/journals/abbreviations', { body: { issns }, timeoutMs: 60_000 }),
  fullText: (doi: string) => request<FullText>('GET', `/fulltext?doi=${enc(doi)}`, { timeoutMs: 45_000 }),
  aiStatus: () => request<AiStatus>('GET', '/ai/status'),
  // An AI web search takes up to a minute and a half; it is not retried on a rate limit, since it costs money.
  webCheck: (req: WebCheckRequest) => request<WebCheckResponse>('POST', '/ai/web-check', { body: req, timeoutMs: 150_000, retry: false }),

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

const query = (params: Record<string, string | number | undefined>): string => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') q.set(k, String(v));
  const text = q.toString();
  return text ? '?' + text : '';
};

export const adminApi = {
  overview: () => request<AdminOverview>('GET', '/admin/overview'),
  users: (p: { q?: string; status?: UserStatus; sort?: AdminUserSort; page?: number }) => request<AdminUserList>('GET', '/admin/users' + query(p)),
  user: (id: string) => request<AdminUserDetail>('GET', `/admin/users/${id}`),
  pendingCount: () => request<AdminPendingCount>('GET', '/admin/pending'),
  approve: (id: string) => request<AdminUserDetail>('POST', `/admin/users/${id}/approve`),
  decline: (id: string) => request<AdminUserDetail>('POST', `/admin/users/${id}/decline`),
  approveAll: () => request<AdminApproveAllResponse>('POST', '/admin/users/approve-all'),
  suspend: (id: string) => request<AdminUserDetail>('POST', `/admin/users/${id}/suspend`),
  reactivate: (id: string) => request<AdminUserDetail>('POST', `/admin/users/${id}/reactivate`),
  unlock: (id: string) => request<AdminUserDetail>('POST', `/admin/users/${id}/unlock`),
  signOutEverywhere: (id: string) => request<AdminUserDetail>('POST', `/admin/users/${id}/sign-out`),
  events: (type: AdminEventFilter, page: number) => request<AdminEventList>('GET', '/admin/events' + query({ type, page })),
  settings: () => request<AdminSettings>('GET', '/admin/settings'),
  setSignupsOpen: (signupsOpen: boolean) => request<AdminSettings>('PUT', '/admin/settings', { body: { signupsOpen } }),
};
