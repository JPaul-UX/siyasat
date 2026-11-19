import { Injectable } from '@nestjs/common';
import {
  fromCrossref,
  fromOpenAlex,
  venueInfo,
  type AbstractInfo,
  type AuthorYearLookups,
  type Candidate,
  type Enrichment,
  type Lookups,
} from '@siyasat/core';
import { TtlCache } from '../upstream/ttl-cache.js';
import { UpstreamBusyError, UpstreamService } from '../upstream/upstream.service.js';

/* eslint-disable @typescript-eslint/no-explicit-any -- upstream responses are loosely shaped JSON */
type Json = any;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const CROSSREF = 'https://api.crossref.org';
const OPENALEX = 'https://api.openalex.org';

/** The Crossref fields the matcher reads. Asking for only these keeps responses small. */
const CROSSREF_FIELDS =
  'DOI,title,author,issued,published-print,published-online,container-title,volume,issue,page,type,is-referenced-by-count,updated-by,' +
  // What a reference to a book or a chapter needs, the journal's own abbreviation, and the abstract (which
  // shows how the words of the title are written in running text).
  'short-container-title,ISSN,publisher,publisher-location,editor,abstract';
const OPENALEX_FIELDS =
  'doi,title,authorships,publication_year,primary_location,biblio,is_retracted,type,cited_by_count,open_access,best_oa_location,language';

const NCBI = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const ISSN = /^\d{4}-\d{3}[\dX]$/;
/** How many ISSNs go into one catalogue search. The search is one URL, so it cannot be long. */
const ISSNS_PER_SEARCH = 40;

/** OpenAlex stores an abstract as word → positions; put the words back in order. */
function abstractFromIndex(index: Record<string, number[]> | null | undefined): string {
  if (!index) return '';
  const words: string[] = [];
  for (const [word, positions] of Object.entries(index)) positions.forEach((p) => (words[p] = word));
  return words.filter((w) => w != null).join(' ').trim();
}

interface CrossrefWork {
  candidate: Candidate;
  abstract: string | null;
}

const plainText = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Candidates are changed while a reference is verified (venue info is attached), so callers get copies. */
const copies = (cands: Candidate[]): Candidate[] => cands.map((c) => ({ ...c }));

/**
 * The scholarly databases Siyasat reads: Crossref, OpenAlex, Europe PMC and Semantic Scholar. Answers are
 * cached in memory, because the same papers are looked up again and again.
 */
@Injectable()
export class SourcesService implements Lookups, AuthorYearLookups {
  private readonly works = new TtlCache<CrossrefWork | null>(4000);
  private readonly searches = new TtlCache<Candidate[] | null>(4000);
  private readonly enrichments = new TtlCache<Enrichment>(8000);
  private readonly notices = new TtlCache<boolean | null>(8000);
  private readonly abstracts = new TtlCache<AbstractInfo | null>(4000);
  /** ISSN → the NLM Catalog's abbreviation, or null for a journal the catalogue does not hold. */
  private readonly abbreviations = new TtlCache<string | null>(20000);

  constructor(private readonly upstream: UpstreamService) {}

  /* ---------- Journal abbreviations ---------- */

  /**
   * The abbreviations medical journals go by ("N Engl J Med"), from the NLM Catalog, which is where the
   * Vancouver style takes them from. Looked up by ISSN, many at a time: one search finds the catalogue records
   * of up to forty journals, and one more request reads them all.
   *
   * An ISSN that could not be looked up is left out of the answer and is not cached.
   */
  async journalAbbreviations(issns: string[]): Promise<Record<string, string | null>> {
    const out: Record<string, string | null> = {};
    const wanted: string[] = [];
    for (const issn of new Set(issns.map((i) => i.trim().toUpperCase()).filter((i) => ISSN.test(i)))) {
      const known = this.abbreviations.get(issn);
      if (known !== undefined) out[issn] = known;
      else wanted.push(issn);
    }
    for (let at = 0; at < wanted.length; at += ISSNS_PER_SEARCH) {
      const batch = wanted.slice(at, at + ISSNS_PER_SEARCH);
      const found = await this.catalogued(batch);
      if (!found) continue;
      for (const issn of batch) {
        const abbreviation = found.get(issn) ?? null;
        // A journal's abbreviation does not change; a journal missing from the catalogue may be added.
        this.abbreviations.set(issn, abbreviation, abbreviation ? 30 * DAY : 7 * DAY);
        out[issn] = abbreviation;
      }
    }
    return out;
  }

