import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { WorkspaceGuard } from './workspace.guard.js';

@Global()
@Module({
  imports: [AuthModule],
  providers: [WorkspaceGuard],
  exports: [WorkspaceGuard],
})
export class WorkspaceModule {}
