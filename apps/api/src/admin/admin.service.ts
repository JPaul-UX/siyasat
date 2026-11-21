import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  LOOKUP_KINDS,
  type ActivityType,
  type AdminDay,
  type AdminEvent,
  type AdminEventFilter,
  type AdminEventList,
  type AdminOverview,
  type AdminSettings,
  type AdminUserDetail,
  type AdminUserList,
  type AdminUserRow,
  type AdminUserSort,
  type UsageDay,
  type UsageKind,
  type UserRole,
  type UserStatus,
} from '@siyasat/core';
import { ActivityService } from '../auth/activity.service.js';
import { AuthService } from '../auth/auth.service.js';
import { describeDevice, type RequestMeta } from '../auth/request-info.js';
import { SettingsService } from '../auth/settings.service.js';
import { UsageService } from '../auth/usage.service.js';
import { AppConfig } from '../config.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export const USERS_PER_PAGE = 25;
export const EVENTS_PER_PAGE = 40;
const SERIES_DAYS = 30;
const USAGE_KINDS = new Set<string>([...LOOKUP_KINDS, 'throttled']);

const EVENT_TYPES: Record<AdminEventFilter, ActivityType[] | null> = {
  all: null,
  signups: ['sign_up', 'sign_up_blocked'],
  signins: ['sign_in', 'sign_out'],
  failed: ['sign_in_failed', 'locked', 'sign_up_blocked'],
  admin: ['suspended', 'reactivated', 'unlocked', 'signed_out_everywhere', 'signups_paused', 'signups_opened'],
};

/** A user row as the SQL below returns it. */
interface RawUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  created_at: Date;
  last_seen_at: Date | null;
  last_sign_in_at: Date | null;
  signup_ip: string | null;
  signup_user_agent: string | null;
  locked_until: Date | null;
  failed_sign_ins: number;
  suspended_at: Date | null;
  workspace_id: string;
  checks: number;
  lookups7d: number;
  throttled7d: number;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

const toRow = (u: RawUser): AdminUserRow => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  status: u.status,
  createdAt: u.created_at.toISOString(),
  lastSeenAt: iso(u.last_seen_at),
  lastSignInAt: iso(u.last_sign_in_at),
  signupIp: u.signup_ip,
  signupDevice: describeDevice(u.signup_user_agent),
  lockedUntil: u.locked_until && u.locked_until.getTime() > Date.now() ? u.locked_until.toISOString() : null,
  checks: u.checks,
  lookups7d: u.lookups7d,
  throttled7d: u.throttled7d,
});

