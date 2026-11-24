import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { UsageKind } from '@siyasat/core';
import { AppConfig } from '../config.js';
import { PrismaService } from '../prisma/prisma.service.js';

const FLUSH_EVERY_MS = 10_000;

/**
 * Counts each account's lookups per day, and how often a rate limit refused it. Lookups come many to the
 * second while a check runs, so counts gather in memory and are written in one statement every few seconds.
 */
@Injectable()
export class UsageService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(UsageService.name);
  /** "userId|day|kind" → count not yet written. */
  private pending = new Map<string, number>();
  private timer?: NodeJS.Timeout;
  private readonly dayFormat: Intl.DateTimeFormat;

  constructor(
    private readonly prisma: PrismaService,
    config: AppConfig,
  ) {
    // en-CA writes dates as YYYY-MM-DD.
    this.dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: config.statsTimeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  /** The calendar day, YYYY-MM-DD, that a moment falls on in the stats time zone. */
  dayOf(date: Date = new Date()): string {
    return this.dayFormat.format(date);
  }

  record(userId: string, kind: UsageKind): void {
    const key = `${userId}|${this.dayOf()}|${kind}`;
    this.pending.set(key, (this.pending.get(key) ?? 0) + 1);
  }

  /** How many of one kind of lookup ran today: by one account, or by everyone when no account is given. */
  async countToday(kind: UsageKind, userId?: string): Promise<number> {
    const day = this.dayOf();
    let pending = 0;
    for (const [key, count] of this.pending) {
      const [user, d, k] = key.split('|');
      if (d === day && k === kind && (!userId || user === userId)) pending += count;
    }
    const rows = userId
      ? await this.prisma.$queryRaw<{ n: number }[]>`
          SELECT COALESCE(SUM(count), 0)::int AS n FROM usage_daily WHERE day = ${day}::date AND kind = ${kind} AND user_id = ${userId}::uuid`
      : await this.prisma.$queryRaw<{ n: number }[]>`
          SELECT COALESCE(SUM(count), 0)::int AS n FROM usage_daily WHERE day = ${day}::date AND kind = ${kind}`;
    return (rows[0]?.n ?? 0) + pending;
  }

  onModuleInit(): void {
    this.timer = setInterval(() => void this.flush(), FLUSH_EVERY_MS);
    this.timer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.flush();
  }

  /** Write what has been counted. The admin dashboard calls this first, so its numbers are current. */
  async flush(): Promise<void> {
    if (!this.pending.size) return;
    const batch = this.pending;
    this.pending = new Map();
    const users: string[] = [];
    const days: string[] = [];
    const kinds: string[] = [];
    const counts: number[] = [];
    for (const [key, count] of batch) {
      const [user, day, kind] = key.split('|') as [string, string, string];
      users.push(user);
      days.push(day);
      kinds.push(kind);
      counts.push(count);
    }
    try {
      // An account deleted since its lookups were counted is skipped rather than failing the whole batch.
      await this.prisma.$executeRaw`
        INSERT INTO usage_daily (user_id, day, kind, count)
        SELECT u.user_id, u.day, u.kind, u.count
        FROM unnest(${users}::text[]::uuid[], ${days}::text[]::date[], ${kinds}::text[], ${counts}::int[]) AS u(user_id, day, kind, count)
        WHERE EXISTS (SELECT 1 FROM users WHERE users.id = u.user_id)
        ON CONFLICT (user_id, day, kind) DO UPDATE SET count = usage_daily.count + EXCLUDED.count`;
    } catch (e) {
      // Keep the counts for the next try.
      for (const [key, count] of batch) this.pending.set(key, (this.pending.get(key) ?? 0) + count);
      this.log.warn(`Could not save usage counts: ${e}`);
    }
  }
}
