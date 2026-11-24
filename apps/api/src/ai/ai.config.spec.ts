import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import { createAiModel } from './model.js';
import { readAiSettings, type AiEnv } from './ai.config.js';

const env = (over: Partial<AiEnv>): AiEnv => ({ AI_DAILY_LIMIT_PER_USER: 20, AI_DAILY_LIMIT: 300, ...over });
const variables = (e: AiEnv) => readAiSettings(e).problems.map((p) => p.variable);

describe('AI settings', () => {
  it('are off when no provider is set, whatever else is', () => {
    expect(readAiSettings(env({ ANTHROPIC_API_KEY: 'k', AI_MODEL: 'x' }))).toEqual({ problems: [] });
  });

  it('use Claude Opus 5.5, the provider’s own key and its own search for Anthropic', () => {
    expect(readAiSettings(env({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant' })).settings).toEqual({
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      apiKey: 'sk-ant',
      baseUrl: undefined,
      search: 'native',
      tavilyApiKey: undefined,
      braveApiKey: undefined,
      dailyLimitPerUser: 20,
      dailyLimit: 300,
    });
  });

  it('prefer AI_API_KEY and AI_MODEL to the defaults', () => {
    const s = readAiSettings(env({ AI_PROVIDER: 'anthropic', AI_API_KEY: 'a', ANTHROPIC_API_KEY: 'b', AI_MODEL: 'claude-sonnet-5-5' })).settings;
    expect(s).toMatchObject({ apiKey: 'a', model: 'claude-sonnet-5-5' });
  });

  it('need a key for a hosted provider', () => {
    expect(variables(env({ AI_PROVIDER: 'anthropic' }))).toEqual(['AI_API_KEY']);
    expect(readAiSettings(env({ AI_PROVIDER: 'openai', AI_MODEL: 'm' })).problems[0]!.message).toMatch(/OPENAI_API_KEY/);
  });

  it('need a model for every provider but Anthropic', () => {
    expect(variables(env({ AI_PROVIDER: 'gateway', AI_GATEWAY_API_KEY: 'k' }))).toEqual(['AI_MODEL']);
  });

  it('need an address, but no key, for an OpenAI-compatible server', () => {
    expect(variables(env({ AI_PROVIDER: 'openai-compatible', AI_MODEL: 'llama3.3', TAVILY_API_KEY: 't' }))).toEqual(['AI_BASE_URL']);
    const s = readAiSettings(env({ AI_PROVIDER: 'openai-compatible', AI_MODEL: 'llama3.3', AI_BASE_URL: 'http://localhost:11434/v1', TAVILY_API_KEY: 't' })).settings;
    expect(s).toMatchObject({ apiKey: undefined, search: 'tavily' });
  });

  it('need a search API for a provider that has no search of its own', () => {
    expect(variables(env({ AI_PROVIDER: 'google', AI_MODEL: 'g', GOOGLE_GENERATIVE_AI_API_KEY: 'k' }))).toEqual(['AI_WEB_SEARCH']);
    expect(variables(env({ AI_PROVIDER: 'google', AI_MODEL: 'g', GOOGLE_GENERATIVE_AI_API_KEY: 'k', AI_WEB_SEARCH: 'native' }))).toEqual(['AI_WEB_SEARCH']);
    expect(readAiSettings(env({ AI_PROVIDER: 'google', AI_MODEL: 'g', GOOGLE_GENERATIVE_AI_API_KEY: 'k', BRAVE_SEARCH_API_KEY: 'b' })).settings?.search).toBe('brave');
  });

  it('need the key of the search API that is asked for', () => {
    expect(variables(env({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k', AI_WEB_SEARCH: 'tavily' }))).toEqual(['TAVILY_API_KEY']);
    expect(variables(env({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k', AI_WEB_SEARCH: 'brave' }))).toEqual(['BRAVE_SEARCH_API_KEY']);
  });
});

describe('the environment', () => {
  const required = { DATABASE_URL: 'postgresql://x' };

  it('starts with AI off by default', () => {
    expect(loadConfig({ ...required }).ai).toBeUndefined();
  });

  it('reads the AI settings, treating empty values as unset', () => {
    const config = loadConfig({ ...required, AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant', AI_MODEL: '', AI_DAILY_LIMIT: '50', AI_DAILY_LIMIT_PER_USER: '' });
    expect(config.ai).toMatchObject({ provider: 'anthropic', model: 'claude-opus-5-5', dailyLimit: 50, dailyLimitPerUser: 5 });
  });

  it('refuses to start with the AI step half set up, and says what to fix', () => {
    expect(() => loadConfig({ ...required, AI_PROVIDER: 'anthropic' })).toThrow(/AI_API_KEY: set it, or ANTHROPIC_API_KEY/);
    expect(() => loadConfig({ ...required, AI_PROVIDER: 'mistral' })).toThrow(/AI_PROVIDER/);
    expect(() => loadConfig({ ...required, AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k', AI_DAILY_LIMIT: '-1' })).toThrow(/AI_DAILY_LIMIT/);
  });
});

describe('the provider adapter', () => {
  const settings = { apiKey: 'k', search: 'native' as const, dailyLimit: 1, dailyLimitPerUser: 1 };

  it.each([
    ['anthropic', 'claude-opus-5-5', 'anthropic.messages', true],
    ['openai', 'an-openai-model', 'openai.responses', true],
    ['google', 'a-gemini-model', 'google.generative-ai', false],
    ['gateway', 'anthropic/claude-opus-5.5', 'gateway', true],
  ] as const)('builds a %s model', (provider, model, sdkProvider, hasSearch) => {
    const ai = createAiModel({ ...settings, provider, model });
    expect(ai.label).toBe(`${provider}/${model}`);
    expect(typeof ai.model === 'object' && ai.model.modelId).toBe(model);
    expect(typeof ai.model === 'object' && ai.model.provider).toBe(sdkProvider);
    expect(!!ai.nativeSearch).toBe(hasSearch);
    if (hasSearch) expect(ai.nativeSearch!(3).type).toBe('provider');
  });

  it('builds a model on any OpenAI-compatible server', () => {
    const ai = createAiModel({ ...settings, provider: 'openai-compatible', model: 'llama3.3', baseUrl: 'http://localhost:11434/v1', search: 'tavily' });
    expect(typeof ai.model === 'object' && ai.model.modelId).toBe('llama3.3');
    expect(ai.nativeSearch).toBeUndefined();
  });

  it('uses an Anthropic web search whose results come back in the response, so they can be checked', () => {
    const search = createAiModel({ ...settings, provider: 'anthropic', model: 'claude-opus-5-5' }).nativeSearch!(4);
    expect(search).toMatchObject({ type: 'provider', id: 'anthropic.web_search_20250305', args: { maxUses: 4 } });
  });

  it('asks Anthropic for a fallback model only on models that support one', () => {
    expect(createAiModel({ ...settings, provider: 'anthropic', model: 'claude-opus-5-5' }).providerOptions).toEqual({ anthropic: { fallbacks: 'default' } });
    expect(createAiModel({ ...settings, provider: 'anthropic', model: 'claude-haiku-4-5' }).providerOptions).toBeUndefined();
  });
});
