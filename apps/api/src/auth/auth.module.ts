import { Global, Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Global()
@Module({
  controllers: [AuthController, AdminController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
