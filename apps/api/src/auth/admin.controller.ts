import { Controller, ForbiddenException, HttpCode, Param, Post, Get, Req, UnauthorizedException } from '@nestjs/common';
import type { Account, AccountListResponse } from '@siyasat/core';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthService, notApprovedBody, toAccount } from './auth.service.js';

const idParam = z.uuid();

@Controller('admin')
export class AdminController {
  constructor(private readonly auth: AuthService) {}

  @Get('users')
  async list(@Req() req: Request): Promise<AccountListResponse> {
    await this.requireAdmin(req);
    return { users: await this.auth.listUsers() };
  }

  @Post('users/:id/approve')
  @HttpCode(200)
  approve(@Req() req: Request, @Param('id', { schema: idParam }) id: string): Promise<Account> {
    return this.change(req, id, 'approved');
  }

  @Post('users/:id/reject')
  @HttpCode(200)
  reject(@Req() req: Request, @Param('id', { schema: idParam }) id: string): Promise<Account> {
    return this.change(req, id, 'rejected');
  }

  @Post('users/:id/revoke')
  @HttpCode(200)
  revoke(@Req() req: Request, @Param('id', { schema: idParam }) id: string): Promise<Account> {
    return this.change(req, id, 'rejected');
  }

  private async change(req: Request, id: string, status: 'approved' | 'rejected'): Promise<Account> {
    const admin = await this.requireAdmin(req);
    return this.auth.setStatus(admin.id, id, status);
  }

  private async requireAdmin(req: Request) {
    const user = await this.auth.userFromRequest(req);
    if (!user) throw new UnauthorizedException('Sign in to use Siyasat');
    if (user.status !== 'approved') throw new ForbiddenException(notApprovedBody());
    if (user.role !== 'admin') throw new ForbiddenException({ statusCode: 403, message: 'Only the owner can do that', code: 'not_admin' });
    return toAccount(user);
  }
}