  /** ISSN → abbreviation for the journals the catalogue holds, or null when the catalogue could not be read. */
  private async catalogued(issns: string[]): Promise<Map<string, string> | null> {
    const term = issns.map((i) => `"${i}"[ISSN]`).join(' OR ');
    const search = await this.upstream.getJsonSoft<Json>(`${NCBI}/esearch.fcgi?db=nlmcatalog&retmode=json&retmax=${issns.length * 4}&term=${encodeURIComponent(term)}`);
    const ids: string[] | undefined = search?.esearchresult?.idlist;
    if (!Array.isArray(ids)) return null;
    const found = new Map<string, string>();
    if (!ids.length) return found;
    const summary = await this.upstream.getJsonSoft<Json>(`${NCBI}/esummary.fcgi?db=nlmcatalog&retmode=json&id=${ids.join(',')}`);
    if (!summary?.result) return null;
    for (const id of ids) {
      const record = summary.result[id];
      const abbreviation = typeof record?.medlineta === 'string' ? record.medlineta.trim() : '';
      if (!abbreviation) continue;
      // One ISSN can bring back several records (an overseas edition, a predecessor): each record is taken
      // only for the ISSNs it lists itself.
      for (const entry of record.issnlist || []) {
        const issn = String(entry?.issn || '').toUpperCase();
        if (issns.includes(issn) && !found.has(issn)) found.set(issn, abbreviation);
      }
    }
    return found;
  }

  /* ---------- Lookups: what verify() needs ---------- */

  private crossrefWork(doi: string): Promise<CrossrefWork | null> {
    return this.works.memo(
      doi.toLowerCase(),
      async () => {
        const res = await this.upstream.getJson<Json>(`${CROSSREF}/works/${encodeURIComponent(doi)}`);
        if (!res?.message) return null;
        const abstract = typeof res.message.abstract === 'string' ? res.message.abstract : null;
        return { candidate: fromCrossref(res.message), abstract };
      },
      (work) => (work ? DAY : HOUR),
    );
  }

  async crossrefByDoi(doi: string): Promise<Candidate | null> {
    const work = await this.crossrefWork(doi);
    return work ? { ...work.candidate } : null;
  }

  async crossrefSearch(query: string): Promise<Candidate[]> {
    const found = await this.searches.memo(
      'cr:' + query,
      async () => {
        const res = await this.upstream.getJson<Json>(
          `${CROSSREF}/works?query.bibliographic=${encodeURIComponent(query)}&rows=5&select=${CROSSREF_FIELDS}`,
        );
        // No answer here must not look like "no such paper": that would call a real reference made up.
        if (!res?.message?.items) throw new UpstreamBusyError("Crossref couldn't search for this reference — try again");
        return (res.message.items as Json[]).map(fromCrossref);
      },
      () => DAY,
    );
    return copies(found!);
  }

  async openalexSearch(query: string): Promise<Candidate[] | null> {
    try {
      const found = await this.searches.memo(
        'oa:' + query,
        async () => {
          const res = await this.upstream.getJson<Json>(
            `${OPENALEX}/works?search=${encodeURIComponent(query)}&per-page=5&select=${OPENALEX_FIELDS}`,
          );
          return res?.results ? (res.results as Json[]).map(fromOpenAlex) : null;
        },
        (cands) => (cands ? DAY : 0),
      );
      return found ? copies(found) : null;
    } catch {
      return null;
    }
  }

  async enrich(doi: string): Promise<Enrichment> {
    try {
      return await this.enrichments.memo(
        doi.toLowerCase(),
        async () => {
          const w = await this.upstream.getJson<Json>(
            `${OPENALEX}/works/doi:${encodeURIComponent(doi)}?select=is_retracted,primary_location,open_access,best_oa_location,cited_by_count,language,abstract_inverted_index`,
          );
          if (!w) return { ven: null };
          const abstract = abstractFromIndex(w.abstract_inverted_index);
          return { retracted: !!w.is_retracted, ven: venueInfo(w), ...(w.language ? { lang: w.language } : {}), ...(abstract ? { abstract } : {}) };
        },
        (e) => (e.ven ? DAY : 0),
      );
    } catch {
      return { ven: null };
    }
  }

