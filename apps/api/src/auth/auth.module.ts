import { Global, Module } from '@nestjs/common';
import { AdminController, AdminGuard } from './admin.controller.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

/** Global so the checker guards, which Nest builds inside each feature module, can see AuthService. */
@Global()
@Module({
  controllers: [AuthController, AdminController],
  providers: [AuthService, AdminGuard],
  exports: [AuthService, AdminGuard],
})
export class AuthModule {}
