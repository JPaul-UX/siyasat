/*
 * The HTTP contract between the web app and the API. Every route is under /api and, except for creating a
 * workspace and the health check, needs `Authorization: Bearer <workspace token>`.
 */
import type { AbstractInfo, Check, CheckSummary, FullText, RefResult, SourceInput, VenueInfo } from './types.js';

/** POST /api/workspaces → a new anonymous workspace. The token is shown once and is the only credential. */
export interface WorkspaceCreated {
  token: string;
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
} as const;
