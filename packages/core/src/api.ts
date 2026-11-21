/*
 * The HTTP contract between the web app and the API. Every route is under /api.
 * Health and the account routes are public. Everything the checker uses needs a session cookie for an
 * approved account.
 */
import type { AbstractInfo, Check, CheckSummary, FullText, RefResult, SourceInput, VenueInfo } from './types.js';

export type AccountRole = 'user' | 'admin';
export type AccountStatus = 'pending' | 'approved' | 'rejected';

/** A person who can sign in. Passwords are never included. */
export interface Account {
  id: string;
  name: string;
  email: string;
  role: AccountRole;
  status: AccountStatus;
  /** Why they asked for access. Empty when they left it blank. */
  note: string;
  createdAt: string;
}

/** GET /api/auth/me, and the body of login and signup. `user` is null when nobody is signed in. */
export interface AccountResponse {
  user: Account | null;
}

/** GET /api/admin/users */
export interface AccountListResponse {
  users: Account[];
}

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
