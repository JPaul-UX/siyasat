import { HttpException, HttpStatus, Inject, Injectable, Logger, Optional, ServiceUnavailableException } from '@nestjs/common';
import { norm, type AiFinding, type AiStatus, type WebCheckRequest, type WebCheckResponse } from '@siyasat/core';
import type { AuthUser } from '../auth/auth.service.js';
import { UsageService } from '../auth/usage.service.js';
import { AppConfig } from '../config.js';
import { SourcesService } from '../lookup/sources.service.js';
import { Lane } from '../upstream/lane.js';
import { TtlCache } from '../upstream/ttl-cache.js';
import { createAiModel, type AiModel } from './model.js';
import { AiUnavailableError, runWebCheck, type WebCheckDeps, type WebCheckRun } from './web-check.js';
import { createWebSearch, type WebSearch } from './web-search.js';

/** What the AI step runs on. Built from the settings, or handed in by tests. */
export interface AiRuntime {
  ai: AiModel;
  search?: WebSearch;
  dailyLimitPerUser: number;
  dailyLimit: number;
  /** Swaps the workflow, for tests of the service around it. */
  run?: (input: Parameters<typeof runWebCheck>[0], deps: WebCheckDeps) => Promise<WebCheckRun>;
}
export const AI_RUNTIME = Symbol('AI_RUNTIME');

const HOUR = 3_600_000;
/** A work found on the web stays found; one that was not may turn up, so that answer is kept for less time. */
const CACHE_FOR: Record<AiFinding['outcome'], number> = { found: 7 * 24 * HOUR, not_found: 24 * HOUR, inconclusive: 6 * HOUR };
/** AI runs at once, across all accounts, and per account. */
const RUNS_AT_ONCE = 4;
const RUNS_PER_ACCOUNT = 2;

/**
 * The optional AI web search, with what keeps its cost in check: a daily allowance per account and for
 * everyone together, a limit on runs at once, and a cache so the same reference is not searched twice.
 */
@Injectable()
export class AiService {
  private readonly log = new Logger(AiService.name);
  private readonly runtime?: AiRuntime;
  private readonly cache = new TtlCache<AiFinding>(3000);
  private readonly lane = new Lane(RUNS_AT_ONCE);
  private readonly running = new Map<string, number>();

  constructor(
    config: AppConfig,
    private readonly sources: SourcesService,
    private readonly usage: UsageService,
    @Optional() @Inject(AI_RUNTIME) runtime?: AiRuntime,
  ) {
    if (runtime) {
      this.runtime = runtime;
    } else if (config.ai) {
      this.runtime = {
        ai: createAiModel(config.ai),
        search: createWebSearch(config.ai),
        dailyLimitPerUser: config.ai.dailyLimitPerUser,
        dailyLimit: config.ai.dailyLimit,
      };
    }
    if (this.runtime) {
      const { ai, search, dailyLimitPerUser, dailyLimit } = this.runtime;
      this.log.log(`AI web search is on: ${ai.label}, searching with ${search?.name ?? 'the provider’s own search'}; ${dailyLimitPerUser} a day per account, ${dailyLimit} in all`);
    } else {
      this.log.log('AI web search is off (AI_PROVIDER is not set).');
    }
  }

  get enabled(): boolean {
    return !!this.runtime;
  }

  /** What the AI step may still do for this account today. Unlimited for the super admin, up to the daily total. */
  private async remaining(user: AuthUser): Promise<number> {
    const rt = this.runtime!;
    const [mine, everyone] = await Promise.all([
      user.role === 'super_admin' ? Promise.resolve(0) : this.usage.countToday('ai', user.id),
      this.usage.countToday('ai'),
    ]);
    const total = Math.max(0, rt.dailyLimit - everyone);
    return user.role === 'super_admin' ? total : Math.min(total, Math.max(0, rt.dailyLimitPerUser - mine));
  }

  async status(user: AuthUser): Promise<AiStatus> {
    if (!this.runtime) return { enabled: false };
    return {
      enabled: true,
      model: this.runtime.ai.label,
      search: this.runtime.search?.name ?? 'native',
      remainingToday: await this.remaining(user),
    };
  }

  async webCheck(user: AuthUser, req: WebCheckRequest, signal?: AbortSignal): Promise<WebCheckResponse> {
    const rt = this.runtime;
    if (!rt) throw new ServiceUnavailableException('AI web search is not switched on for this site.');

    const key = norm(req.raw);
    const hit = req.fresh ? undefined : this.cache.get(key);
    if (hit) return { finding: hit, cached: true, remainingToday: await this.remaining(user) };

    const left = await this.remaining(user);
    if (left <= 0) {
      throw new HttpException(
        { statusCode: 429, message: 'You have used today’s AI web searches. They start again tomorrow.', reason: 'ai_daily_limit' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const mine = this.running.get(user.id) ?? 0;
    if (mine >= RUNS_PER_ACCOUNT) {
      throw new HttpException({ statusCode: 429, message: 'Wait for your other AI web searches to finish.', reason: 'ai_busy' }, HttpStatus.TOO_MANY_REQUESTS);
    }

    this.running.set(user.id, mine + 1);
    try {
      const started = Date.now();
      const run = await this.lane.run(() => {
        // Counted when it starts: a run costs money whether or not it ends well.
        this.usage.record(user.id, 'ai');
        return (rt.run ?? runWebCheck)(
          { raw: req.raw, verdict: req.verdict, note: req.note },
          { ai: rt.ai, search: rt.search, crossrefByDoi: (doi) => this.sources.crossrefByDoi(doi), signal },
        );
      });
      this.log.log(
        `AI web search: ${run.finding.outcome} in ${((Date.now() - started) / 1000).toFixed(1)}s, ${run.steps} steps, ` +
          `${run.inputTokens} tokens in, ${run.outputTokens} out (${rt.ai.label})`,
      );
      this.cache.set(key, run.finding, CACHE_FOR[run.finding.outcome]);
      return { finding: run.finding, cached: false, remainingToday: Math.max(0, left - 1) };
    } catch (e) {
      if (e instanceof AiUnavailableError) {
        this.log.warn(`AI web search failed: ${e.message}${e.cause ? ` (${String(e.cause)})` : ''}`);
        throw new ServiceUnavailableException(e.message);
      }
      if (signal?.aborted) throw new HttpException('The request was cancelled.', 499);
      throw e;
    } finally {
      const now = (this.running.get(user.id) ?? 1) - 1;
      if (now > 0) this.running.set(user.id, now);
      else this.running.delete(user.id);
    }
  }
}
