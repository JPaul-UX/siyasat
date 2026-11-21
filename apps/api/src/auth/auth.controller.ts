import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PASSWORD, type AuthConfig, type AuthResponse, type MeResponse } from '@siyasat/core';
import type { CookieOptions, Request, Response } from 'express';
import { z } from 'zod';
import { AppConfig } from '../config.js';
import { CurrentAuth, SessionGuard, sessionToken } from './auth.guard.js';
import { type AuthContext, AuthService, SESSION_COOKIE, SESSION_MS, toSessionUser, type AuthResult } from './auth.service.js';
import { requestMeta } from './request-info.js';
import { SettingsService } from './settings.service.js';

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.').max(254, 'That email address is too long.'));
const legacyWorkspaceToken = z.string().regex(/^[A-Za-z0-9_-]{20,200}$/).optional().catch(undefined);

const signUpSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name.').max(80, 'Use at most 80 characters for your name.'),
  email,
  password: z.string().min(PASSWORD.min, `Use at least ${PASSWORD.min} characters.`).max(PASSWORD.max, `Use at most ${PASSWORD.max} characters.`),
  website: z.string().max(500).optional(),
  legacyWorkspaceToken,
});

const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.').max(PASSWORD.max),
  legacyWorkspaceToken,
});

/** Signing up, in and out. These are the only routes, with the health check, that work without a session. */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly settings: SettingsService,
    private readonly config: AppConfig,
  ) {}

  private cookieOptions(): CookieOptions {
    // httpOnly keeps the token away from scripts; SameSite=Lax keeps other sites from sending it.
    return { httpOnly: true, sameSite: 'lax', secure: this.config.isProduction, path: '/' };
  }

  private signedIn(res: Response, result: AuthResult): AuthResponse {
    res.cookie(SESSION_COOKIE, result.token, { ...this.cookieOptions(), maxAge: SESSION_MS });
    return { user: result.user, ...(result.claimedChecks ? { claimedChecks: result.claimedChecks } : {}) };
  }

  @Get('config')
  async getConfig(): Promise<AuthConfig> {
    return { signupsOpen: await this.settings.signupsOpen() };
  }

  /** Create an account and sign in. Limited per address, so one machine cannot make accounts by the hundred. */
  @Post('signup')
  @Throttle({ default: { limit: 30, ttl: 3_600_000 } })
  async signUp(
    @Body({ schema: signUpSchema }) body: z.infer<typeof signUpSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.signedIn(res, await this.auth.signUp(body, requestMeta(req)));
  }

  /** Limited per address; wrong passwords also lock the account itself for a while (see AuthService). */
  @Post('signin')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 900_000 } })
  async signIn(
    @Body({ schema: signInSchema }) body: z.infer<typeof signInSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.signedIn(res, await this.auth.signIn(body, requestMeta(req)));
  }

  @Post('signout')
  @HttpCode(200)
  async signOut(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ ok: true }> {
    const token = sessionToken(req);
    if (token) await this.auth.signOut(token, requestMeta(req));
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
    return { ok: true };
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentAuth() ctx: AuthContext): MeResponse {
    return { user: toSessionUser(ctx.user) };
  }
}
