import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AccountResponse } from '@siyasat/core';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService, toAccount } from './auth.service.js';

const signupSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80),
  email: z.email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
  note: z.string().trim().max(500).optional().default(''),
});

const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password').max(200),
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Whoever the session cookie belongs to, or null. Pending and rejected accounts are included. */
  @Get('me')
  @HttpCode(200)
  async me(@Req() req: Request): Promise<AccountResponse> {
    const user = await this.auth.userFromRequest(req);
    return { user: user ? toAccount(user) : null };
  }

  /** Create a pending account and sign them in, so they can see that they are waiting. */
  @Post('signup')
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: 60 * 60_000 } })
  async signup(
    @Body({ schema: signupSchema }) body: z.infer<typeof signupSchema>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccountResponse> {
    const user = await this.auth.signup(body);
    await this.auth.openSession(user.id, res);
    return { user };
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 15 * 60_000 } })
  async login(
    @Body({ schema: loginSchema }) body: z.infer<typeof loginSchema>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccountResponse> {
    const user = await this.auth.authenticate(body.email, body.password);
    await this.auth.openSession(user.id, res);
    return { user: toAccount(user) };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ ok: true }> {
    await this.auth.logout(req, res);
    return { ok: true };
  }
}
