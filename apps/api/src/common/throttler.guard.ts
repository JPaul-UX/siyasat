import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { readCookie, SESSION_COOKIE, sessionKey } from '../auth/cookies.js';

/** Rate-limits per signed-in account when the request carries a session, and per IP address otherwise. */
@Injectable()
export class WorkspaceThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Request): Promise<string> {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) return 'sess:' + sessionKey(token).slice(0, 32);
    return 'ip:' + (req.ip ?? 'unknown');
  }
}
