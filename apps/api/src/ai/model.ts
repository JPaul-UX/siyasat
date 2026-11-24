import { createAnthropic } from '@ai-sdk/anthropic';
import { createGateway } from '@ai-sdk/gateway';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel, Tool } from 'ai';
import type { AiProviderName, AiSettings } from './ai.config.js';

/** Options passed to the provider with every call, keyed by provider, as the AI SDK takes them. */
export type ProviderOptions = Record<string, Record<string, string | number | boolean | null>>;

/**
 * The one place that knows about AI providers. Everything else gets a model that speaks the AI SDK's common
 * interface, so switching provider is a change of settings, not of code.
 */
export interface AiModel {
  model: LanguageModel;
  /** "provider/model", shown to the author next to what the AI found. */
  label: string;
  provider: AiProviderName;
  /** The provider's own web search, run on its servers, when it has one. */
  nativeSearch?: (maxUses: number) => Tool;
  providerOptions?: ProviderOptions;
}

/**
 * Anthropic models that accept server-side fallbacks: when the model's safety classifier declines a turn, the
 * API answers it with a fallback model instead of returning nothing. A citation check should never trip one,
 * but if it does the author still gets an answer.
 */
const ANTHROPIC_FALLBACKS = /^claude-(?:opus-5|sonnet-5-5|fable-5|mythos-5)/;

export function createAiModel(s: AiSettings): AiModel {
  const label = `${s.provider}/${s.model}`;
  const baseURL = s.baseUrl;
  switch (s.provider) {
    case 'anthropic': {
      const provider = createAnthropic({ apiKey: s.apiKey, baseURL });
      return {
        model: provider(s.model),
        label,
        provider: s.provider,
        // The basic search on purpose. The grounding check must see every page the model saw, and the newer
        // search with dynamic filtering hides results behind code execution unless told to return them all; on
        // this task it also used about twice the tokens (measured 2026-11-24, Claude Opus 5.5).
        nativeSearch: (maxUses) => provider.tools.webSearch_20250305({ maxUses }),
        providerOptions: ANTHROPIC_FALLBACKS.test(s.model) ? { anthropic: { fallbacks: 'default' } } : undefined,
      };
    }
    case 'openai': {
      const provider = createOpenAI({ apiKey: s.apiKey, baseURL });
      return { model: provider(s.model), label, provider: s.provider, nativeSearch: () => provider.tools.webSearch({}) };
    }
    case 'google': {
      const provider = createGoogleGenerativeAI({ apiKey: s.apiKey, baseURL });
      return { model: provider(s.model), label, provider: s.provider };
    }
    case 'gateway': {
      const provider = createGateway({ apiKey: s.apiKey, baseURL });
      return { model: provider(s.model), label, provider: s.provider, nativeSearch: () => provider.tools.perplexitySearch({ maxResults: 8 }) };
    }
    case 'openai-compatible': {
      const provider = createOpenAICompatible({ name: 'openai-compatible', apiKey: s.apiKey, baseURL: s.baseUrl! });
      return { model: provider(s.model), label, provider: s.provider };
    }
  }
}
