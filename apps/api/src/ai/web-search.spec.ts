import { describe, expect, it, vi } from 'vitest';
import type { AiSettings } from './ai.config.js';
import { BraveSearch, createWebSearch, TavilySearch, WebSearchError } from './web-search.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('Tavily', () => {
  it('sends the query with the key as a bearer token, and reads the results', async () => {
    const fetchImpl = vi.fn(async () =>
      json({
        results: [
          { url: 'https://example.org/a', title: 'A <b>title</b>', content: 'An extract &amp; more' },
          { url: 'javascript:alert(1)', title: 'Bad', content: '' },
          { url: 'https://example.org/b', title: '', content: 'x'.repeat(900) },
        ],
      }),
    );
    const results = await new TavilySearch('tvly-key', fetchImpl).search('"exact title"', { maxResults: 4 });

    const [url, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('https://api.tavily.com/search');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tvly-key');
    expect(JSON.parse(String(init.body))).toEqual({ query: '"exact title"', max_results: 4, search_depth: 'basic', include_answer: false });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ url: 'https://example.org/a', title: 'A title', snippet: 'An extract & more' });
    expect(results[1]!.title).toBe('https://example.org/b');
    expect(results[1]!.snippet.length).toBeLessThanOrEqual(500);
  });

  it('answers nothing when the service returns no results', async () => {
    expect(await new TavilySearch('k', async () => json({})).search('q')).toEqual([]);
  });
});

describe('Brave', () => {
  it('sends the query in the address and the key in its header', async () => {
    const fetchImpl = vi.fn(async () => json({ web: { results: [{ url: 'https://example.org/c', title: 'C', description: 'The <strong>study</strong>' }] } }));
    const results = await new BraveSearch('brave-key', fetchImpl).search('mangrove samar', { maxResults: 30 });
    const [url, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://api.search.brave.com/res/v1/web/search');
    expect(u.searchParams.get('q')).toBe('mangrove samar');
    expect(u.searchParams.get('count')).toBe('20');
    expect((init.headers as Record<string, string>)['X-Subscription-Token']).toBe('brave-key');
    expect(results).toEqual([{ url: 'https://example.org/c', title: 'C', snippet: 'The study' }]);
  });
});

describe('search failures', () => {
  const search = (fetchImpl: typeof fetch) => new TavilySearch('k', fetchImpl).search('q');

  it.each([
    [401, 'Tavily refused the API key'],
    [403, 'Tavily refused the API key'],
    [429, 'Tavily is rate-limiting searches; try again later'],
    [500, 'Tavily answered HTTP 500'],
  ])('HTTP %i is explained', async (status, message) => {
    await expect(search(async () => json({}, status))).rejects.toEqual(new WebSearchError(message));
  });

  it('an unreachable service is explained', async () => {
    await expect(search(async () => Promise.reject(new TypeError('fetch failed')))).rejects.toEqual(new WebSearchError('Tavily could not be reached'));
  });

  it('an unreadable answer is explained', async () => {
    await expect(search(async () => new Response('<html>', { status: 200 }))).rejects.toEqual(new WebSearchError('Tavily sent an answer that could not be read'));
  });

  it('a cancelled request stays a cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      init?.signal?.throwIfAborted();
      return json({});
    });
    const error = await new TavilySearch('k', fetchImpl as typeof fetch).search('q', { signal: controller.signal }).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(WebSearchError);
  });
});

describe('choosing the search', () => {
  const base: AiSettings = { provider: 'google', model: 'm', search: 'tavily', tavilyApiKey: 't', braveApiKey: 'b', dailyLimit: 1, dailyLimitPerUser: 1 };
  it('follows the settings', () => {
    expect(createWebSearch(base)?.name).toBe('tavily');
    expect(createWebSearch({ ...base, search: 'brave' })?.name).toBe('brave');
    expect(createWebSearch({ ...base, provider: 'anthropic', search: 'native' })).toBeUndefined();
  });
});
