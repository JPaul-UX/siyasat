import { HttpException } from '@nestjs/common';
import type { AiFinding, WebCheckRequest } from '@siyasat/core';
import { describe, expect, it, vi } from 'vitest';
import { fakeAi, scriptedModel } from '../../test/ai-fakes.js';
import type { AuthUser } from '../auth/auth.service.js';
import type { UsageService } from '../auth/usage.service.js';
import type { AppConfig } from '../config.js';
import type { SourcesService } from '../lookup/sources.service.js';
import { AiService, type AiRuntime } from './ai.service.js';
import { AiUnavailableError, type WebCheckRun } from './web-check.js';

const user = (over: Partial<AuthUser> = {}): AuthUser => ({
  id: 'u1',
  email: 'a@example.org',
  name: 'A',
  role: 'user',
  status: 'active',
  workspaceId: 'w1',
  createdAt: new Date(),
  ...over,
});

const finding = (outcome: AiFinding['outcome'] = 'found'): AiFinding => ({ outcome, summary: 's', sources: [], queries: [], model: 'fake/fake-model', date: '2026-11-24T00:00:00.000Z' });

/** Usage counted in memory, the way the database would count it. */
function fakeUsage(start: { mine?: number; everyone?: number } = {}) {
  const counts = { mine: start.mine ?? 0, everyone: start.everyone ?? 0 };
  const usage = {
    record: vi.fn(() => {
      counts.mine++;
      counts.everyone++;
    }),
    countToday: vi.fn(async (_kind: string, userId?: string) => (userId ? counts.mine : counts.everyone)),
  };
  return { usage: usage as unknown as UsageService & typeof usage, counts };
}

function service(over: Partial<AiRuntime> = {}, start?: { mine?: number; everyone?: number }) {
  const { usage, counts } = fakeUsage(start);
  const run = vi.fn(async (): Promise<WebCheckRun> => ({ finding: finding(), steps: 2, inputTokens: 10, outputTokens: 5 }));
  const runtime: AiRuntime = { ai: fakeAi(scriptedModel([]).model), dailyLimitPerUser: 3, dailyLimit: 10, run, ...over };
  const crossrefByDoi = vi.fn(async () => null);
  const ai = new AiService({} as AppConfig, { crossrefByDoi } as unknown as SourcesService, usage, runtime);
  return { ai, usage, counts, run: (over.run as typeof run | undefined) ?? run, crossrefByDoi };
}

const req: WebCheckRequest = { raw: 'Santos, A. (2021). Mangrove loss in Eastern Samar. J Phil Ecol.', verdict: 'not_found' };

describe('the AI service', () => {
  it('is off without settings, and says so', async () => {
    const { usage } = fakeUsage();
    const ai = new AiService({} as AppConfig, {} as SourcesService, usage);
    expect(ai.enabled).toBe(false);
    expect(await ai.status(user())).toEqual({ enabled: false });
    await expect(ai.webCheck(user(), req)).rejects.toMatchObject({ status: 503 });
  });

  it('reports the model, the search and what is left today', async () => {
    const { ai } = service({}, { mine: 1, everyone: 4 });
    expect(await ai.status(user())).toEqual({ enabled: true, model: 'fake/fake-model', search: 'native', remainingToday: 2 });
  });

  it('runs the search, counts it, and hands the workflow the Crossref lookup', async () => {
    const { ai, run, usage, crossrefByDoi } = service();
    const res = await ai.webCheck(user(), req);
    expect(res).toEqual({ finding: finding(), cached: false, remainingToday: 2 });
    expect(usage.record).toHaveBeenCalledExactlyOnceWith('u1', 'ai');
    const [input, deps] = run.mock.calls[0]! as unknown as Parameters<NonNullable<AiRuntime['run']>>;
    expect(input).toEqual({ raw: req.raw, verdict: 'not_found', note: undefined });
    await deps.crossrefByDoi('10.1/x');
    expect(crossrefByDoi).toHaveBeenCalledWith('10.1/x');
  });

  it('answers the same reference from the cache, for free, unless asked to search again', async () => {
    const { ai, run, usage } = service();
    await ai.webCheck(user(), req);
    const again = await ai.webCheck(user({ id: 'u2' }), { ...req, raw: `  ${req.raw.toUpperCase()} ` });
    expect(again.cached).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(usage.record).toHaveBeenCalledTimes(1);

    await ai.webCheck(user(), { ...req, fresh: true });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('stops an account at its daily allowance', async () => {
    const { ai, run } = service({}, { mine: 3, everyone: 3 });
    const error = await ai.webCheck(user(), req).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as HttpException).getResponse()).toMatchObject({ reason: 'ai_daily_limit' });
    expect(run).not.toHaveBeenCalled();
  });

  it('lets the super admin past the per-account allowance, but not past the site’s', async () => {
    const { ai } = service({}, { mine: 3, everyone: 3 });
    const admin = user({ role: 'super_admin' });
    expect((await ai.webCheck(admin, req)).remainingToday).toBe(6);

    const full = service({}, { mine: 0, everyone: 10 });
    await expect(full.ai.webCheck(admin, req)).rejects.toMatchObject({ status: 429 });
  });

  it('lets one account run only two searches at once', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const run = vi.fn(async (): Promise<WebCheckRun> => {
      await gate;
      return { finding: finding(), steps: 1, inputTokens: 0, outputTokens: 0 };
    });
    const { ai } = service({ run, dailyLimitPerUser: 10 });
    const first = ai.webCheck(user(), { ...req, raw: 'one reference here' });
    const second = ai.webCheck(user(), { ...req, raw: 'two reference here' });
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    await expect(ai.webCheck(user(), { ...req, raw: 'three reference here' })).rejects.toMatchObject({ response: { reason: 'ai_busy' } });
    // Another account is not held up.
    const other = ai.webCheck(user({ id: 'u2' }), { ...req, raw: 'four reference here' });
    release();
    await Promise.all([first, second, other]);
    // With both finished, the account can search again.
    await expect(ai.webCheck(user(), { ...req, raw: 'five reference here' })).resolves.toMatchObject({ cached: false });
  });

  it('turns a provider failure into 503 with the message, and caches nothing', async () => {
    const run = vi.fn(async (): Promise<WebCheckRun> => {
      throw new AiUnavailableError('The AI provider refused the API key. Ask the administrator to check it.');
    });
    const { ai } = service({ run });
    await expect(ai.webCheck(user(), req)).rejects.toMatchObject({ status: 503, message: 'The AI provider refused the API key. Ask the administrator to check it.' });
    await expect(ai.webCheck(user(), req)).rejects.toMatchObject({ status: 503 });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('keeps "not found" in the cache for less time than "found"', async () => {
    vi.useFakeTimers();
    try {
      const run = vi.fn(async (): Promise<WebCheckRun> => ({ finding: finding('not_found'), steps: 1, inputTokens: 0, outputTokens: 0 }));
      const { ai } = service({ run, dailyLimitPerUser: 10 });
      await ai.webCheck(user(), req);
      vi.advanceTimersByTime(23 * 3_600_000);
      expect((await ai.webCheck(user(), req)).cached).toBe(true);
      vi.advanceTimersByTime(2 * 3_600_000);
      expect((await ai.webCheck(user(), req)).cached).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
