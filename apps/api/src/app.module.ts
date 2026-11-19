import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ChecksModule } from './checks/checks.module.js';
import { WorkspaceThrottlerGuard } from './common/throttler.guard.js';
import { ConfigModule } from './config.module.js';
import { HealthController } from './health.controller.js';
import { LookupModule } from './lookup/lookup.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { WorkspaceModule } from './workspace/workspace.module.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    // A generous default; the lookup routes, which cost upstream requests, set tighter limits of their own.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 600 }] }),
    WorkspaceModule,
    LookupModule,
    ChecksModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: WorkspaceThrottlerGuard }],
})
export class AppModule {}
