import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { readCookie, SESSION_COOKIE, sha256 } from '../auth/cookies.js';

/** Rate-limits per login when the request carries a session cookie, and per IP address otherwise. */
@Injectable()
export class WorkspaceThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Request): Promise<string> {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) return 'session:' + sha256(token).slice(0, 32);
    return 'ip:' + (req.ip ?? 'unknown');
  }
}
