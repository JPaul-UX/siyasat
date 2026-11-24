import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { UsageService } from './usage.service.js';

describe('counting usage for today', () => {
  it('adds what is still in memory to what the database holds, for one account or for everyone', async () => {
    const queryRaw = vi.fn(async () => [{ n: 5 }]);
    const usage = new UsageService({ $queryRaw: queryRaw } as unknown as PrismaService, { statsTimeZone: 'Asia/Manila' } as AppConfig);
    usage.record('u1', 'ai');
    usage.record('u1', 'ai');
    usage.record('u2', 'ai');
    usage.record('u1', 'verify');

    expect(await usage.countToday('ai', 'u1')).toBe(7);
    expect(await usage.countToday('ai')).toBe(8);
    expect(await usage.countToday('verify')).toBe(6);
    // The account is a bound parameter, never pasted into the SQL.
    const [strings, ...values] = queryRaw.mock.calls[0]! as unknown as [TemplateStringsArray, ...unknown[]];
    expect(strings.join('?')).toContain('user_id = ?::uuid');
    expect(values).toEqual([usage.dayOf(), 'ai', 'u1']);
  });
});
