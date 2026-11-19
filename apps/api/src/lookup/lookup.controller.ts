import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  LIMITS,
  type CheckSourceResponse,
  type EnrichResponse,
  type FullTextResponse,
  type VerifyResponse,
} from '@siyasat/core';
import { z } from 'zod';
import { UpstreamService } from '../upstream/upstream.service.js';
import { WorkspaceGuard } from '../workspace/workspace.guard.js';
import { FullTextService } from './fulltext.service.js';
import { SourcesService } from './sources.service.js';
import { VerifyService } from './verify.service.js';

const verifySchema = z.object({ raw: z.string().trim().min(1).max(LIMITS.referenceChars) });

const sourceSchema = z.object({
  source: z.object({
    key: z.string().max(200),
    label: z.string().max(400),
    ref: z.string().max(LIMITS.referenceChars).nullish().transform((v) => v ?? null),
    authors: z.string().max(400).optional(),
    year: z.number().int().optional(),
    first: z.string().max(200).optional(),
  }),
  claim: z.string().max(5000),
  hasRefs: z.boolean(),
});

/** A DOI: "10.", a registrant code, a slash, and a suffix with no spaces. */
const doiSchema = z.object({
  doi: z.string().trim().max(300).regex(/^10\.\d{4,9}\/\S+$/, 'Not a DOI'),
});

/** Looking things up in the scholarly databases. Each call here costs several upstream requests. */
@Controller()
@UseGuards(WorkspaceGuard)
export class LookupController {
  constructor(
    private readonly verifier: VerifyService,
    private readonly sources: SourcesService,
    private readonly fullText: FullTextService,
    private readonly upstream: UpstreamService,
  ) {}

  private busy(): { busy?: string[] } {
    const busy = this.upstream.busyServices();
    return busy.length ? { busy } : {};
  }

  /** Check one reference: is it real, are its details right, has it been retracted? */
  @Post('verify')
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  async verify(@Body({ schema: verifySchema }) body: z.infer<typeof verifySchema>): Promise<VerifyResponse> {
    const result = await this.verifier.verify(body.raw);
    return { result, ...this.busy() };
  }

  /** Check one source cited in a draft, and fetch its abstract. */
  @Post('draft/source')
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  async checkSource(@Body({ schema: sourceSchema }) body: z.infer<typeof sourceSchema>): Promise<CheckSourceResponse> {
    const { result, abstract } = await this.verifier.checkSource(body.source, body.claim, body.hasRefs);
    return { result, abstract, ...this.busy() };
  }

  /** Venue and open-access details for a DOI. */
  @Get('enrich')
  @Throttle({ default: { limit: 240, ttl: 60_000 } })
  async enrich(@Query({ schema: doiSchema }) query: z.infer<typeof doiSchema>): Promise<EnrichResponse> {
    return this.sources.enrich(query.doi.toLowerCase());
  }

  /** A free full text for a DOI, when one exists. */
  @Get('fulltext')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  fulltext(@Query({ schema: doiSchema }) query: z.infer<typeof doiSchema>): Promise<FullTextResponse> {
    return this.fullText.lookup(query.doi);
  }
}
