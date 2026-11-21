import { ConflictException, ForbiddenException, Injectable, Logger, UnauthorizedException, type OnModuleInit } from '@nestjs/common';
import type { Account, AccountRole, AccountStatus } from '@siyasat/core';
import { createHash, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { AppConfig } from '../config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { clearSessionCookie, readCookie, SESSION_COOKIE, SESSION_MS, sessionKey, writeSessionCookie } from './cookies.js';
import { hashPassword, verifyPassword } from './passwords.js';

type UserRow = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: string;
  status: string;
  note: string;
  workspaceId: string | null;
  createdAt: Date;
};

const ROLES = new Set<AccountRole>(['user', 'admin']);
const STATUSES = new Set<AccountStatus>(['pending', 'approved', 'rejected']);

export const notApprovedBody = () => ({
  statusCode: 403,
  message: 'Your account is waiting for approval',
  code: 'not_approved' as const,
});

export function toAccount(user: UserRow): Account {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: ROLES.has(user.role as AccountRole) ? (user.role as AccountRole) : 'user',
    status: STATUSES.has(user.status as AccountStatus) ? (user.status as AccountStatus) : 'pending',
    note: user.note,
    createdAt: user.createdAt.toISOString(),
  };
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly log = new Logger(AuthService.name);
  /** Hashed once so a wrong email still spends the same time as a wrong password. */
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureOwner();
  }

  async signup(input: { name: string; email: string; password: string; note: string }): Promise<Account> {
    const email = input.email.toLowerCase();
    const passwordHash = await hashPassword(input.password);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const workspace = await tx.workspace.create({
          data: { tokenHash: createHash('sha256').update(randomBytes(32)).digest('hex') },
          select: { id: true },
        });
        return tx.user.create({
          data: {
            name: input.name,
            email,
            passwordHash,
            note: input.note,
            workspaceId: workspace.id,
          },
        });
      });
      return toAccount(user);
    } catch (e) {
      if (isUnique(e)) throw new ConflictException('An account with that email already exists. Log in instead.');
      throw e;
    }
  }

  /** Checks the password and returns the account. Does not start a session. */
  async authenticate(email: string, password: string): Promise<UserRow> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    const hash = user?.passwordHash ?? (await this.placeholderHash());
    const ok = await verifyPassword(password, hash);
    if (!user || !ok) throw new UnauthorizedException("That email and password don't match.");
    return user;
  }

  async openSession(userId: string, res: Response): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.session.create({
      data: { id: sessionKey(token), userId, expiresAt: new Date(Date.now() + SESSION_MS) },
    });
    writeSessionCookie(res, token, this.config.isProduction);
  }

  async logout(req: Request, res: Response): Promise<void> {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) await this.prisma.session.deleteMany({ where: { id: sessionKey(token) } });
    clearSessionCookie(res, this.config.isProduction);
  }

  async userFromRequest(req: Request): Promise<UserRow | null> {
    const token = readCookie(req, SESSION_COOKIE);
    if (!token) return null;
    const session = await this.prisma.session.findUnique({ where: { id: sessionKey(token) }, include: { user: true } });
    if (!session) return null;
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      return null;
    }
    return session.user;
  }

  async listUsers(): Promise<Account[]> {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
    return users.map(toAccount);
  }

  async setStatus(actorId: string, userId: string, status: AccountStatus): Promise<Account> {
    if (actorId === userId) throw new ForbiddenException("You can't change your own access.");
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new ForbiddenException('That account was not found.');
    if (user.role === 'admin') throw new ForbiddenException("The owner's access is managed from the server settings, not this page.");
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { status } });
    return toAccount(updated);
  }

  private async placeholderHash(): Promise<string> {
    this.dummyHash ??= hashPassword('not-a-real-password');
    return this.dummyHash;
  }

  /**
   * The first admin comes from ADMIN_EMAIL and ADMIN_PASSWORD. On later starts, that same account stays
   * the owner, and a changed ADMIN_PASSWORD becomes the new password (so a forgotten one can be reset by
   * editing the variable and redeploying).
   */
  private async ensureOwner(): Promise<void> {
    const email = this.config.adminEmail?.toLowerCase();
    const password = this.config.adminPassword;
    if (!email || !password) {
      const message = [
        'Siyasat will not start until the owner account is set.',
        'In Railway, open the Siyasat service, then Variables, and add:',
        '  ADMIN_EMAIL = the email you will use to log in',
        '  ADMIN_PASSWORD = a password of at least 12 characters',
        'Then redeploy.',
      ].join('\n');
      if (this.config.isProduction) throw new Error(message);
      this.log.warn('ADMIN_EMAIL and ADMIN_PASSWORD are not set, so there is no owner account yet.');
      return;
    }
    if (password.length < 12) {
      throw new Error('ADMIN_PASSWORD must be at least 12 characters. Set a longer one in the service variables and redeploy.');
    }

    let existing = await this.prisma.user.findUnique({ where: { email } });
    if (!existing) {
      const passwordHash = await hashPassword(password);
      try {
        await this.prisma.$transaction(async (tx) => {
          const workspace = await tx.workspace.create({
            data: { tokenHash: createHash('sha256').update(randomBytes(32)).digest('hex') },
            select: { id: true },
          });
          await tx.user.create({
            data: {
              name: 'Owner',
              email,
              passwordHash,
              role: 'admin',
              status: 'approved',
              workspaceId: workspace.id,
            },
          });
        });
        this.log.log(`Owner account created for ${email}`);
        return;
      } catch (e) {
        // Two copies of the server can start together. The email is unique, so the second one continues below.
        if (!isUnique(e)) throw e;
        existing = await this.prisma.user.findUnique({ where: { email } });
        if (!existing) throw e;
      }
    }

    const data: { role?: string; status?: string; passwordHash?: string; workspaceId?: string } = {};
    if (existing.role !== 'admin') data.role = 'admin';
    if (existing.status !== 'approved') data.status = 'approved';
    if (!existing.workspaceId) {
      const workspace = await this.prisma.workspace.create({
        data: { tokenHash: createHash('sha256').update(randomBytes(32)).digest('hex') },
        select: { id: true },
      });
      data.workspaceId = workspace.id;
    }
    const samePassword = await verifyPassword(password, existing.passwordHash);
    if (!samePassword) {
      data.passwordHash = await hashPassword(password);
      await this.prisma.session.deleteMany({ where: { userId: existing.id } });
      this.log.log('Owner password updated from ADMIN_PASSWORD. Previous owner logins were signed out.');
    }
    if (Object.keys(data).length) await this.prisma.user.update({ where: { id: existing.id }, data });
  }
}

function isUnique(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && (e as { code: string }).code === 'P2002';
}
