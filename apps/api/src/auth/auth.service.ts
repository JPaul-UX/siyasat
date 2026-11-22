import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { SessionUser, SignInRequest, SignUpRequest, UserRole, UserStatus } from '@siyasat/core';
import { createHash, randomBytes } from 'node:crypto';
import { AppConfig } from '../config.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ActivityService } from './activity.service.js';
import { hashPassword, needsRehash, passwordProblem, verifyDecoy, verifyPassword } from './password.js';
import type { RequestMeta } from './request-info.js';
import { SettingsService } from './settings.service.js';

export const SESSION_COOKIE = 'siyasat_session';
export const SESSION_MS = 30 * 24 * 3_600_000;
/** How long a session lookup is remembered. A suspension on this server takes effect at once regardless. */
const CACHE_MS = 30_000;
/** "Last seen" is written at most this often per session. */
const TOUCH_EVERY_MS = 5 * 60_000;
/** Wrong passwords in a row before the account is locked, and for how long. */
export const MAX_FAILED_SIGN_INS = 10;
export const LOCK_MS = 15 * 60_000;
const CLEANUP_EVERY_MS = 6 * 3_600_000;
/** Activity is kept for a year, ended sessions for a week. */
const EVENT_RETENTION_MS = 365 * 24 * 3_600_000;
const SESSION_RETENTION_MS = 7 * 24 * 3_600_000;

const WRONG_CREDENTIALS = 'That email and password don’t match an account.';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  workspaceId: string;
  createdAt: Date;
}

export interface AuthContext {
  sessionId: string;
  user: AuthUser;
}

export interface AuthResult {
  token: string;
  user: SessionUser;
  claimedChecks?: number;
}

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const USER_FIELDS = { id: true, email: true, name: true, role: true, status: true, workspaceId: true, createdAt: true } as const;

export const toSessionUser = (u: AuthUser): SessionUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  // Only active and pending accounts have sessions (see resolve).
  status: u.status === 'active' ? 'active' : 'pending',
  createdAt: u.createdAt.toISOString(),
});

/** Statuses that can hold a session. A pending account can sign in, but only to see that it is waiting. */
const CAN_SIGN_IN: ReadonlySet<UserStatus> = new Set(['active', 'pending']);

