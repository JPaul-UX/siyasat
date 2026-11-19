import { Module } from '@nestjs/common';
import { UpstreamService } from '../upstream/upstream.service.js';
import { FullTextService } from './fulltext.service.js';
import { LookupController } from './lookup.controller.js';
import { SourcesService } from './sources.service.js';
import { VerifyService } from './verify.service.js';

@Module({
  controllers: [LookupController],
  providers: [UpstreamService, SourcesService, VerifyService, FullTextService],
})
export class LookupModule {}
