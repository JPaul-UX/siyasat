import { countVerdicts } from './match.js';
import type { Check, CheckSummary, VerdictCounts } from './types.js';

/** A check without its results, keeping the refs/draft distinction. */
export type CheckMeta = Check extends infer C ? (C extends Check ? Omit<C, 'results' | 'refResults'> : never) : never;

/**
 * The summary of a check that lists and the dashboard show. Takes the verdict tally separately so the API
 * can build it without loading every result.
 */
export function summarize(check: CheckMeta, counts: VerdictCounts, resultCount: number): CheckSummary {
  const s: CheckSummary = {
    id: check.id,
    name: check.name,
    type: check.type,
    date: check.date,
    score: check.score,
    counts,
    resultCount,
  };
  if (check.file) s.file = check.file;
  if (check.type === 'draft') {
    const tally = (k: string) => check.claims.filter((c) => c.judgment === k).length;
    s.draft = {
      claims: check.claims.length,
      sources: check.sources.length,
      match: tally('match'),
      nomatch: tally('nomatch'),
      unsure: tally('unsure'),
    };
    if (check.combo) s.combo = true;
    if (check.version) s.version = check.version;
  } else {
    s.total = check.total;
    s.status = check.status;
    if (check.stoppedEarly) s.stoppedEarly = true;
    if (check.inputs && check.inputs.length) s.hasInputs = true;
  }
  return s;
}

export const summarizeCheck = (check: Check): CheckSummary =>
  summarize(check, countVerdicts(check.results), check.results.length);

/** A reference check that has not looked at every reference yet, and was not finished early. */
export const isUnfinished = (s: Pick<CheckSummary, 'total' | 'resultCount' | 'status'>): boolean =>
  !!s.total && s.resultCount < s.total && s.status !== 'done';