/** Accounts and their sessions. */
@Injectable()
export class AuthService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(AuthService.name);
  /** Token hash → the session it opens (null for none), so most requests skip the database. */
  private readonly cache = new Map<string, { ctx: AuthContext | null; until: number }>();
  /** Session id → when its "last seen" was last written. */
  private readonly touched = new Map<string, number>();
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly settings: SettingsService,
    private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureSuperAdmin();
    const cleanup = () => this.cleanup().catch((e) => this.log.warn(`Could not clean up old sessions: ${e}`));
    void cleanup();
    this.cleanupTimer = setInterval(cleanup, CLEANUP_EVERY_MS);
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.cleanupTimer);
  }

  /* ---------- Signing up, in and out ---------- */

  async signUp(input: SignUpRequest, meta: RequestMeta): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    if (input.website) {
      // Only a bot fills in the field people cannot see.
      await this.activity.record('sign_up_blocked', { email, ...meta, detail: { reason: 'bot' } });
      throw new ForbiddenException('We couldn’t create your account. Please try again.');
    }
    if (!(await this.settings.signupsOpen())) {
      await this.activity.record('sign_up_blocked', { email, ...meta, detail: { reason: 'paused' } });
      throw new ForbiddenException('New sign-ups are paused for now. Please try again later.');
    }
    const problem = passwordProblem(input.password, email);
    if (problem) throw new HttpException({ statusCode: 400, message: problem, field: 'password' }, HttpStatus.BAD_REQUEST);

    const passwordHash = await hashPassword(input.password);
    const legacyHash = input.legacyWorkspaceToken ? sha256(input.legacyWorkspaceToken) : null;
    let claimedChecks = 0;
    let user: AuthUser;
    try {
      user = await this.prisma.$transaction(async (tx) => {
        // The checks this browser saved before accounts existed become the new account's.
        const legacy = legacyHash
          ? await tx.workspace.findUnique({
              where: { tokenHash: legacyHash },
              select: { id: true, user: { select: { id: true } }, _count: { select: { checks: { where: { deletedAt: null } } } } },
            })
          : null;
        const claim = legacy && !legacy.user ? legacy : null;
        if (claim) {
          claimedChecks = claim._count.checks;
          await tx.workspace.update({ where: { id: claim.id }, data: { tokenHash: null } });
        }
        return tx.user.create({
          data: {
            email,
            name: input.name.trim(),
            passwordHash,
            // Every new account waits for the super admin's approval.
            status: 'pending',
            signupIp: meta.ip,
            signupUserAgent: meta.userAgent,
            lastSignInAt: new Date(),
            lastSeenAt: new Date(),
            workspace: claim ? { connect: { id: claim.id } } : { create: {} },
          },
          select: USER_FIELDS,
        });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new HttpException({ statusCode: 409, message: 'An account with this email already exists. Sign in instead.', field: 'email' }, HttpStatus.CONFLICT);
      }
      throw e;
    }

    const token = await this.createSession(user.id, meta);
    await this.activity.record('sign_up', { userId: user.id, ...meta, detail: { pending: true, ...(claimedChecks ? { claimedChecks } : {}) } });
    this.log.log(`New account ${user.email} from ${meta.ip ?? 'unknown address'}, waiting for approval`);
    return { token, user: toSessionUser(user), ...(claimedChecks ? { claimedChecks } : {}) };
  }

  async signIn(input: SignInRequest, meta: RequestMeta): Promise<AuthResult> {
    const email = input.email.trim().toLowerCase();
    const found = await this.prisma.user.findUnique({
      where: { email },
      select: { ...USER_FIELDS, passwordHash: true, failedSignIns: true, lockedUntil: true },
    });
    if (!found) {
      await verifyDecoy(input.password);
      await this.activity.record('sign_in_failed', { email, ...meta, detail: { reason: 'no_account' } });
      throw new UnauthorizedException(WRONG_CREDENTIALS);
    }
    const { passwordHash, failedSignIns: _failed, lockedUntil, ...user } = found;

    if (lockedUntil && lockedUntil.getTime() > Date.now()) {
      await this.activity.record('sign_in_failed', { userId: user.id, ...meta, detail: { reason: 'locked' } });
      const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000));
      throw new HttpException(
        `Too many wrong passwords. Sign-in for this account is paused; try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!(await verifyPassword(input.password, passwordHash))) {
      const { failedSignIns } = await this.prisma.user.update({
        where: { id: user.id },
        data: { failedSignIns: { increment: 1 } },
        select: { failedSignIns: true },
      });
      await this.activity.record('sign_in_failed', { userId: user.id, ...meta, detail: { reason: 'wrong_password', attempt: failedSignIns } });
      if (failedSignIns >= MAX_FAILED_SIGN_INS) {
        await this.prisma.user.update({ where: { id: user.id }, data: { failedSignIns: 0, lockedUntil: new Date(Date.now() + LOCK_MS) } });
        await this.activity.record('locked', { userId: user.id, ...meta, detail: { minutes: LOCK_MS / 60_000 } });
      }
      throw new UnauthorizedException(WRONG_CREDENTIALS);
    }

    // Only someone with the right password learns that the account is suspended or was declined.
    if (user.status === 'suspended') {
      await this.activity.record('sign_in_failed', { userId: user.id, ...meta, detail: { reason: 'suspended' } });
      throw new ForbiddenException('This account has been suspended. If you think this is a mistake, contact the site’s administrator.');
    }
    if (user.status === 'rejected') {
      await this.activity.record('sign_in_failed', { userId: user.id, ...meta, detail: { reason: 'declined' } });
      throw new ForbiddenException('Your sign-up wasn’t approved. If you think this is a mistake, contact the site’s administrator.');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedSignIns: 0,
        lockedUntil: null,
        lastSignInAt: new Date(),
        lastSeenAt: new Date(),
        ...(needsRehash(passwordHash) ? { passwordHash: await hashPassword(input.password) } : {}),
      },
    });
    const token = await this.createSession(user.id, meta);
    const claimedChecks = input.legacyWorkspaceToken ? await this.claimLegacyWorkspace(input.legacyWorkspaceToken, user.workspaceId) : 0;
    await this.activity.record('sign_in', { userId: user.id, ...meta, detail: claimedChecks ? { claimedChecks } : undefined });
    return { token, user: toSessionUser(user), ...(claimedChecks ? { claimedChecks } : {}) };
  }

  async signOut(token: string, meta: RequestMeta): Promise<void> {
    const tokenHash = sha256(token);
    const session = await this.prisma.session.findUnique({ where: { tokenHash }, select: { id: true, userId: true, revokedAt: true } });
    this.cache.delete(tokenHash);
    if (!session || session.revokedAt) return;
    await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    await this.activity.record('sign_out', { userId: session.userId, ...meta });
  }

  /* ---------- Sessions ---------- */

  private async createSession(userId: string, meta: RequestMeta): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.session.create({
      data: { userId, tokenHash: sha256(token), ip: meta.ip, userAgent: meta.userAgent, expiresAt: new Date(Date.now() + SESSION_MS) },
    });
    return token;
  }

  /**
   * The session a cookie's token opens, or null when it is unknown, ended or expired, or its account is
   * suspended or declined. A pending account's session is returned: guards decide what it may open.
   */
  async resolve(token: string): Promise<AuthContext | null> {
    const tokenHash = sha256(token);
    const now = Date.now();
    const hit = this.cache.get(tokenHash);
    if (hit && hit.until > now) {
      if (hit.ctx) this.touch(hit.ctx);
      return hit.ctx;
    }
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      select: { id: true, expiresAt: true, revokedAt: true, user: { select: USER_FIELDS } },
    });
    const ctx =
      session && !session.revokedAt && session.expiresAt.getTime() > now && CAN_SIGN_IN.has(session.user.status)
        ? { sessionId: session.id, user: session.user }
        : null;
    if (this.cache.size > 20_000) this.cache.clear();
    this.cache.set(tokenHash, { ctx, until: now + CACHE_MS });
    if (ctx) this.touch(ctx);
    return ctx;
  }

  private touch(ctx: AuthContext): void {
    const now = Date.now();
    if (now - (this.touched.get(ctx.sessionId) ?? 0) < TOUCH_EVERY_MS) return;
    if (this.touched.size > 20_000) this.touched.clear();
    this.touched.set(ctx.sessionId, now);
    const at = new Date(now);
    void Promise.all([
      this.prisma.session.update({ where: { id: ctx.sessionId }, data: { lastSeenAt: at } }),
      this.prisma.user.update({ where: { id: ctx.user.id }, data: { lastSeenAt: at } }),
    ]).catch(() => undefined);
  }

  /** Forget what is remembered about an account's sessions, so a change to it applies to the next request. */
  forgetUser(userId: string): void {
    for (const [key, entry] of this.cache) if (entry.ctx?.user.id === userId) this.cache.delete(key);
  }

  /** End every session of an account: it is signed out on every device. Answers with how many there were. */
  async endAllSessions(userId: string): Promise<number> {
    const { count } = await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    this.forgetUser(userId);
    return count;
  }

  /* ---------- Checks saved before accounts ---------- */

  /** Move the checks of an anonymous workspace into an account's. Answers with how many were moved. */
  private async claimLegacyWorkspace(token: string, workspaceId: string): Promise<number> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const legacy = await tx.workspace.findUnique({ where: { tokenHash: sha256(token) }, select: { id: true, user: { select: { id: true } } } });
        if (!legacy || legacy.user || legacy.id === workspaceId) return 0;
        const { count } = await tx.check.updateMany({ where: { workspaceId: legacy.id, deletedAt: null }, data: { workspaceId } });
        await tx.workspace.delete({ where: { id: legacy.id } });
        return count;
      });
    } catch (e) {
      this.log.warn(`Could not move checks from an anonymous workspace: ${e}`);
      return 0;
    }
  }

  /* ---------- The super admin ---------- */

  /**
   * Make sure the account named by SUPER_ADMIN_EMAIL exists, is the only super admin, and opens with
   * SUPER_ADMIN_PASSWORD. If someone else registered that address first, they lose the account: the password
   * is replaced and every session ended.
   */
  private async ensureSuperAdmin(): Promise<void> {
    const admin = this.config.superAdmin;
    if (!admin) {
      this.log.warn('No super admin is set up. Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD to use the admin dashboard.');
      return;
    }
    const demoted = await this.prisma.user.updateMany({ where: { role: 'super_admin', email: { not: admin.email } }, data: { role: 'user' } });
    if (demoted.count) this.log.log(`${demoted.count} former super admin account(s) are now ordinary accounts`);

    const existing = await this.prisma.user.findUnique({ where: { email: admin.email }, select: { id: true, role: true, status: true, passwordHash: true } });
    if (!existing) {
      await this.prisma.user.create({
        data: {
          email: admin.email,
          name: 'Super admin',
          role: 'super_admin',
          status: 'active',
          passwordHash: await hashPassword(admin.password),
          workspace: { create: {} },
        },
      });
      this.log.log(`Created the super admin account ${admin.email}`);
      return;
    }
    const passwordMatches = await verifyPassword(admin.password, existing.passwordHash);
    if (existing.role === 'super_admin' && existing.status === 'active' && passwordMatches) return;
    await this.prisma.user.update({
      where: { id: existing.id },
      data: {
        role: 'super_admin',
        status: 'active',
        suspendedAt: null,
        ...(passwordMatches ? {} : { passwordHash: await hashPassword(admin.password), failedSignIns: 0, lockedUntil: null }),
      },
    });
    if (!passwordMatches || existing.role !== 'super_admin') await this.endAllSessions(existing.id);
    this.log.log(`Updated the super admin account ${admin.email}`);
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();
    const sessionCutoff = new Date(now - SESSION_RETENTION_MS);
    await this.prisma.session.deleteMany({ where: { OR: [{ expiresAt: { lt: sessionCutoff } }, { revokedAt: { lt: sessionCutoff } }] } });
    await this.prisma.activityEvent.deleteMany({ where: { createdAt: { lt: new Date(now - EVENT_RETENTION_MS) } } });
  }
}
