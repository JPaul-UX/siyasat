import { type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard, type ThrottlerLimitDetail } from '@nestjs/throttler';
import { type AuthedRequest, authOf } from '../auth/auth.guard.js';
import { AuthService } from '../auth/auth.service.js';
import { UsageService } from '../auth/usage.service.js';

/**
 * Rate-limits per account when the request is signed in, and per IP address otherwise. Every refusal of a
 * signed-in request is counted, so the admin dashboard shows which accounts keep running into the limits.
 */
@Injectable()
export class AccountThrottlerGuard extends ThrottlerGuard {
  @Inject(AuthService) private readonly auth!: AuthService;
  @Inject(UsageService) private readonly usage!: UsageService;

  protected override async getTracker(req: AuthedRequest): Promise<string> {
    const ctx = await authOf(req, this.auth);
    return ctx ? 'user:' + ctx.user.id : 'ip:' + (req.ip ?? 'unknown');
  }

  protected override async throwThrottlingException(_context: ExecutionContext, detail: ThrottlerLimitDetail): Promise<void> {
    if (detail.tracker.startsWith('user:')) this.usage.record(detail.tracker.slice(5), 'throttled');
    throw new ThrottlerException('Too many requests. Wait a minute, then try again.');
  }
}
