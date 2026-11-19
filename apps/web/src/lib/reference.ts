import { formatReference, type CitationStyle, type RefResult } from '@siyasat/core';

/**
 * The corrected reference for a result, in a citation style. Null when there is no confirmed record to
 * write one from. The text marks italics with <i> tags.
 */
export function referenceIn(r: RefResult, style: CitationStyle): string | null {
  if (!r.match || !r.apa) return null;
  // The APA form was written when the reference was checked.
  if (style === 'apa') return r.apa;
  // Where the only record found is a later repost, the author's own year is kept, as the APA form does.
  const kept = r.diffs?.find((d) => d.field === 'Year' && d.suspect);
  const year = kept ? Number(kept.cited) || r.match.year : r.match.year;
  return formatReference({ ...r.match, year }, style);
}
