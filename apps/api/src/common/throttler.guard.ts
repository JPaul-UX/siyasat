import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { bearerToken } from '../workspace/workspace.guard.js';

/** Rate-limits per workspace when the request carries a token, and per IP address otherwise. */
@Injectable()
export class WorkspaceThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Request): Promise<string> {
    const token = bearerToken(req);
    if (token) return 'ws:' + createHash('sha256').update(token).digest('hex').slice(0, 32);
    return 'ip:' + (req.ip ?? 'unknown');
  }
}
