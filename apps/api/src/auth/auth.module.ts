import { Global, Module } from '@nestjs/common';
import { ActivityService } from './activity.service.js';
import { AuthController } from './auth.controller.js';
import { SessionGuard, SignedInGuard, SuperAdminGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { SettingsService } from './settings.service.js';
import { UsageInterceptor } from './usage.interceptor.js';
import { UsageService } from './usage.service.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, ActivityService, SettingsService, UsageService, SessionGuard, SignedInGuard, SuperAdminGuard, UsageInterceptor],
  exports: [AuthService, ActivityService, SettingsService, UsageService, SessionGuard, SignedInGuard, SuperAdminGuard, UsageInterceptor],
})
export class AuthModule {}
