import { LIMITS } from '@siyasat/core';
import { z } from 'zod';

/*
 * A check is a document the web app owns, so these schemas pin down only what the API itself relies on
 * (ids, types, verdicts, sizes) and let the rest through untouched.
 */

const verdict = z.enum(['verified', 'correction', 'uncertain', 'not_found', 'retracted', 'error']);

const refResult = z.looseObject({
  raw: z.string().max(LIMITS.referenceChars * 2),
  verdict,
  i: z.number().int().min(0).max(LIMITS.referencesPerCheck).optional(),
});

const claim = z.looseObject({
  sentence: z.string().max(10_000),
  cites: z.array(z.looseObject({ label: z.string().max(400), key: z.string().max(200) })).max(100),
  judgment: z.enum(['match', 'nomatch', 'unsure']).nullable(),
});

const source = z.looseObject({ key: z.string().max(200), label: z.string().max(400) });

const base = {
  id: z.uuid(),
  name: z.string().trim().min(1).max(300),
  date: z.iso.datetime(),
  score: z.number().min(0).max(100),
  results: z.array(refResult).max(LIMITS.referencesPerCheck),
};

const refsCheck = z.looseObject({
  ...base,
  type: z.enum(['refs', 'corpus']),
  total: z.number().int().min(0).max(LIMITS.referencesPerCheck),
  status: z.enum(['running', 'paused', 'done']),
  inputs: z.array(z.string().max(LIMITS.referenceChars * 2)).max(LIMITS.referencesPerCheck).nullish(),
});

const draftCheck = z.looseObject({
  ...base,
  type: z.literal('draft'),
  claims: z.array(claim).max(2000),
  sources: z.array(source).max(500),
  orphans: z.array(z.looseObject({ label: z.string(), key: z.string() })).max(500),
  uncited: z.array(z.string()).max(LIMITS.referencesPerCheck),
  hasRefs: z.boolean(),
  input: z.string().max(2_000_000),
  refsIn: z.string().max(2_000_000),
  refResults: z.array(refResult).max(LIMITS.referencesPerCheck).optional(),
});

export const checkSchema = z.discriminatedUnion('type', [refsCheck, draftCheck]);
export type CheckBody = z.infer<typeof checkSchema>;

/** Fields a PATCH may change. The identity of a check, and its results, are not among them. */
export const patchSchema = z
  .looseObject({
    name: z.string().trim().min(1).max(300).optional(),
    date: z.iso.datetime().optional(),
    status: z.enum(['running', 'paused', 'done']).optional(),
    inputs: z.array(z.string().max(LIMITS.referenceChars * 2)).max(LIMITS.referencesPerCheck).nullish(),
    claims: z.array(claim).max(2000).optional(),
    sources: z.array(source).max(500).optional(),
  })
  .refine((p) => !('id' in p) && !('type' in p) && !('results' in p) && !('refResults' in p), {
    message: 'id, type, results and refResults cannot be patched',
  });
export type PatchBody = z.infer<typeof patchSchema>;

export const resultsSchema = z.object({
  kind: z.enum(['results', 'refResults']).default('results'),
  items: z
    .array(refResult.extend({ i: z.number().int().min(0).max(LIMITS.referencesPerCheck) }))
    .min(1)
    .max(LIMITS.resultsPerRequest),
});
export type ResultsBody = z.infer<typeof resultsSchema>;

export const idsSchema = z.object({ ids: z.array(z.uuid()).min(1).max(5000) });
export const idParam = z.uuid();
