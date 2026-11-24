import { createAnthropic } from '@ai-sdk/anthropic';
import { APICallError } from 'ai';
import { describe, expect, it, vi } from 'vitest';
import { call, fakeAi, FakeSearch, record, scriptedModel, text, toolNames, toolResultsIn, turn } from '../../test/ai-fakes.js';
import { WebSearchError } from './web-search.js';
import { AiUnavailableError, describeFailure, INSTRUCTIONS, promptFor, runWebCheck, type WebCheckDeps } from './web-check.js';

const REF = 'Dela Cruz, M. (2019). Coastal fisheries management in the Visayas. Philippine Bureau of Fisheries Technical Report 12.';
const input = { raw: REF, verdict: 'not_found' as const };
const NOW = new Date('2026-11-24T08:00:00Z');

const REPORT_PAGE = { url: 'https://www.bfar.gov.ph/reports/coastal-fisheries-2019', title: 'Coastal fisheries management in the Visayas (2019)', snippet: 'Technical Report 12 by M. Dela Cruz…' };

function deps(over: Partial<WebCheckDeps> & Pick<WebCheckDeps, 'ai'>): WebCheckDeps {
  return { crossrefByDoi: async () => null, search: new FakeSearch({ Coastal: [REPORT_PAGE] }), now: () => NOW, ...over };
}

const found = (extra: Record<string, unknown> = {}) =>
  call('report', {
    outcome: 'found',
    summary: 'This is a real technical report from the Bureau of Fisheries.',
    work: { title: 'Coastal fisheries management in the Visayas', authors: 'Dela Cruz, M.', year: 2019, venue: 'Bureau of Fisheries and Aquatic Resources', kind: 'report', url: REPORT_PAGE.url },
    sources: [REPORT_PAGE.url],
    ...extra,
  });

