import { Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  emptyCounts,
  integrityFromCounts,
  summarize,
  type Check,
  type CheckMeta,
  type CheckSummary,
  type RefResult,
  type ResultKind,
  type Verdict,
  type VerdictCounts,
} from '@siyasat/core';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

type Tx = Prisma.TransactionClient;
type Doc = CheckMeta;

const json = (value: unknown) => value as Prisma.InputJsonValue;

/** Deleted checks can be restored for this long, then they are removed for good. */
const UNDO_WINDOW_MS = 24 * 3_600_000;
const PURGE_EVERY_MS = 6 * 3_600_000;
const INSERT_CHUNK = 1000;
/** Saving a check with thousands of results takes longer than Prisma's default five seconds. */
const LONG_TX = { timeout: 60_000, maxWait: 10_000 };

/**
 * Saved checks. A check's per-reference results are stored as rows of their own, so a long check can be
 * saved a batch at a time and a single verdict can be changed without rewriting everything.
 */
@Injectable()
export class ChecksService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ChecksService.name);
  private purgeTimer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    const purge = () => this.purgeDeleted().catch((e) => this.log.warn(`Could not purge deleted checks: ${e}`));
    void purge();
    this.purgeTimer = setInterval(purge, PURGE_EVERY_MS);
    this.purgeTimer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.purgeTimer);
  }

  private async purgeDeleted(): Promise<void> {
    const { count } = await this.prisma.check.deleteMany({ where: { deletedAt: { lt: new Date(Date.now() - UNDO_WINDOW_MS) } } });
    if (count) this.log.log(`Removed ${count} checks deleted more than a day ago`);
  }

  async list(workspaceId: string): Promise<CheckSummary[]> {
    const rows = await this.prisma.check.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: [{ checkedAt: 'desc' }, { createdAt: 'desc' }],
      select: { summary: true },
    });
    return rows.map((r) => r.summary as unknown as CheckSummary);
  }

  async get(workspaceId: string, id: string): Promise<Check> {
    const row = await this.prisma.check.findFirst({
      where: { id, workspaceId, deletedAt: null },
      select: { doc: true, results: { orderBy: { idx: 'asc' }, select: { kind: true, data: true } } },
    });
    if (!row) throw new NotFoundException('Check not found');
    const doc = row.doc as unknown as Doc;
    const of = (kind: ResultKind) => row.results.filter((r) => r.kind === kind).map((r) => r.data as unknown as RefResult);
    const check = { ...doc, results: of('results') } as Check;
    if (check.type === 'draft' && check.combo) check.refResults = of('refResults');
    return check;
  }

  /** Create a check, or replace everything about an existing one. */
  async put(workspaceId: string, check: Check): Promise<CheckSummary> {
    const { results, refResults, ...rest } = check as Check & { refResults?: RefResult[] };
    const doc = rest as Doc;
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.check.findUnique({ where: { id: check.id }, select: { workspaceId: true } });
      // An id that belongs to someone else's workspace is reported as missing, not as taken.
      if (existing && existing.workspaceId !== workspaceId) throw new NotFoundException('Check not found');

      const placeholder = { doc: json(doc), summary: json({}), checkedAt: new Date(doc.date), deletedAt: null };
      await tx.check.upsert({
        where: { id: check.id },
        create: { id: check.id, workspaceId, ...placeholder },
        update: placeholder,
      });
      await tx.checkResult.deleteMany({ where: { checkId: check.id } });
      // Draft results line up with the draft's sources by position; everything else carries its own index.
      await this.insert(tx, check.id, 'results', results, check.type !== 'draft');
      if (refResults?.length) await this.insert(tx, check.id, 'refResults', refResults, true);
      return this.refresh(tx, check.id, doc);
    }, LONG_TX);
  }

  private async insert(tx: Tx, checkId: string, kind: ResultKind, items: RefResult[], useOwnIndex: boolean): Promise<void> {
    const byIdx = new Map<number, RefResult>();
    items.forEach((r, position) => byIdx.set(useOwnIndex && r.i != null ? r.i : position, r));
    const rows = [...byIdx].map(([idx, r]) => ({ checkId, kind, idx, verdict: r.verdict, data: json(r) }));
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      await tx.checkResult.createMany({ data: rows.slice(i, i + INSERT_CHUNK) });
    }
  }

  /** Merge fields into a check. */
  async patch(workspaceId: string, id: string, patch: Record<string, unknown>): Promise<CheckSummary> {
    return this.prisma.$transaction(async (tx) => {
      const doc = await this.lock(tx, workspaceId, id);
      const next = { ...doc, ...patch, id: doc.id, type: doc.type } as Doc;
      // A field patched to null (such as `inputs` once a check is done) is dropped rather than stored.
      for (const [k, v] of Object.entries(next)) if (v === null) delete (next as Record<string, unknown>)[k];
      return this.refresh(tx, id, next);
    });
  }

  /** Add results to a check, replacing any that have the same index. */
  async upsertResults(workspaceId: string, id: string, kind: ResultKind, items: (RefResult & { i: number })[]): Promise<CheckSummary> {
    return this.prisma.$transaction(async (tx) => {
      const doc = await this.lock(tx, workspaceId, id);
      await tx.checkResult.deleteMany({ where: { checkId: id, kind, idx: { in: items.map((r) => r.i) } } });
      await this.insert(tx, id, kind, items, true);
      return this.refresh(tx, id, doc);
    });
  }

  /** Read a check's document, holding a row lock so concurrent writers take turns. */
  private async lock(tx: Tx, workspaceId: string, id: string): Promise<Doc> {
    const rows = await tx.$queryRaw<{ doc: unknown }[]>`
      SELECT doc FROM checks WHERE id = ${id}::uuid AND workspace_id = ${workspaceId}::uuid AND deleted_at IS NULL FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('Check not found');
    return rows[0]!.doc as Doc;
  }

  /** Recompute the scores and the summary from the stored results, and save them with the document. */
  private async refresh(tx: Tx, id: string, doc: Doc): Promise<CheckSummary> {
    const grouped = await tx.checkResult.groupBy({ by: ['kind', 'verdict'], where: { checkId: id }, _count: { _all: true } });
    const tally = (kind: ResultKind): VerdictCounts => {
      const counts = emptyCounts();
      for (const g of grouped) if (g.kind === kind) counts[g.verdict as Verdict] = g._count._all;
      return counts;
    };
    const counts = tally('results');
    const resultCount = Object.values(counts).reduce((a, b) => a + b, 0);
    doc.score = integrityFromCounts(counts);
    if (doc.type === 'draft' && doc.combo) doc.refScore = integrityFromCounts(tally('refResults'));

    const summary = summarize(doc, counts, resultCount);
    await tx.check.update({
      where: { id },
      data: { doc: json(doc), summary: json(summary), checkedAt: new Date(doc.date) },
    });
    return summary;
  }

  /** Mark checks as deleted. They can be restored until they are purged. Returns the ids that were deleted. */
  async remove(workspaceId: string, ids?: string[]): Promise<string[]> {
    const where = { workspaceId, deletedAt: null, ...(ids ? { id: { in: ids } } : {}) };
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.check.findMany({ where, select: { id: true } });
      const found = rows.map((r) => r.id);
      if (found.length) await tx.check.updateMany({ where: { id: { in: found } }, data: { deletedAt: new Date() } });
      return found;
    });
  }

  async restore(workspaceId: string, ids: string[]): Promise<string[]> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.check.findMany({ where: { workspaceId, id: { in: ids }, deletedAt: { not: null } }, select: { id: true } });
      const found = rows.map((r) => r.id);
      if (found.length) await tx.check.updateMany({ where: { id: { in: found } }, data: { deletedAt: null } });
      return found;
    });
  }
}
