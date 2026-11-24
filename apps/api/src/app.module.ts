import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module.js';
import { AiModule } from './ai/ai.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ChecksModule } from './checks/checks.module.js';
import { AccountThrottlerGuard } from './common/throttler.guard.js';
import { ConfigModule } from './config.module.js';
import { HealthController } from './health.controller.js';
import { LookupModule } from './lookup/lookup.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    // A generous default; the lookup routes, which cost upstream requests, set tighter limits of their own.
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 600 }] }),
    AuthModule,
    LookupModule,
    AiModule,
    ChecksModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AccountThrottlerGuard }],
})
export class AppModule {}