/** "2026-11-21" minus some days, as a calendar date. */
const minusDays = (day: string, n: number): string => {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

/** What the super admin's dashboard shows, and what it can do to accounts. */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: UsageService,
    private readonly auth: AuthService,
    private readonly activity: ActivityService,
    private readonly settings: SettingsService,
    private readonly config: AppConfig,
  ) {}

  /** The last `n` calendar days in the stats time zone, oldest first, ending today. */
  private lastDays(n: number): string[] {
    const today = this.usage.dayOf();
    return Array.from({ length: n }, (_, i) => minusDays(today, n - 1 - i));
  }

  /* ---------- Accounts ---------- */

  /** Accounts with their checks and last week's usage. `where`, `order` and paging are SQL fragments. */
  private queryUsers(where: Prisma.Sql, order: Prisma.Sql, limit: number, offset = 0): Promise<RawUser[]> {
    const since = minusDays(this.usage.dayOf(), 6);
    return this.prisma.$queryRaw<RawUser[]>`
      SELECT u.id, u.email, u.name, u.role::text AS role, u.status::text AS status, u.created_at, u.last_seen_at,
        u.last_sign_in_at, u.signup_ip, u.signup_user_agent, u.locked_until, u.failed_sign_ins, u.suspended_at, u.workspace_id,
        COALESCE(c.n, 0)::int AS checks,
        COALESCE(g.lookups, 0)::int AS lookups7d,
        COALESCE(g.throttled, 0)::int AS throttled7d
      FROM users u
      LEFT JOIN (SELECT workspace_id, COUNT(*) AS n FROM checks WHERE deleted_at IS NULL GROUP BY workspace_id) c
        ON c.workspace_id = u.workspace_id
      LEFT JOIN (
        SELECT user_id,
          SUM(count) FILTER (WHERE kind <> 'throttled') AS lookups,
          SUM(count) FILTER (WHERE kind = 'throttled') AS throttled
        FROM usage_daily WHERE day >= ${since}::date GROUP BY user_id
      ) g ON g.user_id = u.id
      ${where}
      ORDER BY ${order}
      LIMIT ${limit} OFFSET ${offset}`;
  }

  async listUsers(params: { q?: string; status?: UserStatus; sort: AdminUserSort; page: number }): Promise<AdminUserList> {
    await this.usage.flush();
    const q = params.q?.trim();
    const pattern = q ? `%${q.replace(/[\\%_]/g, (c) => '\\' + c)}%` : null;
    const status = params.status ?? null;
    const where = Prisma.sql`WHERE (${pattern}::text IS NULL OR u.email ILIKE ${pattern} OR u.name ILIKE ${pattern} OR u.signup_ip = ${q ?? null})
      AND (${status}::text IS NULL OR u.status::text = ${status})`;
    const order = {
      newest: Prisma.sql`u.created_at DESC`,
      oldest: Prisma.sql`u.created_at ASC`,
      active: Prisma.sql`u.last_seen_at DESC NULLS LAST, u.created_at DESC`,
      lookups: Prisma.sql`lookups7d DESC, u.created_at DESC`,
      throttled: Prisma.sql`throttled7d DESC, lookups7d DESC, u.created_at DESC`,
    }[params.sort];
    const [rows, [count]] = await Promise.all([
      this.queryUsers(where, order, USERS_PER_PAGE, (params.page - 1) * USERS_PER_PAGE),
      this.prisma.$queryRaw<{ total: number }[]>`SELECT COUNT(*)::int AS total FROM users u ${where}`,
    ]);
    return { users: rows.map(toRow), total: count?.total ?? 0, page: params.page, pageSize: USERS_PER_PAGE };
  }

  async getUser(id: string): Promise<AdminUserDetail> {
    await this.usage.flush();
    const [raw] = await this.queryUsers(Prisma.sql`WHERE u.id = ${id}::uuid`, Prisma.sql`u.id`, 1);
    if (!raw) throw new NotFoundException('No such account');
    const days = this.lastDays(SERIES_DAYS);
    const [sessions, usageRows, events, lastCheck] = await Promise.all([
      this.prisma.session.findMany({
        where: { userId: id, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastSeenAt: 'desc' },
        take: 50,
      }),
      this.prisma.usageDaily.findMany({ where: { userId: id, day: { gte: new Date(days[0] + 'T00:00:00Z') } } }),
      this.findEvents({ userId: id }, 0, 60),
      this.prisma.check.findFirst({ where: { workspaceId: raw.workspace_id, deletedAt: null }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ]);
    const byDay = new Map<string, UsageDay>(
      days.map((day) => [day, { day, verify: 0, source: 0, enrich: 0, journals: 0, fulltext: 0, throttled: 0 }]),
    );
    for (const r of usageRows) {
      const entry = byDay.get(r.day.toISOString().slice(0, 10));
      if (entry && USAGE_KINDS.has(r.kind)) entry[r.kind as UsageKind] += r.count;
    }
    return {
      user: { ...toRow(raw), signupUserAgent: raw.signup_user_agent, failedSignIns: raw.failed_sign_ins, suspendedAt: iso(raw.suspended_at) },
      sessions: sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        lastSeenAt: s.lastSeenAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        ip: s.ip,
        device: describeDevice(s.userAgent),
      })),
      usage: [...byDay.values()],
      events,
      lastCheckAt: iso(lastCheck?.createdAt ?? null),
    };
  }

  private async target(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true, role: true, status: true } });
    if (!user) throw new NotFoundException('No such account');
    return user;
  }

  /** Suspend an account: it is signed out everywhere and cannot sign in until reactivated. */
  async suspend(id: string, actorId: string, meta: RequestMeta): Promise<AdminUserDetail> {
    const user = await this.target(id);
    if (user.role === 'super_admin') throw new BadRequestException('The super admin can’t be suspended.');
    if (user.status !== 'suspended') {
      await this.prisma.user.update({ where: { id }, data: { status: 'suspended', suspendedAt: new Date() } });
      const sessions = await this.auth.endAllSessions(id);
      await this.activity.record('suspended', { userId: id, actorId, ...meta, detail: { sessionsEnded: sessions } });
    }
    return this.getUser(id);
  }

  async reactivate(id: string, actorId: string, meta: RequestMeta): Promise<AdminUserDetail> {
    const user = await this.target(id);
    if (user.status !== 'active') {
      await this.prisma.user.update({ where: { id }, data: { status: 'active', suspendedAt: null, failedSignIns: 0, lockedUntil: null } });
      this.auth.forgetUser(id);
      await this.activity.record('reactivated', { userId: id, actorId, ...meta });
    }
    return this.getUser(id);
  }

  /** Lift the pause that wrong passwords put on signing in to an account. */
  async unlock(id: string, actorId: string, meta: RequestMeta): Promise<AdminUserDetail> {
    await this.target(id);
    await this.prisma.user.update({ where: { id }, data: { failedSignIns: 0, lockedUntil: null } });
    await this.activity.record('unlocked', { userId: id, actorId, ...meta });
    return this.getUser(id);
  }

  async signOutEverywhere(id: string, actorId: string, meta: RequestMeta): Promise<AdminUserDetail> {
    await this.target(id);
    const sessions = await this.auth.endAllSessions(id);
    await this.activity.record('signed_out_everywhere', { userId: id, actorId, ...meta, detail: { sessionsEnded: sessions } });
    return this.getUser(id);
  }

  /* ---------- Activity ---------- */

  private async findEvents(where: Prisma.ActivityEventWhereInput, skip: number, take: number): Promise<AdminEvent[]> {
    const rows = await this.prisma.activityEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      include: { user: { select: { name: true, email: true } }, actor: { select: { email: true } } },
    });
    return rows.map((e) => ({
      id: e.id,
      type: e.type as ActivityType,
      createdAt: e.createdAt.toISOString(),
      userId: e.userId,
      userName: e.user?.name ?? null,
      email: e.user?.email ?? e.email,
      actorEmail: e.actor?.email ?? null,
      ip: e.ip,
      device: describeDevice(e.userAgent),
      detail: (e.detail as Record<string, unknown> | null) ?? null,
    }));
  }

  async listEvents(filter: AdminEventFilter, page: number): Promise<AdminEventList> {
    const types = EVENT_TYPES[filter];
    const where: Prisma.ActivityEventWhereInput = types ? { type: { in: types } } : {};
    const [events, total] = await Promise.all([
      this.findEvents(where, (page - 1) * EVENTS_PER_PAGE, EVENTS_PER_PAGE),
      this.prisma.activityEvent.count({ where }),
    ]);
    return { events, total, page, pageSize: EVENTS_PER_PAGE };
  }

  /* ---------- Overview ---------- */

  async overview(): Promise<AdminOverview> {
    await this.usage.flush();
    const tz = this.config.statsTimeZone;
    const days = this.lastDays(SERIES_DAYS);
    const today = days[days.length - 1]!;
    const weekAgo = minusDays(today, 6);

    const [[totals], signups, usage, topToday, newest, recent, signupsOpen] = await Promise.all([
      this.prisma.$queryRaw<Record<string, number>[]>`
        SELECT
          (SELECT COUNT(*) FROM users)::int AS users,
          (SELECT COUNT(*) FROM users WHERE status = 'suspended')::int AS suspended,
          (SELECT COUNT(*) FROM users WHERE (created_at AT TIME ZONE ${tz})::date = ${today}::date)::int AS new_today,
          (SELECT COUNT(*) FROM users WHERE (created_at AT TIME ZONE ${tz})::date >= ${weekAgo}::date)::int AS new_7d,
          (SELECT COUNT(*) FROM users WHERE (last_seen_at AT TIME ZONE ${tz})::date = ${today}::date)::int AS active_today,
          (SELECT COUNT(*) FROM sessions WHERE revoked_at IS NULL AND expires_at > now())::int AS active_sessions,
          (SELECT COUNT(*) FROM checks c JOIN users u ON u.workspace_id = c.workspace_id WHERE c.deleted_at IS NULL)::int AS checks,
          (SELECT COALESCE(SUM(count), 0) FROM usage_daily WHERE day = ${today}::date AND kind <> 'throttled')::int AS lookups_today,
          (SELECT COALESCE(SUM(count), 0) FROM usage_daily WHERE day = ${today}::date AND kind = 'throttled')::int AS throttled_today,
          (SELECT COUNT(*) FROM activity_events WHERE type = 'sign_in_failed' AND created_at > now() - interval '24 hours')::int AS failed_24h,
          (SELECT COUNT(*) FROM activity_events WHERE type = 'sign_up_blocked' AND created_at > now() - interval '24 hours')::int AS blocked_24h`,
      this.prisma.$queryRaw<{ day: string; n: number }[]>`
        SELECT to_char((created_at AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
        FROM users WHERE (created_at AT TIME ZONE ${tz})::date >= ${days[0]}::date GROUP BY 1`,
      this.prisma.$queryRaw<{ day: string; lookups: number; throttled: number; active: number }[]>`
        SELECT to_char(day, 'YYYY-MM-DD') AS day,
          COALESCE(SUM(count) FILTER (WHERE kind <> 'throttled'), 0)::int AS lookups,
          COALESCE(SUM(count) FILTER (WHERE kind = 'throttled'), 0)::int AS throttled,
          (COUNT(DISTINCT user_id) FILTER (WHERE kind <> 'throttled'))::int AS active
        FROM usage_daily WHERE day >= ${days[0]}::date GROUP BY day`,
      this.prisma.$queryRaw<AdminOverview['topToday']>`
        SELECT u.id, u.name, u.email,
          COALESCE(SUM(d.count) FILTER (WHERE d.kind <> 'throttled'), 0)::int AS lookups,
          COALESCE(SUM(d.count) FILTER (WHERE d.kind = 'throttled'), 0)::int AS throttled
        FROM usage_daily d JOIN users u ON u.id = d.user_id
        WHERE d.day = ${today}::date
        GROUP BY u.id ORDER BY lookups DESC, throttled DESC LIMIT 6`,
      this.queryUsers(Prisma.empty, Prisma.sql`u.created_at DESC`, 6),
      this.findEvents({}, 0, 12),
      this.settings.signupsOpen(),
    ]);

    const signupsByDay = new Map(signups.map((r) => [r.day, r.n]));
    const usageByDay = new Map(usage.map((r) => [r.day, r]));
    const daily: AdminDay[] = days.map((day) => {
      const u = usageByDay.get(day);
      return { day, signups: signupsByDay.get(day) ?? 0, lookups: u?.lookups ?? 0, throttled: u?.throttled ?? 0, activeUsers: u?.active ?? 0 };
    });
    const t = totals ?? {};
    return {
      timeZone: tz,
      signupsOpen,
      totals: {
        users: t['users'] ?? 0,
        suspended: t['suspended'] ?? 0,
        newToday: t['new_today'] ?? 0,
        new7d: t['new_7d'] ?? 0,
        activeToday: t['active_today'] ?? 0,
        activeSessions: t['active_sessions'] ?? 0,
        checks: t['checks'] ?? 0,
        lookupsToday: t['lookups_today'] ?? 0,
        throttledToday: t['throttled_today'] ?? 0,
        failedSignIns24h: t['failed_24h'] ?? 0,
        blockedSignUps24h: t['blocked_24h'] ?? 0,
      },
      daily,
      topToday,
      newest: newest.map(toRow),
      recent,
    };
  }

  /* ---------- Settings ---------- */

  async getSettings(): Promise<AdminSettings> {
    return { signupsOpen: await this.settings.signupsOpen() };
  }

  async updateSettings(next: AdminSettings, actorId: string, meta: RequestMeta): Promise<AdminSettings> {
    const current = await this.settings.signupsOpen();
    if (current !== next.signupsOpen) {
      await this.settings.setSignupsOpen(next.signupsOpen);
      await this.activity.record(next.signupsOpen ? 'signups_opened' : 'signups_paused', { actorId, ...meta });
    }
    return this.getSettings();
  }
}
