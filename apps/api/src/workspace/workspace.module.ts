import { Global, Module } from '@nestjs/common';
import { WorkspaceController } from './workspace.controller.js';
import { WorkspaceGuard } from './workspace.guard.js';
import { WorkspaceService } from './workspace.service.js';

@Global()
@Module({
  controllers: [WorkspaceController],
  providers: [WorkspaceService, WorkspaceGuard],
  exports: [WorkspaceService, WorkspaceGuard],
})
export class WorkspaceModule {}
