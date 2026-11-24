import type { AiSettings } from './ai.config.js';

/*
 * Web search through a search API, for models whose provider has no search of its own (or when you prefer
 * one). Each backend answers in the same shape, so the AI step does not care which one is behind it.
 */

export interface WebResult {
  url: string;
  title: string;
  /** A short extract of the page, as plain text. */
  snippet: string;
}

export interface WebSearch {
  readonly name: 'tavily' | 'brave';
  search(query: string, options?: { maxResults?: number; signal?: AbortSignal }): Promise<WebResult[]>;
}

/** The search service could not be used: a bad key, a refusal, a time-out. The message is safe to show. */
export class WebSearchError extends Error {}

type Fetch = typeof fetch;

const TIMEOUT_MS = 15_000;
/** Long extracts cost tokens on every later step, and a few sentences are enough to recognise a work. */
const SNIPPET_CHARS = 500;
const DEFAULT_RESULTS = 6;

const plain = (html: unknown): string =>
  String(html ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' })[e] ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text);

/** Keep only results with a web address, cleaned and shortened. */
function tidy(results: { url?: unknown; title?: unknown; snippet?: unknown }[], max: number): WebResult[] {
  const out: WebResult[] = [];
  for (const r of results) {
    const url = String(r.url ?? '');
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({ url, title: clip(plain(r.title) || url, 300), snippet: clip(plain(r.snippet), SNIPPET_CHARS) });
    if (out.length >= max) break;
  }
  return out;
}

async function call(fetchImpl: Fetch, service: string, url: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new WebSearchError(timeout.aborted ? `${service} took too long to answer` : `${service} could not be reached`);
  }
  if (res.status === 401 || res.status === 403) throw new WebSearchError(`${service} refused the API key`);
  if (res.status === 429) throw new WebSearchError(`${service} is rate-limiting searches; try again later`);
  if (!res.ok) throw new WebSearchError(`${service} answered HTTP ${res.status}`);
  try {
    return await res.json();
  } catch {
    throw new WebSearchError(`${service} sent an answer that could not be read`);
  }
}

/** Tavily (tavily.com): built for AI agents; the free plan has 1,000 searches a month. */
export class TavilySearch implements WebSearch {
  readonly name = 'tavily';
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async search(query: string, { maxResults = DEFAULT_RESULTS, signal }: { maxResults?: number; signal?: AbortSignal } = {}): Promise<WebResult[]> {
    const body = await call(
      this.fetchImpl,
      'Tavily',
      'https://api.tavily.com/search',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, max_results: maxResults, search_depth: 'basic', include_answer: false }),
      },
      signal,
    );
    const results = (body as { results?: { url?: string; title?: string; content?: string }[] })?.results;
    return tidy((Array.isArray(results) ? results : []).map((r) => ({ url: r.url, title: r.title, snippet: r.content })), maxResults);
  }
}

/** Brave Search API (brave.com/search/api). */
export class BraveSearch implements WebSearch {
  readonly name = 'brave';
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  async search(query: string, { maxResults = DEFAULT_RESULTS, signal }: { maxResults?: number; signal?: AbortSignal } = {}): Promise<WebResult[]> {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(Math.min(20, maxResults)));
    const body = await call(this.fetchImpl, 'Brave Search', url.toString(), { headers: { Accept: 'application/json', 'X-Subscription-Token': this.apiKey } }, signal);
    const results = (body as { web?: { results?: { url?: string; title?: string; description?: string }[] } })?.web?.results;
    return tidy((Array.isArray(results) ? results : []).map((r) => ({ url: r.url, title: r.title, snippet: r.description })), maxResults);
  }
}

/** The search API the settings ask for, or undefined when the model provider searches by itself. */
export function createWebSearch(s: AiSettings, fetchImpl: Fetch = fetch): WebSearch | undefined {
  if (s.search === 'tavily') return new TavilySearch(s.tavilyApiKey!, fetchImpl);
  if (s.search === 'brave') return new BraveSearch(s.braveApiKey!, fetchImpl);
  return undefined;
}
