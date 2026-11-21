import { Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { AdminUser } from '@siyasat/core';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthService, type AccountContext } from './auth.service.js';

const idParam = z.uuid();

type ActorRequest = Request & { account?: AccountContext };

/** Only an approved admin. Everyone else is turned away before the handler runs. */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ActorRequest>();
    const account = await this.auth.accountFromRequest(req);
    if (!account) throw new UnauthorizedException('Sign in required');
    if (account.role !== 'ADMIN' || account.status !== 'APPROVED') throw new ForbiddenException('Admin only');
    req.account = account;
    return true;
  }
}

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly auth: AuthService) {}

  @Get('users')
  users(): Promise<AdminUser[]> {
    return this.auth.listUsers();
  }

  @Post('users/:id/approve')
  @HttpCode(200)
  approve(@Req() req: ActorRequest, @Param('id', { schema: idParam }) id: string): Promise<AdminUser> {
    return this.auth.approve(req.account!, id);
  }

  @Post('users/:id/reject')
  @HttpCode(200)
  reject(@Req() req: ActorRequest, @Param('id', { schema: idParam }) id: string): Promise<AdminUser> {
    return this.auth.reject(req.account!, id);
  }

  /** Same result as reject: the person loses access to the checker. Kept as its own action in the admin page. */
  @Post('users/:id/revoke')
  @HttpCode(200)
  revoke(@Req() req: ActorRequest, @Param('id', { schema: idParam }) id: string): Promise<AdminUser> {
    return this.auth.reject(req.account!, id);
  }
}
