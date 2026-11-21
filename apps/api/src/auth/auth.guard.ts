import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { type AuthContext, AuthService, SESSION_COOKIE } from './auth.service.js';

export type AuthedRequest = Request & { auth?: AuthContext | null };

/** The session token in a request's cookie, if it carries one that looks right. */
export function sessionToken(req: Request): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0 || part.slice(0, eq).trim() !== SESSION_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    return /^[A-Za-z0-9_-]{20,200}$/.test(value) ? value : null;
  }
  return null;
}

/** The session behind a request, looked up at most once per request. */
export async function authOf(req: AuthedRequest, auth: AuthService): Promise<AuthContext | null> {
  if (req.auth === undefined) {
    const token = sessionToken(req);
    req.auth = token ? await auth.resolve(token) : null;
  }
  return req.auth;
}

/** Requires a signed-in account. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!(await authOf(context.switchToHttp().getRequest<AuthedRequest>(), this.auth))) {
      throw new UnauthorizedException('Sign in to continue.');
    }
    return true;
  }
}

/** Requires the super admin. */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx = await authOf(context.switchToHttp().getRequest<AuthedRequest>(), this.auth);
    if (!ctx) throw new UnauthorizedException('Sign in to continue.');
    if (ctx.user.role !== 'super_admin') throw new ForbiddenException('Only the super admin can see this.');
    return true;
  }
}

/** The signed-in session. Use on routes behind SessionGuard or SuperAdminGuard. */
export const CurrentAuth = createParamDecorator((_data: unknown, context: ExecutionContext): AuthContext => {
  return context.switchToHttp().getRequest<AuthedRequest>().auth!;
});

/** The id of the signed-in account's workspace, where its checks are saved. Use on routes behind SessionGuard. */
export const WorkspaceId = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  return context.switchToHttp().getRequest<AuthedRequest>().auth!.user.workspaceId;
});
