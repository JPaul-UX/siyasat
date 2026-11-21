import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UsageKind } from '@siyasat/core';
import type { Observable } from 'rxjs';
import type { AuthedRequest } from './auth.guard.js';
import { UsageService } from './usage.service.js';

const USAGE_KIND = 'siyasat:usage-kind';

/** Count each call to this route against the signed-in account's daily usage. */
export const CountUsage = (kind: Exclude<UsageKind, 'throttled'>) => SetMetadata(USAGE_KIND, kind);

@Injectable()
export class UsageInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly usage: UsageService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const kind = this.reflector.get<UsageKind | undefined>(USAGE_KIND, context.getHandler());
    const userId = context.switchToHttp().getRequest<AuthedRequest>().auth?.user.id;
    if (kind && userId) this.usage.record(userId, kind);
    return next.handle();
  }
}
