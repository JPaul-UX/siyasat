import { z } from 'zod';

/*
 * The optional AI step's settings. Nothing here is required: with AI_PROVIDER unset the step is off and the
 * rest of Siyasat works exactly as before. Once AI_PROVIDER is set, a setting that is missing or wrong stops
 * the API at start-up, so that a half-configured AI step is noticed at once rather than at the first click.
 */

export const AI_PROVIDERS = ['anthropic', 'openai', 'google', 'gateway', 'openai-compatible'] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];

export const WEB_SEARCHES = ['native', 'tavily', 'brave'] as const;
export type WebSearchName = (typeof WEB_SEARCHES)[number];

/** The model used when AI_MODEL is not set. Only Anthropic has one: other providers name models too differently. */
export const DEFAULT_MODELS: Partial<Record<AiProviderName, string>> = { anthropic: 'claude-opus-5-5' };

/** Each provider's own variable for its key, read when AI_API_KEY is not set. */
export const PROVIDER_KEY_VARS: Record<AiProviderName, string | null> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  gateway: 'AI_GATEWAY_API_KEY',
  // A local or self-hosted server (Ollama, LM Studio, vLLM) often needs no key at all.
  'openai-compatible': null,
};

/**
 * Providers that run a web search themselves, so no separate search key is needed. Google is left out on
 * purpose: its search grounding cannot always be combined with the app's own tools in one request.
 */
export const NATIVE_SEARCH: ReadonlySet<AiProviderName> = new Set(['anthropic', 'openai', 'gateway']);

/** An unset variable and an empty one mean the same thing. */
const optional = <T extends z.ZodType>(schema: T) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional());
const limit = (fallback: number) => z.preprocess((v) => (v === '' ? undefined : v), z.coerce.number().int().min(0).max(100_000).default(fallback));

export const aiEnvShape = {
  /** Which AI provider to use. Unset: the AI step is off. */
  AI_PROVIDER: optional(z.enum(AI_PROVIDERS)),
  /** The model, in the provider's own naming, e.g. "claude-opus-5-5", or "anthropic/claude-opus-5.5" on the gateway. */
  AI_MODEL: optional(z.string().trim().min(1).max(200)),
  /** The provider's API key. Falls back to the provider's own variable (ANTHROPIC_API_KEY and so on). */
  AI_API_KEY: optional(z.string().trim()),
  /** The server's address: required for openai-compatible, and lets the others go through a proxy. */
  AI_BASE_URL: optional(z.url()),
  /** Where the AI searches: the provider's own search ("native"), Tavily or Brave. */
  AI_WEB_SEARCH: optional(z.enum(WEB_SEARCHES)),
  ANTHROPIC_API_KEY: optional(z.string().trim()),
  OPENAI_API_KEY: optional(z.string().trim()),
  GOOGLE_GENERATIVE_AI_API_KEY: optional(z.string().trim()),
  AI_GATEWAY_API_KEY: optional(z.string().trim()),
  TAVILY_API_KEY: optional(z.string().trim()),
  BRAVE_SEARCH_API_KEY: optional(z.string().trim()),
  /** AI web searches one account may run in a day. 0 switches the step off for everyone but the super admin. */
  AI_DAILY_LIMIT_PER_USER: limit(5),
  /**
   * AI web searches all accounts together may run in a day: the ceiling on what the step can cost. One search
   * with Claude Opus 5.5 cost about $0.07 to $0.21 when measured, so 20 a day stays near $100 a month at worst.
   */
  AI_DAILY_LIMIT: limit(20),
};

export type AiEnv = z.infer<z.ZodObject<typeof aiEnvShape>>;

export interface AiSettings {
  provider: AiProviderName;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  search: WebSearchName;
  tavilyApiKey?: string;
  braveApiKey?: string;
  dailyLimitPerUser: number;
  dailyLimit: number;
}

/** The AI settings, or the problems that keep them from working. `settings` is undefined when AI is off. */
/** A setting that keeps the AI step from working: the variable to change, and what is wrong with it. */
export interface AiProblem {
  variable: string;
  message: string;
}

export function readAiSettings(env: AiEnv): { settings?: AiSettings; problems: AiProblem[] } {
  const provider = env.AI_PROVIDER;
  if (!provider) return { problems: [] };
  const problems: AiProblem[] = [];
  const problem = (variable: string, message: string) => problems.push({ variable, message });

  const model = env.AI_MODEL ?? DEFAULT_MODELS[provider];
  if (!model) problem('AI_MODEL', `set the model to use with AI_PROVIDER=${provider}`);

  const keyVar = PROVIDER_KEY_VARS[provider];
  const apiKey = env.AI_API_KEY ?? (keyVar ? (env[keyVar as keyof AiEnv] as string | undefined) : undefined);
  if (!apiKey && keyVar) problem('AI_API_KEY', `set it, or ${keyVar}, to use AI_PROVIDER=${provider}`);
  if (provider === 'openai-compatible' && !env.AI_BASE_URL) {
    problem('AI_BASE_URL', 'set the server address (e.g. http://localhost:11434/v1 for Ollama) to use AI_PROVIDER=openai-compatible');
  }

  let search = env.AI_WEB_SEARCH;
  if (!search) {
    if (NATIVE_SEARCH.has(provider)) search = 'native';
    else if (env.TAVILY_API_KEY) search = 'tavily';
    else if (env.BRAVE_SEARCH_API_KEY) search = 'brave';
  }
  if (!search) {
    problem('AI_WEB_SEARCH', `AI_PROVIDER=${provider} has no web search of its own here; set TAVILY_API_KEY or BRAVE_SEARCH_API_KEY`);
  } else if (search === 'native' && !NATIVE_SEARCH.has(provider)) {
    problem('AI_WEB_SEARCH', `AI_PROVIDER=${provider} has no web search of its own here; use tavily or brave`);
  } else if (search === 'tavily' && !env.TAVILY_API_KEY) {
    problem('TAVILY_API_KEY', 'required with AI_WEB_SEARCH=tavily');
  } else if (search === 'brave' && !env.BRAVE_SEARCH_API_KEY) {
    problem('BRAVE_SEARCH_API_KEY', 'required with AI_WEB_SEARCH=brave');
  }

  if (problems.length || !model || !search) return { problems };
  return {
    settings: {
      provider,
      model,
      apiKey,
      baseUrl: env.AI_BASE_URL,
      search,
      tavilyApiKey: env.TAVILY_API_KEY,
      braveApiKey: env.BRAVE_SEARCH_API_KEY,
      dailyLimitPerUser: env.AI_DAILY_LIMIT_PER_USER,
      dailyLimit: env.AI_DAILY_LIMIT,
    },
    problems,
  };
}
