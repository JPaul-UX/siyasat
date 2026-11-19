import { type CanActivate, createParamDecorator, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { WorkspaceService } from './workspace.service.js';

export type WorkspaceRequest = Request & { workspaceId?: string };

export const bearerToken = (req: Request): string | null => {
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/.exec(req.headers.authorization ?? '');
  return m ? m[1]! : null;
};

/** Requires `Authorization: Bearer <workspace token>` and attaches the workspace to the request. */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(private readonly workspaces: WorkspaceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<WorkspaceRequest>();
    const token = bearerToken(req);
    const workspaceId = token ? await this.workspaces.resolve(token) : null;
    if (!workspaceId) throw new UnauthorizedException('Unknown workspace');
    req.workspaceId = workspaceId;
    return true;
  }
}

/** The id of the workspace making the request. Use on routes behind WorkspaceGuard. */
export const WorkspaceId = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  return context.switchToHttp().getRequest<WorkspaceRequest>().workspaceId!;
});
