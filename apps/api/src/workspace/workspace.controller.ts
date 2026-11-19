import { Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { WorkspaceCreated } from '@siyasat/core';
import { WorkspaceService } from './workspace.service.js';

@Controller('workspaces')
export class WorkspaceController {
  constructor(private readonly workspaces: WorkspaceService) {}

  /** Start a new anonymous workspace. The browser keeps the token; it is not shown again. */
  @Post()
  @Throttle({ default: { limit: 20, ttl: 3_600_000 } })
  async create(): Promise<WorkspaceCreated> {
    return { token: await this.workspaces.create() };
  }
}
