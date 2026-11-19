import { Injectable } from '@nestjs/common';
import { findByAuthorYear, verify, type AbstractInfo, type RefResult, type SourceInput } from '@siyasat/core';
import { SourcesService } from './sources.service.js';

/** A lookup that takes longer than this is reported as "couldn't check" instead of keeping the user waiting. */
const VERIFY_TIMEOUT_MS = 45_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Service busy — this lookup took too long, try again')), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

@Injectable()
export class VerifyService {
  constructor(private readonly sources: SourcesService) {}

  /** Check one reference. A lookup failure becomes an `error` verdict, so a batch can carry on. */
  async verify(raw: string): Promise<RefResult> {
    try {
      return await withTimeout(verify(raw, this.sources), VERIFY_TIMEOUT_MS);
    } catch (e) {
      return { raw, verdict: 'error', note: e instanceof Error ? e.message : 'Lookup failed' };
    }
  }

  /**
   * Check one source cited in a draft and fetch its abstract. When the draft has no reference for it, the
   * paper is searched for by first author and year, using the citing sentence to pick between candidates.
   */
  async checkSource(src: SourceInput, claim: string, hasRefs: boolean): Promise<{ result: RefResult; abstract: AbstractInfo | null }> {
    try {
      return await withTimeout(this.lookUpSource(src, claim, hasRefs), VERIFY_TIMEOUT_MS * 1.5);
    } catch (e) {
      return { result: { raw: src.ref || src.label, verdict: 'error', note: e instanceof Error ? e.message : 'Lookup failed' }, abstract: null };
    }
  }

  private async lookUpSource(src: SourceInput, claim: string, hasRefs: boolean) {
    let input = src.ref;
    let linked = false;
    if (!input) {
      const unlisted = `${src.label} (no reference list entry)`;
      if (!src.authors || !src.first || !src.year) {
        // A numbered citation such as [7] with no entry 7: there is no author or year to search with.
        return {
          result: {
            raw: unlisted, verdict: 'uncertain' as const, confidence: 0, linked: 'author-year' as const, weak: true, orphan: hasRefs,
            note: `${src.label} has no matching entry in your reference list, so there is nothing to look up. Add it to your reference list.`,
          },
          abstract: null,
        };
      }
      const hit = await findByAuthorYear({ authors: src.authors, first: src.first, year: src.year }, claim, this.sources);
      if (!hit) {
        return {
          result: {
            raw: unlisted, verdict: 'not_found' as const, confidence: 0, orphan: hasRefs,
            note: `We searched Crossref and OpenAlex for a paper by ${src.authors} from ${src.year} (and a year either side) and found nothing plausible. It may be a local thesis or report that global indexes don't cover, or it may not exist. Check your university repository or library.`,
          },
          abstract: null,
        };
      }
      if (hit.strength === 'weak' || !hit.doi) {
        return {
          result: {
            raw: unlisted, verdict: 'uncertain' as const, confidence: 0, linked: 'author-year' as const, weak: true, orphan: hasRefs,
            note: hit.partial
              ? `OpenAlex was unavailable, so we could only search Crossref, which found no match for ${src.authors} (${src.year}). Try again later or add it to your reference list.`
              : `We found papers by ${src.authors} from ${src.year}, but none clearly matches this sentence.`,
          },
          abstract: null,
        };
      }
      input = hit.doi;
      linked = true;
    }
    const result = await verify(input, this.sources);
    if (linked) {
      result.linked = 'author-year';
      result.weak = false;
      result.orphan = hasRefs;
    }
    const abstract = result.match && result.verdict !== 'not_found' ? await this.sources.abstract(result.match.doi) : null;
    return { result, abstract };
  }
}
