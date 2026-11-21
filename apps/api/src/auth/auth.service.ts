import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import type { Account, AccountRole, AccountStatus, AdminUser } from '@siyasat/core';
import { randomBytes } from 'node:crypto';
import type { Request } from 'express';
import { AppConfig } from '../config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { readCookie, SESSION_COOKIE, SESSION_MS, sha256 } from './cookies.js';
import { hashPassword, verifyPassword } from './password.js';

const ACCOUNT = Symbol('siyasat.account');

export interface AccountContext extends Account {
  workspaceId: string | null;
}

type CachedRequest = Request & { [ACCOUNT]?: AccountContext | null };

/**
 * Accounts, logins, and who is allowed to use the checker.
 * A session cookie is the only credential the browser keeps. The database stores its hash.
 */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly log = new Logger(AuthService.name);
  /** Hashed once so a login for an unknown email takes as long as a real one. */
  private dummyHash: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hashPassword('siyasat-dummy-password');
    await this.bootstrapAdmin();
  }

  /** The account for this request, or null when there is no live login. Cached for the request. */
  async accountFromRequest(req: Request): Promise<AccountContext | null> {
    const bag = req as CachedRequest;
    if (ACCOUNT in bag) return bag[ACCOUNT] ?? null;
    const account = await this.loadAccount(req);
    bag[ACCOUNT] = account;
    return account;
  }

  async signup(name: string, emailRaw: string, password: string): Promise<{ token: string; account: AccountContext }> {
    const email = normalizeEmail(emailRaw);
    const cleanName = name.trim().replace(/\s+/g, ' ');
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new ConflictException('An account with that email already exists. Try logging in.');
    const user = await this.prisma.user.create({
      data: { email, name: cleanName, passwordHash: await hashPassword(password), status: 'PENDING', role: 'USER' },
    });
    const token = await this.startSession(user.id);
    return { token, account: { id: user.id, name: cleanName, email, status: 'PENDING', role: 'USER', workspaceId: null } };
  }

  async login(emailRaw: string, password: string): Promise<{ token: string; account: AccountContext }> {
    const email = normalizeEmail(emailRaw);
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { workspace: { select: { id: true } } },
    });
    const ok = await verifyPassword(password, user?.passwordHash ?? this.dummyHash ?? '');
    if (!user || !ok) throw new UnauthorizedException("That email or password isn't right.");
    let workspaceId = user.workspace?.id ?? null;
    if (user.status === 'APPROVED' && !workspaceId) workspaceId = await this.ensureWorkspace(user.id);
    const token = await this.startSession(user.id);
    return {
      token,
      account: { id: user.id, name: user.name, email: user.email, status: user.status, role: user.role, workspaceId },
    };
  }

  async logout(req: Request): Promise<void> {
    const token = readCookie(req, SESSION_COOKIE);
    if (!token) return;
    await this.prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }

  async listUsers(): Promise<AdminUser[]> {
    const users = await this.prisma.user.findMany({ orderBy: { createdAt: 'asc' } });
    return users.map((user) => ({ ...publicAccount(user), createdAt: user.createdAt.toISOString() }));
  }

  /** Let this person use the checker. Their saved checks stay if they had any. */
  async approve(actor: AccountContext, userId: string): Promise<AdminUser> {
    const user = await this.editableUser(actor, userId);
    await this.prisma.user.update({ where: { id: user.id }, data: { status: 'APPROVED' } });
    await this.ensureWorkspace(user.id);
    return this.adminView(user.id);
  }

  /** Turn down a request, or take access away. The person can still log in and see that they are waiting. */
  async reject(actor: AccountContext, userId: string): Promise<AdminUser> {
    const user = await this.editableUser(actor, userId);
    await this.prisma.user.update({ where: { id: user.id }, data: { status: 'REJECTED' } });
    return this.adminView(user.id);
  }

  private async bootstrapAdmin(): Promise<void> {
    const email = this.config.adminEmail;
    const password = this.config.adminPassword;
    if (!email || !password) {
      this.log.warn('ADMIN_EMAIL and ADMIN_PASSWORD are not set, so nobody can approve new accounts.');
      return;
    }
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (!existing) {
      const user = await this.prisma.user.create({
        data: { email, name: 'JP', passwordHash: await hashPassword(password), status: 'APPROVED', role: 'ADMIN' },
      });
      await this.ensureWorkspace(user.id);
      this.log.log(`Created the admin account for ${email}`);
      return;
    }
    const samePassword = await verifyPassword(password, existing.passwordHash);
    if (!samePassword || existing.role !== 'ADMIN' || existing.status !== 'APPROVED') {
      await this.prisma.user.update({
        where: { id: existing.id },
        data: {
          role: 'ADMIN',
          status: 'APPROVED',
          ...(samePassword ? {} : { passwordHash: await hashPassword(password) }),
        },
      });
      if (!samePassword) this.log.log('Updated the admin password from ADMIN_PASSWORD');
    }
    await this.ensureWorkspace(existing.id);
  }

  private async loadAccount(req: Request): Promise<AccountContext | null> {
    const token = readCookie(req, SESSION_COOKIE);
    if (!token) return null;
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      include: { user: { include: { workspace: { select: { id: true } } } } },
    });
    if (!session) return null;
    if (session.expiresAt.getTime() <= Date.now()) {
      void this.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }
    const user = session.user;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      role: user.role,
      workspaceId: user.workspace?.id ?? null,
    };
  }

  private async startSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.prisma.session.create({
      data: { tokenHash: sha256(token), userId, expiresAt: new Date(Date.now() + SESSION_MS) },
    });
    return token;
  }

  /** One workspace per person. The random hash is never given out; the session cookie is the credential. */
  private async ensureWorkspace(userId: string): Promise<string> {
    const existing = await this.prisma.workspace.findUnique({ where: { userId }, select: { id: true } });
    if (existing) return existing.id;
    try {
      const created = await this.prisma.workspace.create({
        data: { userId, tokenHash: sha256(randomBytes(32).toString('base64url')) },
        select: { id: true },
      });
      return created.id;
    } catch (error) {
      const again = await this.prisma.workspace.findUnique({ where: { userId }, select: { id: true } });
      if (again) return again.id;
      throw error;
    }
  }

  private async editableUser(actor: AccountContext, userId: string) {
    if (userId === actor.id) throw new BadRequestException("You can't change your own access.");
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('No account with that id.');
    if (user.role === 'ADMIN' || user.email === this.config.adminEmail) {
      throw new BadRequestException("The owner account can't be changed here.");
    }
    return user;
  }

  private async adminView(userId: string): Promise<AdminUser> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return { ...publicAccount(user), createdAt: user.createdAt.toISOString() };
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function publicAccount(user: { id: string; name: string; email: string; status: AccountStatus; role: AccountRole }): Account {
  return { id: user.id, name: user.name, email: user.email, status: user.status, role: user.role };
}
