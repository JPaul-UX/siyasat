import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { WorkspaceGuard } from './workspace.guard.js';

/** Global so the checker routes can require a signed-in, approved account. */
@Global()
@Module({
  imports: [AuthModule],
  providers: [WorkspaceGuard],
  exports: [WorkspaceGuard, AuthModule],
})
export class WorkspaceModule {}
