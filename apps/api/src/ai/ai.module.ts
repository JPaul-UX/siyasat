import { Module } from '@nestjs/common';
import { LookupModule } from '../lookup/lookup.module.js';
import { AiController } from './ai.controller.js';
import { AiService } from './ai.service.js';

/** The optional AI web search. It uses the lookup module's Crossref client, so the two share one rate limit. */
@Module({
  imports: [LookupModule],
  controllers: [AiController],
  providers: [AiService],
})
export class AiModule {}
