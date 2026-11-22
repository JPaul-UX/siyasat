import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import type {
  AdminApproveAllResponse,
  AdminEventList,
  AdminOverview,
  AdminPendingCount,
  AdminSettings,
  AdminUserDetail,
  AdminUserList,
} from '@siyasat/core';
import type { Request } from 'express';
import { z } from 'zod';
import { CurrentAuth, SuperAdminGuard } from '../auth/auth.guard.js';
import type { AuthContext } from '../auth/auth.service.js';
import { requestMeta } from '../auth/request-info.js';
import { AdminService } from './admin.service.js';

const page = z.coerce.number().int().min(1).max(10_000).catch(1);

const usersQuery = z.object({
  q: z.string().max(200).optional(),
  status: z.enum(['pending', 'active', 'suspended', 'rejected']).optional().catch(undefined),
  sort: z.enum(['newest', 'oldest', 'active', 'lookups', 'throttled']).catch('newest'),
  page,
});

const eventsQuery = z.object({
  type: z.enum(['all', 'signups', 'signins', 'failed', 'admin']).catch('all'),
  page,
});

const idParam = z.uuid();
const settingsSchema = z.object({ signupsOpen: z.boolean() });

/** The super admin's dashboard: who has signed up, what they use, and what can be done about abuse. */
@Controller('admin')
@UseGuards(SuperAdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  overview(): Promise<AdminOverview> {
    return this.admin.overview();
  }

  /** How many sign-ups are waiting for approval. Cheap, for the badge beside "Admin". */
  @Get('pending')
  async pending(): Promise<AdminPendingCount> {
    return { pending: await this.admin.pendingCount() };
  }

  @Post('users/approve-all')
  @HttpCode(200)
  approveAll(@CurrentAuth() ctx: AuthContext, @Req() req: Request): Promise<AdminApproveAllResponse> {
    return this.admin.approveAll(ctx.user.id, requestMeta(req));
  }

  @Get('users')
  users(@Query({ schema: usersQuery }) query: z.infer<typeof usersQuery>): Promise<AdminUserList> {
    return this.admin.listUsers(query);
  }

  @Get('users/:id')
  user(@Param('id', { schema: idParam }) id: string): Promise<AdminUserDetail> {
    return this.admin.getUser(id);
  }

  @Post('users/:id/approve')
  @HttpCode(200)
  approve(@Param('id', { schema: idParam }) id: string, @CurrentAuth() ctx: AuthContext, @Req() req: Request): Promise<AdminUserDetail> {
    return this.admin.approve(id, ctx.user.id, requestMeta(req));
  }

  @Post('users/:id/decline')
  @HttpCode(200)
  decline(@Param('id', { schema: idParam }) id: string, @CurrentAuth() ctx: AuthContext, @Req() req: Request): Promise<AdminUserDetail> {
    return this.admin.decline(id, ctx.user.id, requestMeta(req));
  }

  @Post('users/:id/suspend')
  @HttpCode(200)
  suspend(@Param('id', { schema: idParam }) id: string, @CurrentAuth() ctx: AuthContext, @Req() req: Request): Promise<AdminUserDetail> {
    return this.admin.suspend(id, ctx.user.id, requestMeta(req));
  }

  @Post('users/:id/reactivate')
  @HttpCode(200)
  reactivate(@Param('id', { schema: idParam }) id: string, @CurrentAuth() ctx: AuthContext, @Req() req: Request): Promise<AdminUserDetail> {
    return this.admin.reactivate(id, ctx.user.id, requestMeta(req));
  }

  @Post('users/:id/unlock')
  @HttpCode(200)
  unlock(@Param('id', { schema: idParam }) id: string, @CurrentAuth() ctx: AuthContext, @Req() req: Request): Promise<AdminUserDetail> {
    return this.admin.unlock(id, ctx.user.id, requestMeta(req));
  }

  /** End every session of the account, signing it out on every device. */
  @Post('users/:id/sign-out')
  @HttpCode(200)
  signOut(@Param('id', { schema: idParam }) id: string, @CurrentAuth() ctx: AuthContext, @Req() req: Request): Promise<AdminUserDetail> {
    return this.admin.signOutEverywhere(id, ctx.user.id, requestMeta(req));
  }

  @Get('events')
  events(@Query({ schema: eventsQuery }) query: z.infer<typeof eventsQuery>): Promise<AdminEventList> {
    return this.admin.listEvents(query.type, query.page);
  }

  @Get('settings')
  settings(): Promise<AdminSettings> {
    return this.admin.getSettings();
  }

  @Put('settings')
  updateSettings(@Body({ schema: settingsSchema }) body: AdminSettings, @CurrentAuth() ctx: AuthContext, @Req() req: Request): Promise<AdminSettings> {
    return this.admin.updateSettings(body, ctx.user.id, requestMeta(req));
  }
}
