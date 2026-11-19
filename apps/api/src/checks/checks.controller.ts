import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import type { Check, CheckIds, CheckResponse, ChecksListResponse, CheckWriteResponse, RefResult } from '@siyasat/core';
import { WorkspaceGuard, WorkspaceId } from '../workspace/workspace.guard.js';
import {
  checkSchema,
  idParam,
  idsSchema,
  patchSchema,
  resultsSchema,
  type CheckBody,
  type PatchBody,
  type ResultsBody,
} from './checks.schemas.js';
import { ChecksService } from './checks.service.js';

/** A workspace's saved checks. */
@Controller('checks')
@UseGuards(WorkspaceGuard)
export class ChecksController {
  constructor(private readonly checks: ChecksService) {}

  @Get()
  list(@WorkspaceId() workspaceId: string): Promise<ChecksListResponse> {
    return this.checks.list(workspaceId);
  }

  /** Bring back checks that were deleted, for "Undo". */
  @Post('restore')
  @HttpCode(200)
  async restore(@WorkspaceId() workspaceId: string, @Body({ schema: idsSchema }) body: CheckIds): Promise<CheckIds> {
    return { ids: await this.checks.restore(workspaceId, body.ids) };
  }

  @Get(':id')
  get(@WorkspaceId() workspaceId: string, @Param('id', { schema: idParam }) id: string): Promise<CheckResponse> {
    return this.checks.get(workspaceId, id);
  }

  /** Create a check, or replace it entirely. */
  @Put(':id')
  put(
    @WorkspaceId() workspaceId: string,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: checkSchema }) body: CheckBody,
  ): Promise<CheckWriteResponse> {
    if (body.id !== id) throw new BadRequestException('The id in the body does not match the URL');
    return this.checks.put(workspaceId, body as unknown as Check);
  }

  /** Merge fields into a check, e.g. its status, or the verdicts on a draft's claims. */
  @Patch(':id')
  patch(
    @WorkspaceId() workspaceId: string,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: patchSchema }) body: PatchBody,
  ): Promise<CheckWriteResponse> {
    return this.checks.patch(workspaceId, id, body);
  }

  /** Add a batch of results to a check, or replace the ones at the same positions. */
  @Post(':id/results')
  @HttpCode(200)
  upsertResults(
    @WorkspaceId() workspaceId: string,
    @Param('id', { schema: idParam }) id: string,
    @Body({ schema: resultsSchema }) body: ResultsBody,
  ): Promise<CheckWriteResponse> {
    return this.checks.upsertResults(workspaceId, id, body.kind, body.items as (RefResult & { i: number })[]);
  }

  /** Delete every saved check in the workspace. Answers with the ids, so the deletion can be undone. */
  @Delete()
  async removeAll(@WorkspaceId() workspaceId: string): Promise<CheckIds> {
    return { ids: await this.checks.remove(workspaceId) };
  }

  @Delete(':id')
  async remove(@WorkspaceId() workspaceId: string, @Param('id', { schema: idParam }) id: string): Promise<CheckIds> {
    return { ids: await this.checks.remove(workspaceId, [id]) };
  }
}
