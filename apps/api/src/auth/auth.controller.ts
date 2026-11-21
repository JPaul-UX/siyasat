import { Body, Controller, Get, HttpCode, Post, Req, Res, UseInterceptors } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Account } from '@siyasat/core';
import type { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService, type AccountContext } from './auth.service.js';
import { clearSessionCookie, setSessionCookie } from './cookies.js';

const signupSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80, 'Name is too long'),
  email: z.email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
});

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email').max(200),
  password: z.string().min(1, 'Enter your password').max(200),
});

/** Logins must not be cached by the browser or a proxy. */
class NoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    context.switchToHttp().getResponse<Response>().setHeader('Cache-Control', 'no-store');
    return next.handle();
  }
}

function toAccount(account: AccountContext): Account {
  return { id: account.id, name: account.name, email: account.email, status: account.status, role: account.role };
}

@Controller('auth')
@UseInterceptors(NoStoreInterceptor)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Who is logged in, if anyone. The landing page calls this. It does not require a login. */
  @Get('me')
  async me(@Req() req: Request): Promise<{ user: Account | null }> {
    const account = await this.auth.accountFromRequest(req);
    return { user: account ? toAccount(account) : null };
  }

  /** Create a PENDING account and log them in, so they can see that they are waiting. */
  @Post('signup')
  @HttpCode(201)
  @Throttle({ default: { limit: 8, ttl: 3_600_000 } })
  async signup(
    @Body({ schema: signupSchema }) body: z.infer<typeof signupSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: Account }> {
    const { token, account } = await this.auth.signup(body.name, body.email, body.password);
    setSessionCookie(res, req, token);
    return { user: toAccount(account) };
  }

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 900_000 } })
  async login(
    @Body({ schema: loginSchema }) body: z.infer<typeof loginSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: Account }> {
    const { token, account } = await this.auth.login(body.email, body.password);
    setSessionCookie(res, req, token);
    return { user: toAccount(account) };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req);
    clearSessionCookie(res, req);
  }
}
