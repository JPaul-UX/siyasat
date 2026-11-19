import { correctedReference, type CitationStyle, type RefResult } from '@siyasat/core';

/**
 * The corrected reference for a result, in a citation style. Null when no real record was found to write
 * one from. The text marks italics with <i> tags.
 *
 * It is written afresh each time from the matched record, so the title is capitalised and the journal
 * named the way the chosen style asks.
 */
export const referenceIn = (r: RefResult, style: CitationStyle): string | null => correctedReference(r, style);
