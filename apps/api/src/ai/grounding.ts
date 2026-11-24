import { coverage, parse, SCORING, sim, type AiFinding, type AiOutcome, type AiSource, type AiWork, type Candidate } from '@siyasat/core';
import { z } from 'zod';

/*
 * A tool that flags made-up references must not make things up itself. The model's report is therefore only
 * a claim: every web address in it must have come back from a search in this run, a DOI counts only when
 * Crossref has it with a matching title, and "found" stands only when there is a page to show for it.
 * Everything here is plain code, so it is tested without a model.
 */

/** What the model reports, before it is checked. Lenient, so a small slip in a field does not lose the whole answer. */
export const reportSchema = z.object({
  outcome: z.enum(['found', 'not_found', 'inconclusive']).describe('found, not_found or inconclusive, as defined in the instructions'),
  summary: z.string().describe('One to three plain sentences for the author of the paper: what you found, and which details of the reference differ.'),
  work: z
    .object({
      title: z.string(),
      authors: z.string().optional(),
      year: z.number().int().optional(),
      venue: z.string().optional().describe('Journal, publisher, website or institution'),
      kind: z.string().optional().describe('e.g. journal article, book, chapter, report, thesis, web page'),
      doi: z.string().optional().describe('Only a DOI shown in a search result, never one you made up'),
      url: z.string().optional().describe('The search result that is the work itself'),
    })
    .optional()
    .describe('The work as you found it. Leave out any field you do not know.'),
  sources: z.array(z.string()).describe('URLs of the search results that show the work. Only URLs that appeared in your search results.'),
});
export type Report = z.infer<typeof reportSchema>;

/** A web address in a form that compares equal however it was written: no fragment, no tracking, no trailing slash. */
export function normalizeUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) u.searchParams.delete(key);
  const path = u.pathname.replace(/\/+$/, '');
  return `${u.host.toLowerCase().replace(/^www\./, '')}${path}${u.search}`;
}

/** The pages the searches in this run really returned. */
export class SeenPages {
  private readonly pages = new Map<string, AiSource>();

  add(url: string, title?: string | null): void {
    const key = normalizeUrl(url);
    if (!key || this.pages.has(key)) return;
    this.pages.set(key, { url, title: (title ?? '').trim() || url });
  }

  get(url: string): AiSource | undefined {
    const key = normalizeUrl(url);
    return key ? this.pages.get(key) : undefined;
  }

  get size(): number {
    return this.pages.size;
  }
}

/** "10.1234/abc" out of whatever the model wrote ("doi:10.1234/abc", "https://doi.org/10.1234/abc."). */
export function cleanDoi(raw?: string): string | null {
  const m = /10\.\d{4,9}\/[^\s"<>]+/.exec(raw ?? '');
  return m ? m[0].replace(/[.,;)\]]+$/, '').toLowerCase() : null;
}

/** How alike a title is to the one in the reference, measured the way the checker itself measures it. */
export function titleLikeness(reference: string, title: string): number {
  const p = parse(reference);
  return p.title ? sim(p.title, title) : coverage(title, reference);
}

/** A Crossref record for the reported DOI is the cited work when its title is as close as the checker requires. */
export function confirmsReference(reference: string, record: Candidate): boolean {
  return titleLikeness(reference, record.title) >= SCORING.titleFloor;
}

