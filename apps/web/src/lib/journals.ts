import { LIMITS, type RefResult, type ResultKind } from '@siyasat/core';
import { upsertResults } from '../store/checks';
import { api } from './api';

/** Checks whose journals are being looked up right now, so that two lookups never overlap. */
const running = new Set<string>();

/** The results that name a journal by ISSN and have not yet been looked up in the catalogue. */
export const needingAbbreviation = (results: RefResult[]): RefResult[] =>
  results.filter((r) => r.i != null && r.match?.issn && r.match.venue && r.match.venueNlm === undefined);

/**
 * Look up the catalogued abbreviations of the journals in a list of results, and store them with the
 * results. Styles that cite journals by abbreviation (Vancouver, IEEE) then use them. Until this has run,
 * and for journals the catalogue does not hold, the abbreviation is worked out by rule.
 */
export async function fetchAbbreviations(checkId: string, results: RefResult[], kind: ResultKind): Promise<void> {
  const need = needingAbbreviation(results);
  if (!need.length || running.has(checkId)) return;
  running.add(checkId);
  try {
    const issns = [...new Set(need.map((r) => r.match!.issn!.toUpperCase()))];
    const found: Record<string, string | null> = {};
    for (let at = 0; at < issns.length; at += LIMITS.journalsPerRequest) {
      Object.assign(found, (await api.journalAbbreviations(issns.slice(at, at + LIMITS.journalsPerRequest))).abbreviations);
    }
    const changed = need
      .filter((r) => found[r.match!.issn!.toUpperCase()] !== undefined)
      .map((r) => ({ ...r, match: { ...r.match!, venueNlm: found[r.match!.issn!.toUpperCase()]! } }));
    for (let at = 0; at < changed.length; at += LIMITS.resultsPerRequest) upsertResults(checkId, changed.slice(at, at + LIMITS.resultsPerRequest), kind);
  } catch {
    // The rule-based abbreviation stays in place; the lookup is tried again the next time the list is opened.
  } finally {
    running.delete(checkId);
  }
}
