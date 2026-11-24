/* Test doubles for the AI step: a model that plays a script, and a search engine with fixed answers. */
import type { LanguageModelV4CallOptions, LanguageModelV4Content, LanguageModelV4GenerateResult } from '@ai-sdk/provider';
import type { Candidate } from '@siyasat/core';
import { MockLanguageModelV4 } from 'ai/test';
import type { AiModel } from '../src/ai/model.js';
import type { WebResult, WebSearch } from '../src/ai/web-search.js';

let ids = 0;

export const call = (toolName: string, input: unknown, extra: Partial<Extract<LanguageModelV4Content, { type: 'tool-call' }>> = {}): LanguageModelV4Content => ({
  type: 'tool-call',
  toolCallId: `call-${++ids}`,
  toolName,
  input: JSON.stringify(input),
  ...extra,
});

export const text = (t: string): LanguageModelV4Content => ({ type: 'text', text: t });

/** One answer from the model. Finishes with tool-calls when it holds a call that we run, else with stop. */
export function turn(content: LanguageModelV4Content[], finish?: 'stop' | 'tool-calls' | 'content-filter'): LanguageModelV4GenerateResult {
  const unified = finish ?? (content.some((c) => c.type === 'tool-call' && !c.providerExecuted) ? 'tool-calls' : 'stop');
  return {
    content,
    finishReason: { unified, raw: undefined },
    usage: {
      inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 20, text: 20, reasoning: undefined },
    },
    warnings: [],
  };
}

/** A model that gives these answers in order, and records what it was asked. */
export function scriptedModel(turns: (LanguageModelV4GenerateResult | Error)[]) {
  const calls: LanguageModelV4CallOptions[] = [];
  const queue = [...turns];
  const model = new MockLanguageModelV4({
    provider: 'fake',
    modelId: 'fake-model',
    doGenerate: async (options) => {
      calls.push(options);
      const next = queue.shift();
      if (!next) throw new Error(`The script ran out after ${calls.length - 1} answers`);
      if (next instanceof Error) throw next;
      return next;
    },
  });
  return { model, calls };
}

export function fakeAi(model: MockLanguageModelV4, extra: Partial<AiModel> = {}): AiModel {
  return { model, label: 'fake/fake-model', provider: 'anthropic', ...extra };
}

/** A search engine that answers each query from a table (by substring), and records the queries. */
export class FakeSearch implements WebSearch {
  readonly name = 'tavily';
  readonly queries: string[] = [];
  constructor(
    private readonly answers: Record<string, WebResult[]> = {},
    private readonly fail?: Error,
  ) {}

  async search(query: string): Promise<WebResult[]> {
    this.queries.push(query);
    if (this.fail) throw this.fail;
    for (const [needle, results] of Object.entries(this.answers)) if (query.includes(needle)) return results;
    return [];
  }
}

export function record(over: Partial<Candidate> = {}): Candidate {
  return {
    source: 'Crossref',
    doi: '10.1234/example',
    title: 'A study of things',
    authors: [{ family: 'Cruz', given: 'Maria' }],
    year: 2020,
    venue: 'Journal of Things',
    pages: '',
    cites: 0,
    retracted: false,
    ...over,
  };
}

/** The text of every tool result the model was shown in one call. */
export function toolResultsIn(options: LanguageModelV4CallOptions): unknown[] {
  return options.prompt.flatMap((m) => (m.role === 'tool' ? m.content : [])).flatMap((p) => (p.type === 'tool-result' ? [p.output] : []));
}

/** The names of the tools offered to the model in one call. */
export const toolNames = (options: LanguageModelV4CallOptions): string[] => (options.tools ?? []).map((t) => t.name);
