import { Injectable, Logger } from '@nestjs/common';
import type { ActivityType } from '@siyasat/core';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { RequestMeta } from './request-info.js';

export interface ActivityInput extends Partial<RequestMeta> {
  /** The account the event is about. */
  userId?: string | null;
  /** The admin who did it. */
  actorId?: string | null;
  /** The address typed, when there is no account to point to. */
  email?: string | null;
  detail?: Record<string, unknown>;
}

/** The log of sign-ups, sign-ins and admin actions that the admin dashboard reads. */
@Injectable()
export class ActivityService {
  private readonly log = new Logger(ActivityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Write an event. Never throws: a failure to log must not fail the request that caused it. */
  async record(type: ActivityType, input: ActivityInput): Promise<void> {
    try {
      await this.prisma.activityEvent.create({
        data: {
          type,
          userId: input.userId ?? null,
          actorId: input.actorId ?? null,
          email: input.email?.slice(0, 254) ?? null,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          detail: input.detail as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (e) {
      this.log.warn(`Could not record ${type}: ${e}`);
    }
  }
}
