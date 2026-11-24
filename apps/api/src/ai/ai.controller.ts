import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { LIMITS, VERDICTS, type AiStatus, type WebCheckResponse } from '@siyasat/core';
import type { Request } from 'express';
import { z } from 'zod';
import { CurrentAuth, SessionGuard } from '../auth/auth.guard.js';
import type { AuthContext } from '../auth/auth.service.js';
import { AiService } from './ai.service.js';

const webCheckSchema = z.object({
  raw: z.string().trim().min(1).max(LIMITS.referenceChars),
  verdict: z.enum(VERDICTS as [string, ...string[]]).transform((v) => v as (typeof VERDICTS)[number]),
  note: z.string().max(2000).optional(),
  fresh: z.boolean().optional(),
});

/** An AbortSignal that fires when the browser gives up on the request, so an abandoned run stops costing money. */
function closedSignal(req: Request): AbortSignal {
  const controller = new AbortController();
  // The response closes when the answer has been sent, or earlier when the connection goes away.
  req.res?.on('close', () => {
    if (!req.res?.writableFinished) controller.abort();
  });
  return controller.signal;
}

/** The optional AI web search. Needs an approved account, like every other lookup. */
@Controller('ai')
@UseGuards(SessionGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  /** Whether the AI step is on, and how many searches this account has left today. */
  @Get('status')
  status(@CurrentAuth() auth: AuthContext): Promise<AiStatus> {
    return this.ai.status(auth.user);
  }

  /** Look for a reference the databases could not confirm, on the open web. */
  @Post('web-check')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  webCheck(@CurrentAuth() auth: AuthContext, @Body({ schema: webCheckSchema }) body: z.infer<typeof webCheckSchema>, @Req() req: Request): Promise<WebCheckResponse> {
    return this.ai.webCheck(auth.user, body, closedSignal(req));
  }
}
