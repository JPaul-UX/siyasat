import { type CanActivate, createParamDecorator, type ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, notApprovedBody } from '../auth/auth.service.js';

export type WorkspaceRequest = Request & { workspaceId?: string };

/**
 * The checker and its saved checks belong to the signed-in account.
 * Pending and rejected accounts are refused, even if they present a valid session cookie.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<WorkspaceRequest>();
    const user = await this.auth.userFromRequest(req);
    if (!user) throw new UnauthorizedException('Sign in to use Siyasat');
    if (user.status !== 'approved' || !user.workspaceId) throw new ForbiddenException(notApprovedBody());
    req.workspaceId = user.workspaceId;
    return true;
  }
}

/** The id of the account's workspace. Use on routes behind WorkspaceGuard. */
export const WorkspaceId = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  return context.switchToHttp().getRequest<WorkspaceRequest>().workspaceId!;
});
