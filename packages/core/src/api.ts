/*
 * The HTTP contract between the web app and the API. Every route is under /api. Apart from the health check
 * and the sign-up and sign-in routes, each needs a signed-in session, which the browser carries as an
 * httpOnly cookie; the /admin routes also need a super admin.
 */
import type { AbstractInfo, AiFinding, Check, CheckSummary, FullText, RefResult, SourceInput, Verdict, VenueInfo } from './types.js';

/* ---------- Accounts ---------- */

export type UserRole = 'user' | 'super_admin';
/**
 * pending: signed up and waiting for the super admin's approval; signed in, but can't use anything yet.
 * active: approved. suspended: stopped by the super admin. rejected: the super admin declined the sign-up.
 */
export type UserStatus = 'pending' | 'active' | 'suspended' | 'rejected';

/** The signed-in account, as GET /api/auth/me and the sign-in routes describe it. */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  /** `pending` until the super admin approves the account; only `active` accounts can use Siyasat. */
  status: Extract<UserStatus, 'pending' | 'active'>;
  createdAt: string;
}

/** GET /api/auth/config: what the sign-up page needs to know before anyone signs in. */
export interface AuthConfig {
  signupsOpen: boolean;
}

/** POST /api/auth/signup */
export interface SignUpRequest {
  name: string;
  email: string;
  password: string;
  /** Left empty by people. The form hides it; bots that fill in every field give themselves away. */
  website?: string;
  /** The token of the anonymous workspace this browser used before accounts, so its checks come along. */
  legacyWorkspaceToken?: string;
}

/** POST /api/auth/signin */
export interface SignInRequest {
  email: string;
  password: string;
  legacyWorkspaceToken?: string;
}

/** The sign-up and sign-in routes answer with the account, and set the session cookie. */
export interface AuthResponse {
  user: SessionUser;
  /** How many checks from this browser's anonymous workspace were added to the account. */
  claimedChecks?: number;
}

/** GET /api/auth/me */
export interface MeResponse {
  user: SessionUser;
}

/* ---------- Super admin ---------- */

/**
 * The kinds of lookup counted per account per day, and `throttled` for requests refused by a rate limit.
 * `ai` counts AI web searches that actually ran (an answer served from the cache costs nothing and is not counted).
 */
export type UsageKind = 'verify' | 'source' | 'enrich' | 'journals' | 'fulltext' | 'ai' | 'throttled';
export const LOOKUP_KINDS = ['verify', 'source', 'enrich', 'journals', 'fulltext', 'ai'] as const satisfies readonly UsageKind[];

export type ActivityType =
  | 'sign_up'
  | 'sign_up_blocked'
  | 'sign_in'
  | 'sign_in_failed'
  | 'sign_out'
  | 'locked'
  | 'suspended'
  | 'reactivated'
  | 'approved'
  | 'declined'
  | 'unlocked'
  | 'signed_out_everywhere'
  | 'signups_paused'
  | 'signups_opened';

/** One account in the admin's list. Dates are ISO strings. */
export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  lastSeenAt: string | null;
  lastSignInAt: string | null;
  signupIp: string | null;
  /** The browser and system it signed up from, e.g. "Chrome on Windows". */
  signupDevice: string | null;
  /** Set while too many wrong passwords keep the account locked. */
  lockedUntil: string | null;
  /** When the super admin approved or declined the sign-up. */
  reviewedAt: string | null;
  checks: number;
  /** Lookups in the last seven days. */
  lookups7d: number;
  /** Requests refused by a rate limit in the last seven days. */
  throttled7d: number;
}

export type AdminUserSort = 'newest' | 'oldest' | 'active' | 'lookups' | 'throttled';

