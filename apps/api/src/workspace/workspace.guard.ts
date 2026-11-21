import { createParamDecorator, type CanActivate, type ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service.js';

export type WorkspaceRequest = Request & { workspaceId?: string };

/**
 * The checker and saved checks. Requires a logged-in person whose account has been approved.
 * Pending and rejected accounts are refused here, not only hidden in the browser.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<WorkspaceRequest>();
    const account = await this.auth.accountFromRequest(req);
    if (!account) throw new UnauthorizedException('Sign in required');
    if (account.status !== 'APPROVED' || !account.workspaceId) throw new ForbiddenException('Waiting for approval');
    req.workspaceId = account.workspaceId;
    return true;
  }
}

/** The id of the workspace making the request. Use on routes behind WorkspaceGuard. */
export const WorkspaceId = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  return context.switchToHttp().getRequest<WorkspaceRequest>().workspaceId!;
});
