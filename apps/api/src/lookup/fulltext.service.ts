import { Injectable } from '@nestjs/common';
import type { FullText } from '@siyasat/core';
import { AppConfig } from '../config.js';
import { TtlCache } from '../upstream/ttl-cache.js';
import { UpstreamService } from '../upstream/upstream.service.js';
import { parseJats } from './jats.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- upstream responses are loosely shaped JSON */
type Json = any;

const DAY = 24 * 3_600_000;

export const cleanDoi = (doi: string) =>
  String(doi || '')
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:\s*/i, '');

/** Only ever hand the browser an http(s) link. */
const httpUrl = (u: unknown): string | null => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);

/**
 * Finds a free, legal full text for a paper: the open-access article from Europe PMC when there is one,
 * otherwise a free copy located by Unpaywall, otherwise nothing but the publisher's page.
 */
@Injectable()
export class FullTextService {
  private readonly cache = new TtlCache<FullText>(500);

  constructor(
    private readonly upstream: UpstreamService,
    private readonly config: AppConfig,
  ) {}

  lookup(doiIn: string): Promise<FullText> {
    const doi = cleanDoi(doiIn);
    // An answer reached while a service was down is not kept, so the next visit tries again.
    return this.cache.memo(doi.toLowerCase(), () => this.find(doi), (out) => (out.errors.length ? 0 : DAY));
  }

  private async find(doi: string): Promise<FullText> {
    const out: FullText = { doi, kind: 'none', errors: [] };

    try {
      const search = (await this.upstream.getOnce(
        `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent('DOI:"' + doi + '"')}&resultType=core&format=json`,
        'json',
      )) as Json;
      const results: Json[] = search?.resultList?.result ?? [];
      const hit = results.find((x) => String(x.doi || '').toLowerCase() === doi.toLowerCase()) || results[0];
      if (hit) {
        out.meta = { title: hit.title, journal: hit.journalInfo?.journal?.title, year: hit.pubYear, authors: hit.authorString };
        if (hit.pmcid && (hit.isOpenAccess === 'Y' || hit.inEPMC === 'Y')) {
          const xml = await this.upstream.getOnce(
            `https://www.ebi.ac.uk/europepmc/webservices/rest/${encodeURIComponent(hit.pmcid)}/fullTextXML`,
            'text',
          );
          if (xml) {
            const article = parseJats(xml);
            if (article.hasBody) {
              return { ...out, kind: 'pmc', pmcid: String(hit.pmcid), title: article.title, secs: article.secs, license: article.license };
            }
          }
        }
      }
    } catch {
      out.errors.push('Europe PMC');
    }

    if (this.config.contactEmail) {
      try {
        const u = (await this.upstream.getOnce(
          `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(this.config.contactEmail)}`,
          'json',
        )) as Json;
        if (u) {
          out.meta = out.meta || { title: u.title, journal: u.journal_name, year: u.year };
          const best = u.best_oa_location;
          const pdf = httpUrl(best?.url_for_pdf);
          const url = httpUrl(best?.url_for_landing_page) || httpUrl(best?.url);
          if (pdf || url) {
            return { ...out, kind: 'oa', pdf, url, version: best.version ?? null, host: best.host_type ?? null, license: best.license ?? null };
          }
        }
      } catch {
        out.errors.push('Unpaywall');
      }
    }
    return out;
  }
}