/** GET /api/admin/users?q=&status=&sort=&page= */
export interface AdminUserList {
  users: AdminUserRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** Usage on one day. `day` is YYYY-MM-DD in the stats time zone. */
export interface UsageDay {
  day: string;
  verify: number;
  source: number;
  enrich: number;
  journals: number;
  fulltext: number;
  ai: number;
  throttled: number;
}

export interface AdminSession {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ip: string | null;
  device: string | null;
}

export interface AdminEvent {
  id: string;
  type: ActivityType;
  createdAt: string;
  userId: string | null;
  userName: string | null;
  /** The account's address, or the one that was typed when no such account exists. */
  email: string | null;
  actorEmail: string | null;
  ip: string | null;
  device: string | null;
  detail: Record<string, unknown> | null;
}

/** GET /api/admin/users/:id */
export interface AdminUserDetail {
  user: AdminUserRow & { signupUserAgent: string | null; failedSignIns: number; suspendedAt: string | null };
  sessions: AdminSession[];
  /** The last 30 days, oldest first, with a row for every day. */
  usage: UsageDay[];
  events: AdminEvent[];
  lastCheckAt: string | null;
}

/** GET /api/admin/events?type=&page= */
export interface AdminEventList {
  events: AdminEvent[];
  total: number;
  page: number;
  pageSize: number;
}

/** Which events the activity log shows. */
export type AdminEventFilter = 'all' | 'signups' | 'signins' | 'failed' | 'admin';

/** GET /api/admin/pending: how many sign-ups are waiting, for the badge beside "Admin". */
export interface AdminPendingCount {
  pending: number;
}

/** POST /api/admin/users/approve-all */
export interface AdminApproveAllResponse {
  approved: number;
}

export interface AdminDay {
  day: string;
  signups: number;
  lookups: number;
  throttled: number;
  /** Accounts that made at least one lookup that day. */
  activeUsers: number;
}

/** GET /api/admin/overview */
export interface AdminOverview {
  /** The time zone that days are counted in, e.g. "Asia/Manila". */
  timeZone: string;
  signupsOpen: boolean;
  totals: {
    users: number;
    /** Sign-ups waiting for approval. */
    pending: number;
    suspended: number;
    newToday: number;
    new7d: number;
    activeToday: number;
    activeSessions: number;
    checks: number;
    lookupsToday: number;
    throttledToday: number;
    failedSignIns24h: number;
    blockedSignUps24h: number;
  };
  /** The last 30 days, oldest first, with a row for every day. */
  daily: AdminDay[];
  /** The accounts that made the most lookups today. */
  topToday: { id: string; name: string; email: string; lookups: number; throttled: number }[];
  newest: AdminUserRow[];
  /** Sign-ups waiting for approval, oldest first (at most 50). */
  pending: AdminUserRow[];
  recent: AdminEvent[];
}

/** GET and PUT /api/admin/settings */
export interface AdminSettings {
  signupsOpen: boolean;
}

/** Password rules, shared so the form can explain them before sending. */
export const PASSWORD = { min: 8, max: 200 } as const;

/** Lookup services that are rate-limiting us right now, e.g. ["api.openalex.org"]. */
export type BusyHosts = string[];

/** POST /api/verify */
export interface VerifyRequest {
  raw: string;
}
export interface VerifyResponse {
  result: RefResult;
  busy?: BusyHosts;
}

/** POST /api/draft/source */
export interface CheckSourceRequest {
  source: SourceInput;
  /** The sentence that cites the source. */
  claim: string;
  /** Whether the draft came with a reference list. */
  hasRefs: boolean;
}
export interface CheckSourceResponse {
  result: RefResult;
  abstract: AbstractInfo | null;
  busy?: BusyHosts;
}

/** GET /api/enrich?doi= */
export interface EnrichResponse {
  retracted?: boolean;
  ven: VenueInfo | null;
}

/** POST /api/journals/abbreviations: the catalogued abbreviations of journals, by ISSN. */
export interface JournalAbbreviationsRequest {
  issns: string[];
}
export interface JournalAbbreviationsResponse {
  /**
   * ISSN → the abbreviation in the NLM Catalog, or null when the journal is not catalogued. An ISSN that
   * could not be looked up just now is left out, so that it is asked for again later.
   */
  abbreviations: Record<string, string | null>;
}

/** GET /api/fulltext?doi= */
export type FullTextResponse = FullText;

/** GET /api/ai/status: whether the optional AI web search is switched on, and how much of it is left today. */
export interface AiStatus {
  enabled: boolean;
  /** e.g. "anthropic/claude-opus-5-5". */
  model?: string;
  /** Where the AI searches: the model provider's own web search, or a search API. */
  search?: 'native' | 'tavily' | 'brave';
  /** AI web searches this account may still run today. */
  remainingToday?: number;
}

/** POST /api/ai/web-check: look for a reference the databases could not find, on the open web. */
export interface WebCheckRequest {
  raw: string;
  /** Siyasat's verdict, so the AI knows what the databases already said. */
  verdict: Verdict;
  note?: string;
  /** Search again even when a recent answer for this reference is cached. */
  fresh?: boolean;
}
export interface WebCheckResponse {
  finding: AiFinding;
  /** Whether the answer came from the cache, so it cost nothing. */
  cached: boolean;
  remainingToday: number;
}

/** Verdicts the AI web search is offered for: the ones where the databases could not confirm the work. */
export const AI_CHECK_VERDICTS: readonly Verdict[] = ['not_found', 'uncertain'];

/** GET /api/checks */
export type ChecksListResponse = CheckSummary[];

/** GET /api/checks/:id, and the body of PUT /api/checks/:id (which creates or replaces the whole check). */
export type CheckResponse = Check;

/** PATCH /api/checks/:id: fields to merge into the check. Results are changed through the results route. */
export type CheckPatch = Partial<Omit<Check, 'id' | 'type' | 'results' | 'refResults'>> & Record<string, unknown>;

export type ResultKind = 'results' | 'refResults';

/** POST /api/checks/:id/results: add results, or replace the ones with the same `i`. */
export interface ResultsUpsertRequest {
  kind?: ResultKind;
  /** Each item must carry its position `i`. */
  items: RefResult[];
}

/** PUT, PATCH and the results route all answer with the check's new summary. */
export type CheckWriteResponse = CheckSummary;

/** DELETE /api/checks/:id and DELETE /api/checks → the ids that were deleted. POST /api/checks/restore takes them back. */
export interface CheckIds {
  ids: string[];
}

export interface ApiError {
  statusCode: number;
  message: string | string[];
  error?: string;
}

/** Limits the API enforces, shared so the web app can explain them before sending. */
export const LIMITS = {
  /** Longest single reference the verifier accepts, in characters. */
  referenceChars: 4000,
  /** Most results accepted by one call to the results route. */
  resultsPerRequest: 200,
  /** Most references in one check. */
  referencesPerCheck: 20000,
  /** Most journals in one request for abbreviations. */
  journalsPerRequest: 300,
} as const;