  async crossrefRetractionNotice(doi: string): Promise<boolean> {
    try {
      const found = await this.notices.memo(
        doi.toLowerCase(),
        async () => {
          const res = await this.upstream.getJson<Json>(
            `${CROSSREF}/works?filter=updates:${encodeURIComponent(doi)}&rows=5&select=DOI,update-to`,
          );
          if (!res?.message?.items) return null;
          return (res.message.items as Json[]).some((item) =>
            (item['update-to'] || []).some((u: Json) => /retract/i.test(u.type) && String(u.DOI).toLowerCase() === doi.toLowerCase()),
          );
        },
        (notice) => (notice === null ? 0 : DAY),
      );
      return !!found;
    } catch {
      return false;
    }
  }

  /* ---------- AuthorYearLookups: finding a cited paper that has no reference list entry ---------- */

  async crossrefAuthorYear(surname: string, words: string, fromYear: number, toYear: number) {
    const res = await this.upstream.getJsonSoft<Json>(
      `${CROSSREF}/works?query.author=${encodeURIComponent(surname)}&query.bibliographic=${encodeURIComponent(words)}` +
        `&filter=from-pub-date:${fromYear},until-pub-date:${toYear}&rows=15&select=DOI,title,author,issued`,
    );
    if (!res?.message?.items) return null;
    return (res.message.items as Json[]).map((w) => ({
      doi: String(w.DOI || ''),
      title: String((w.title || [''])[0] || ''),
      firstFamily: String(w.author?.[0]?.family || ''),
    }));
  }

  async openalexAuthorYear(query: string, fromYear: number, toYear: number) {
    const res = await this.upstream.getJsonSoft<Json>(
      `${OPENALEX}/works?search=${encodeURIComponent(query)}&filter=publication_year:${fromYear}-${toYear}&per-page=10&select=doi,title,authorships`,
    );
    if (!res?.results) return null;
    return (res.results as Json[]).map((p) => ({
      doi: (p.doi as string | null) ?? null,
      title: String(p.title || ''),
      firstAuthor: String(p.authorships?.[0]?.author?.display_name || ''),
    }));
  }

  /* ---------- Abstracts, for reading a source next to the sentence that cites it ---------- */

  /**
   * The abstract of a paper, from whichever free source has it: OpenAlex, Crossref, Europe PMC, then
   * Semantic Scholar. `text` is null when the paper is known but no free abstract exists.
   */
  abstract(doi: string): Promise<AbstractInfo | null> {
    if (!doi) return Promise.resolve(null);
    return this.abstracts.memo(doi.toLowerCase(), () => this.findAbstract(doi), (a) => (a?.text ? DAY : 0));
  }

  private async findAbstract(doi: string): Promise<AbstractInfo | null> {
    let info: Pick<AbstractInfo, 'openalex' | 'isOA' | 'oaUrl'> = {};
    const oa = await this.upstream.getJsonSoft<Json>(
      `${OPENALEX}/works/doi:${encodeURIComponent(doi)}?select=id,open_access,abstract_inverted_index`,
    );
    if (oa) {
      info = { openalex: oa.id || null, isOA: !!oa.open_access?.is_oa, oaUrl: oa.open_access?.oa_url || null };
      if (oa.abstract_inverted_index) {
        const text = abstractFromIndex(oa.abstract_inverted_index);
        if (text.length > 40) return { text, from: 'OpenAlex', ...info };
      }
    }

    const work = await this.crossrefWork(doi).catch(() => null);
    if (work?.abstract) {
      const text = plainText(work.abstract.replace(/<jats:title>[^<]*<\/jats:title>/gi, ' '));
      if (text.length > 40) return { text, from: 'Crossref', ...info };
    }

    const pmc = await this.upstream.getJsonSoft<Json>(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent('DOI:"' + doi + '"')}&resultType=core&format=json`,
    );
    const pmcHit = pmc?.resultList?.result?.[0];
    if (pmcHit?.abstractText) {
      const text = plainText(String(pmcHit.abstractText));
      if (text.length > 40) return { text, from: 'Europe PMC', ...info };
    }

    const s2 = await this.upstream.getJsonSoft<Json>(
      `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=abstract`,
    );
    if (typeof s2?.abstract === 'string' && s2.abstract.length > 40) return { text: s2.abstract, from: 'Semantic Scholar', ...info };

    return info.openalex ? { text: null, from: null, ...info } : null;
  }
}