describe('the AI web search', () => {
  it('searches, then hands in a report that the searches back up', async () => {
    const { model, calls } = scriptedModel([turn([call('web_search', { query: '"Coastal fisheries management in the Visayas"' })]), turn([found()])]);
    const search = new FakeSearch({ Coastal: [REPORT_PAGE] });
    const run = await runWebCheck(input, deps({ ai: fakeAi(model), search }));

    expect(run.finding).toEqual({
      outcome: 'found',
      summary: 'This is a real technical report from the Bureau of Fisheries.',
      work: {
        title: 'Coastal fisheries management in the Visayas',
        authors: 'Dela Cruz, M.',
        year: 2019,
        venue: 'Bureau of Fisheries and Aquatic Resources',
        kind: 'report',
        url: REPORT_PAGE.url,
      },
      sources: [{ url: REPORT_PAGE.url, title: REPORT_PAGE.title }],
      queries: ['"Coastal fisheries management in the Visayas"'],
      model: 'fake/fake-model',
      date: NOW.toISOString(),
    });
    expect(search.queries).toEqual(['"Coastal fisheries management in the Visayas"']);
    // The model saw the search results, and the run is counted.
    expect(JSON.stringify(toolResultsIn(calls[1]!))).toContain(REPORT_PAGE.url);
    expect(run).toMatchObject({ steps: 2, inputTokens: 200, outputTokens: 40 });
  });

  it('gives the model its instructions and the reference, fenced off as material', async () => {
    const { model, calls } = scriptedModel([turn([found()])]);
    await runWebCheck({ ...input, note: 'Closest record is a different work' }, deps({ ai: fakeAi(model) }));
    const system = calls[0]!.prompt.find((m) => m.role === 'system');
    expect(system?.content).toBe(INSTRUCTIONS);
    expect(JSON.stringify(calls[0]!.prompt)).toContain('<reference>\\n' + REF);
    expect(promptFor({ ...input, note: 'Closest record is a different work' })).toContain('Their note: Closest record is a different work');
    expect(toolNames(calls[0]!).sort()).toEqual(['check_doi', 'report', 'web_search']);
  });

  it('drops web addresses the searches never returned, and does not call a work found on its word alone', async () => {
    const { model } = scriptedModel([
      turn([call('web_search', { query: 'Coastal fisheries' })]),
      turn([found({ sources: ['https://made-up.example/report.pdf'], work: { title: 'Coastal fisheries management in the Visayas', url: 'https://made-up.example/report.pdf' } })]),
    ]);
    const { finding } = await runWebCheck(input, deps({ ai: fakeAi(model) }));
    expect(finding.outcome).toBe('inconclusive');
    expect(finding.sources).toEqual([]);
    expect(finding.work?.url).toBeUndefined();
    expect(finding.adjusted).toMatch(/did not come from its searches/);
    expect(finding.adjusted).toMatch(/could not point to a page/);
  });

  it('keeps a DOI only when Crossref has it for a work with the same title, and takes the details from Crossref', async () => {
    const real = record({ doi: '10.5555/bfar.2019.12', title: 'Coastal fisheries management in the Visayas', authors: [{ family: 'Dela Cruz', given: 'Maria' }], year: 2019, venue: 'BFAR Technical Reports' });
    const crossrefByDoi = vi.fn(async (doi: string) => (doi === '10.5555/bfar.2019.12' ? real : null));
    const { model } = scriptedModel([turn([found({ work: { title: 'Coastal Fisheries Management', doi: 'https://doi.org/10.5555/BFAR.2019.12.' }, sources: [] })])]);
    const { finding } = await runWebCheck(input, deps({ ai: fakeAi(model), crossrefByDoi }));
    expect(crossrefByDoi).toHaveBeenCalledWith('10.5555/bfar.2019.12');
    expect(finding.outcome).toBe('found');
    expect(finding.work).toEqual({ title: 'Coastal fisheries management in the Visayas', authors: 'Dela Cruz', year: 2019, venue: 'BFAR Technical Reports', doi: '10.5555/bfar.2019.12' });
  });

  it('leaves out a DOI that belongs to another work, or that Crossref does not know', async () => {
    const other = record({ doi: '10.1038/nature14539', title: 'Deep learning' });
    for (const crossrefByDoi of [async () => other, async () => null, async () => Promise.reject(new Error('Crossref is down'))]) {
      const { model } = scriptedModel([turn([call('web_search', { query: 'Coastal' })]), turn([found({ work: { title: 'Coastal fisheries management in the Visayas', doi: '10.1038/nature14539', url: REPORT_PAGE.url } })])]);
      const { finding } = await runWebCheck(input, deps({ ai: fakeAi(model), crossrefByDoi }));
      expect(finding.outcome).toBe('found');
      expect(finding.work?.doi).toBeUndefined();
      expect(finding.adjusted).toMatch(/DOI the AI gave/);
    }
  });

  it('answers check_doi from Crossref, and says so when Crossref cannot be reached', async () => {
    const real = record({ title: 'Coastal fisheries management in the Visayas' });
    const crossrefByDoi = vi.fn().mockResolvedValueOnce(real).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('down'));
    const { model, calls } = scriptedModel([
      turn([call('check_doi', { doi: 'doi:10.1234/example' }), call('check_doi', { doi: '10.9999/nothing' }), call('check_doi', { doi: '10.5678/x' })]),
      turn([call('report', { outcome: 'inconclusive', summary: 'Unclear.', sources: [] })]),
    ]);
    await runWebCheck(input, deps({ ai: fakeAi(model), crossrefByDoi }));
    const results = JSON.stringify(toolResultsIn(calls[1]!));
    expect(results).toContain('Coastal fisheries management in the Visayas');
    expect(results).toContain('"exists":false');
    expect(results).toContain('Crossref could not be reached');
  });

  it('does not call a work missing when the search itself failed', async () => {
    const search = new FakeSearch({}, new WebSearchError('Tavily refused the API key'));
    const { model, calls } = scriptedModel([
      turn([call('web_search', { query: 'Coastal fisheries' })]),
      turn([call('report', { outcome: 'not_found', summary: 'No trace of it anywhere.', sources: [] })]),
    ]);
    const { finding } = await runWebCheck(input, deps({ ai: fakeAi(model), search }));
    // The model was told the search failed, and its "not found" is not passed on as if it had looked.
    expect(JSON.stringify(toolResultsIn(calls[1]!))).toContain('Tavily refused the API key');
    expect(finding.outcome).toBe('inconclusive');
    expect(finding.adjusted).toMatch(/web search did not work/);
  });

  it('passes on "not found" after a real search that came back empty', async () => {
    const { model } = scriptedModel([
      turn([call('web_search', { query: 'nothing matches this' })]),
      turn([call('report', { outcome: 'not_found', summary: 'No trace of it anywhere.', sources: [] })]),
    ]);
    const { finding } = await runWebCheck(input, deps({ ai: fakeAi(model) }));
    expect(finding.outcome).toBe('not_found');
    expect(finding.adjusted).toBeUndefined();
  });

  it('stops searching after six searches in one run', async () => {
    const searches = Array.from({ length: 7 }, (_, i) => call('web_search', { query: `Coastal try ${i}` }));
    const { model, calls } = scriptedModel([turn(searches), turn([call('report', { outcome: 'inconclusive', summary: 'x', sources: [] })])]);
    const search = new FakeSearch({ Coastal: [REPORT_PAGE] });
    await runWebCheck(input, deps({ ai: fakeAi(model), search }));
    expect(search.queries).toHaveLength(6);
    expect(JSON.stringify(toolResultsIn(calls[1]!))).toContain('No searches left');
  });

  it('asks once more when the model answers in prose instead of reporting', async () => {
    const { model, calls } = scriptedModel([turn([text('I think this report exists.')]), turn([found({ sources: [], work: undefined, outcome: 'inconclusive' })])]);
    const { finding } = await runWebCheck(input, deps({ ai: fakeAi(model) }));
    expect(calls).toHaveLength(2);
    expect(JSON.stringify(calls[1]!.prompt)).toContain('Call the report tool now');
    expect(finding.outcome).toBe('inconclusive');
  });

  it('gives up politely when the model never reports', async () => {
    const { model } = scriptedModel([turn([text('Hmm.')]), turn([text('Still thinking.')])]);
    const { finding } = await runWebCheck(input, deps({ ai: fakeAi(model) }));
    expect(finding).toMatchObject({ outcome: 'inconclusive', sources: [], summary: expect.stringMatching(/did not reach a conclusion/) });
  });

  it('says so when the provider declines the request', async () => {
    const { model, calls } = scriptedModel([turn([], 'content-filter')]);
    const { finding } = await runWebCheck(input, deps({ ai: fakeAi(model) }));
    expect(calls).toHaveLength(1);
    expect(finding.summary).toMatch(/declined/);
  });

  it('skips a report whose fields are wrong and uses a later, valid one', async () => {
    const { model } = scriptedModel([
      turn([call('report', { outcome: 'maybe', summary: 1 })]),
      turn([call('report', { outcome: 'not_found', summary: 'Nothing.', sources: [] })]),
    ]);
    const search = new FakeSearch();
    const { finding } = await runWebCheck(input, deps({ ai: fakeAi(model), search }));
    // Not found without a search turns into inconclusive; what matters is that the valid report was read.
    expect(finding.summary).toBe('Nothing.');
  });

  it('offers only the report tool on the last step', async () => {
    const { model, calls } = scriptedModel([
      turn([call('web_search', { query: 'Coastal 1' })]),
      turn([call('web_search', { query: 'Coastal 2' })]),
      turn([found()]),
    ]);
    await runWebCheck(input, deps({ ai: fakeAi(model), maxSteps: 3 }));
    expect(toolNames(calls[0]!)).toContain('web_search');
    expect(toolNames(calls[2]!)).toEqual(['report']);
  });

  it('reads pages and searches from the provider’s own web search', async () => {
    const anthropic = createAnthropic({ apiKey: 'test' });
    const page = { url: 'https://worldcat.org/title/12345', title: 'Coastal fisheries management in the Visayas' };
    const { model, calls } = scriptedModel([
      turn([
        call('web_search', { query: '"Coastal fisheries management"' }, { providerExecuted: true, toolCallId: 'srv-1' }),
        { type: 'tool-result', toolCallId: 'srv-1', toolName: 'web_search', result: [{ type: 'web_search_result', url: 'https://other.example/x', title: 'Other' }] },
        { type: 'source', sourceType: 'url', id: 's1', url: page.url, title: page.title },
        found({ sources: [page.url], work: { title: 'Coastal fisheries management in the Visayas', url: page.url } }),
      ]),
    ]);
    const ai = fakeAi(model, { nativeSearch: (maxUses) => anthropic.tools.webSearch_20260318({ maxUses }) });
    const { finding } = await runWebCheck(input, { ...deps({ ai }), search: undefined });
    expect(calls[0]!.tools?.find((t) => t.name === 'web_search')?.type).toBe('provider');
    expect(finding.outcome).toBe('found');
    expect(finding.sources).toEqual([page]);
    expect(finding.queries).toEqual(['"Coastal fisheries management"']);
  });

  it('refuses to run with no way to search', async () => {
    const { model } = scriptedModel([]);
    await expect(runWebCheck(input, { ...deps({ ai: fakeAi(model) }), search: undefined })).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it('turns a provider failure into a message the author can act on', async () => {
    const refused = new APICallError({ message: 'invalid x-api-key', url: 'https://api.anthropic.com/v1/messages', requestBodyValues: {}, statusCode: 401, isRetryable: false });
    const { model } = scriptedModel([refused]);
    const error = await runWebCheck(input, deps({ ai: fakeAi(model) })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiUnavailableError);
    expect((error as Error).message).toBe('The AI provider refused the API key. Ask the administrator to check it.');
    expect((error as Error).message).not.toContain('x-api-key');
  });

  it('lets a cancelled request end the run', async () => {
    const controller = new AbortController();
    const { model } = scriptedModel([]);
    model.doGenerate = async () => {
      controller.abort();
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    };
    await expect(runWebCheck(input, deps({ ai: fakeAi(model), signal: controller.signal }))).rejects.not.toBeInstanceOf(AiUnavailableError);
  });
});

describe('describeFailure', () => {
  const api = (statusCode: number) => new APICallError({ message: 'x', url: 'u', requestBodyValues: {}, statusCode });
  it.each([
    [api(402), /out of credit/],
    [api(429), /busy/],
    [api(529), /had a problem/],
    [{ name: 'AI_RetryError', lastError: api(503) }, /had a problem/],
    [Object.assign(new Error('t'), { name: 'TimeoutError' }), /too long/],
    [new Error('socket hang up'), /could not run/],
  ])('%#', (error, message) => {
    expect(describeFailure(error)).toMatch(message);
  });
});