/** "Lee, Park & Cruz" or "Lee, Park, Cruz et al." from a record's authors. */
export function authorsText(record: Candidate): string | undefined {
  const names = record.authors.map((a) => a.family).filter(Boolean);
  if (!names.length) return undefined;
  if (names.length > 3) return `${names.slice(0, 3).join(', ')} et al.`;
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} & ${names.at(-1)}` : names[0];
}

const MAX_SOURCES = 6;
const MAX_SUMMARY = 700;

const tidy = (text: string | undefined, max: number): string | undefined => {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
};

export interface GroundingContext {
  reference: string;
  seen: SeenPages;
  /** Searches that returned an answer (even an empty one). With none, "not found" means nothing. */
  searchesDone: number;
  /** The Crossref record for the DOI the model reported, when there is one and it is the cited work. */
  confirmedDoi?: { doi: string; record: Candidate };
  queries: string[];
  model: string;
  now: Date;
}

/** Turn the model's report into what the author sees, keeping only what the searches back up. */
export function groundReport(report: Report, ctx: GroundingContext): AiFinding {
  const notes: string[] = [];
  let outcome: AiOutcome = report.outcome;

  const sources: AiSource[] = [];
  const kept = new Set<string>();
  let invented = 0;
  for (const url of report.sources) {
    const page = ctx.seen.get(url);
    if (!page) {
      invented++;
      continue;
    }
    const key = normalizeUrl(page.url)!;
    if (kept.has(key) || sources.length >= MAX_SOURCES) continue;
    kept.add(key);
    sources.push(page);
  }
  if (invented) notes.push(`${invented} ${invented === 1 ? 'address' : 'addresses'} the AI gave did not come from its searches and ${invented === 1 ? 'was' : 'were'} left out.`);

  let work: AiWork | undefined;
  if (report.work?.title.trim()) {
    const w = report.work;
    const page = w.url ? ctx.seen.get(w.url) : undefined;
    work = {
      title: tidy(w.title, 400)!,
      ...(tidy(w.authors, 300) ? { authors: tidy(w.authors, 300) } : {}),
      ...(w.year && w.year > 1000 && w.year <= ctx.now.getFullYear() + 1 ? { year: w.year } : {}),
      ...(tidy(w.venue, 300) ? { venue: tidy(w.venue, 300) } : {}),
      ...(tidy(w.kind, 60) ? { kind: tidy(w.kind, 60) } : {}),
      ...(page ? { url: page.url } : {}),
    };
    if (w.doi && cleanDoi(w.doi) !== ctx.confirmedDoi?.doi) notes.push('The DOI the AI gave is not the one Crossref has for this work, so it was left out.');
  }
  if (ctx.confirmedDoi) {
    // Crossref's record is the authority on the work's details.
    const { doi, record } = ctx.confirmedDoi;
    work = {
      ...work,
      title: record.title,
      ...(authorsText(record) ? { authors: authorsText(record) } : {}),
      ...(record.year ? { year: record.year } : {}),
      ...(record.venue ? { venue: record.venue } : {}),
      doi,
    };
  }

  if (outcome === 'found') {
    if (!work) {
      outcome = 'inconclusive';
      notes.push('The AI said it found the work but did not say what it found.');
    } else if (!sources.length && !work.url && !work.doi) {
      outcome = 'inconclusive';
      notes.push('The AI said it found the work but could not point to a page that shows it.');
    } else if (titleLikeness(ctx.reference, work.title) < SCORING.titleFloor) {
      outcome = 'inconclusive';
      notes.push('What the AI found has a different title from your reference, so it may be another work.');
    }
  }
  if (outcome === 'not_found' && !ctx.searchesDone) {
    outcome = 'inconclusive';
    notes.push('The web search did not work, so the AI could not look properly.');
  }

  return {
    outcome,
    summary: tidy(report.summary, MAX_SUMMARY) ?? 'The AI gave no summary.',
    ...(work && outcome !== 'not_found' ? { work } : {}),
    sources,
    queries: ctx.queries.slice(0, 12),
    model: ctx.model,
    date: ctx.now.toISOString(),
    ...(notes.length ? { adjusted: notes.join(' ') } : {}),
  };
}

/** The finding when the model never handed in a usable report. */
export function noReport(ctx: Omit<GroundingContext, 'reference' | 'seen' | 'confirmedDoi'>, reason: string): AiFinding {
  return {
    outcome: 'inconclusive',
    summary: reason,
    sources: [],
    queries: ctx.queries.slice(0, 12),
    model: ctx.model,
    date: ctx.now.toISOString(),
  };
}
