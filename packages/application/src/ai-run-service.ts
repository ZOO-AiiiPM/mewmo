import { getPrisma, Prisma, type AiRun, type PrismaClient } from "@mewmo/db";
import { enqueueAiRunSchema, type EnqueueAiRunDto } from "@mewmo/shared";
import { createHash } from "node:crypto";
import { DomainError } from "./errors";

export interface ClaimDueAiRunsInput {
  workerId: string;
  limit: number;
  leaseMs: number;
  now?: Date;
  /** Workers must claim only the run kinds they can execute. */
  kinds?: AiRun["kind"][];
}

interface CompleteBase {
  runId: string;
  workerId: string;
  expectedVersion: number;
}

export interface RelationResult {
  targetType: "note" | "clip" | "feed_entry";
  targetId: string;
  score: number;
  reason?: string;
}

export interface NoteInsightResult {
  kind: "completeness" | "duplicate_viewpoint" | "viewpoint_change";
  content: string;
  data?: unknown;
}

export function createAiRunService(options: { prisma?: PrismaClient } = {}) {
  const db = options.prisma ?? getPrisma();
  return {
    async enqueue(command: EnqueueAiRunDto) {
      const input = enqueueAiRunSchema.parse(command);
      const idempotencyKey = input.idempotencyKey ?? defaultRunKey(input);
      return db.aiRun.upsert({
        where: { userId_idempotencyKey: { userId: input.userId, idempotencyKey } },
        create: {
          userId: input.userId,
          kind: input.kind,
          targetType: input.targetType,
          targetId: input.targetId,
          inputVersion: input.inputVersion,
          idempotencyKey,
          ...(input.inputHash === undefined ? {} : { inputHash: input.inputHash }),
          ...(input.priority === undefined ? {} : { priority: input.priority }),
          ...(input.availableAt === undefined ? {} : { availableAt: input.availableAt }),
        },
        update: {},
      });
    },

    async claimDue(input: ClaimDueAiRunsInput) {
      const now = input.now ?? new Date();
      const leaseExpiresAt = new Date(now.getTime() + input.leaseMs);
      const limit = Math.min(Math.max(input.limit, 1), 100);
      const kindFilter = input.kinds?.length
        ? Prisma.sql`AND kind::text IN (${Prisma.join(input.kinds)})`
        : Prisma.empty;
      return db.$transaction(async (tx) => {
        const claimed = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          WITH due AS (
            SELECT id
            FROM ai_runs
            WHERE ((status = 'queued' AND available_at <= ${now})
               OR (status = 'running' AND lease_expires_at <= ${now}))
            ${kindFilter}
            ORDER BY priority DESC, available_at ASC, created_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT ${limit}
          )
          UPDATE ai_runs run
          SET status = 'running', worker_id = ${input.workerId}, lease_expires_at = ${leaseExpiresAt},
              started_at = COALESCE(run.started_at, ${now}), attempts = run.attempts + 1, updated_at = ${now}
          FROM due
          WHERE run.id = due.id
          RETURNING run.id
        `);
        if (!claimed.length) return [];
        return tx.aiRun.findMany({ where: { id: { in: claimed.map((item) => item.id) } } });
      });
    },

    async getInput(run: AiRun) {
      if (run.kind === "agent_automation" || run.targetType === "automation") {
        return db.aiAutomation.findFirst({
          where: { id: run.automationId ?? run.targetId, userId: run.userId, enabled: true },
          select: { id: true, chatId: true, prompt: true, skillName: true, version: true, name: true },
        });
      }
      const where = { id: run.targetId, userId: run.userId, deletedAt: null };
      if (run.targetType === "note") {
        const target = await db.note.findFirst({ where, select: { id: true, title: true, content: true, version: true, summary: true } });
        if (!target) return null;
        if (run.kind === "relation") return { ...target, candidates: await relationCandidates(db, run) };
        if (run.kind === "note_insight") return { ...target, related: await insightEvidence(db, run) };
        return target;
      }
      if (run.targetType === "clip") {
        const target = await db.clip.findFirst({ where, select: { id: true, title: true, content: true, version: true, summary: true, sourceName: true, url: true } });
        if (!target) return null;
        return run.kind === "relation" ? { ...target, candidates: await relationCandidates(db, run) } : target;
      }
      const target = await db.feedEntry.findFirst({ where, select: { id: true, title: true, content: true, version: true, summary: true, sourceName: true, url: true } });
      if (!target) return null;
      return run.kind === "relation" ? { ...target, candidates: await relationCandidates(db, run) } : target;
    },

    completeSummary(input: CompleteBase & { summary: string }) {
      return completeTarget(db, input, "summary", async (tx, run) => {
        const result = await updateTarget(tx, run, input.expectedVersion, { summary: input.summary });
        return { count: result.count, output: { summaryLength: input.summary.length } };
      });
    },

    completeEmbedding(input: CompleteBase & { embedding: number[]; dimensions: number; model: string }) {
      return completeTarget(db, input, "embedding", async (tx, run) => {
        const current = await findTarget(tx, run);
        if (!current || current.version !== input.expectedVersion) return { count: 0, output: null };
        await tx.contentEmbedding.upsert({
          where: { userId_targetType_targetId: { userId: run.userId, targetType: run.targetType, targetId: run.targetId } },
          create: { userId: run.userId, targetType: run.targetType, targetId: run.targetId, inputVersion: input.expectedVersion, embedding: input.embedding, dimensions: input.dimensions, model: input.model },
          update: { inputVersion: input.expectedVersion, embedding: input.embedding, dimensions: input.dimensions, model: input.model },
        });
        await enqueueFollowup(tx, run, "relation", input.expectedVersion, 5);
        return { count: 1, output: { dimensions: input.dimensions, model: input.model } };
      });
    },

    completeRelations(input: CompleteBase & { relations: RelationResult[] }) {
      return completeTarget(db, input, "relation", async (tx, run) => {
        const current = await findTarget(tx, run);
        if (!current || current.version !== input.expectedVersion) return { count: 0, output: null };
        await tx.contentRelation.deleteMany({ where: { userId: run.userId, sourceType: run.targetType, sourceId: run.targetId } });
        if (input.relations.length) {
          await tx.contentRelation.createMany({ data: input.relations.map((relation) => ({
            userId: run.userId,
            sourceType: run.targetType,
            sourceId: run.targetId,
            sourceVersion: input.expectedVersion,
            targetType: relation.targetType,
            targetId: relation.targetId,
            score: relation.score,
            ...(relation.reason === undefined ? {} : { reason: relation.reason }),
          })) });
        }
        if (run.targetType === "note") {
          await enqueueFollowup(tx, run, "note_insight", input.expectedVersion, 1);
        }
        return { count: 1, output: { relationCount: input.relations.length } };
      });
    },

    completeNoteInsight(input: CompleteBase & ({ insight: NoteInsightResult } | { insights: NoteInsightResult[] })) {
      return completeTarget(db, input, "note_insight", async (tx, run) => {
        if (run.targetType !== "note") throw new DomainError("invalid_state", "note insight target must be a note");
        const current = await tx.note.findFirst({ where: { id: run.targetId, userId: run.userId, deletedAt: null }, select: { version: true } });
        if (!current || current.version !== input.expectedVersion) return { count: 0, output: null };
        const insights = "insights" in input ? input.insights : [input.insight];
        for (const insight of insights) {
          await tx.noteInsight.upsert({
            where: { userId_noteId_kind: { userId: run.userId, noteId: run.targetId, kind: insight.kind } },
            create: { userId: run.userId, noteId: run.targetId, inputVersion: input.expectedVersion, kind: insight.kind, content: insight.content, ...(insight.data === undefined ? {} : { data: insight.data as never }) },
            update: { inputVersion: input.expectedVersion, content: insight.content, ...(insight.data === undefined ? {} : { data: insight.data as never }) },
          });
        }
        return { count: 1, output: { insightCount: insights.length } };
      });
    },

    async completeAgentAutomation(input: { runId: string; workerId: string; output: unknown }) {
      const run = await requireRunningRun(db, input.runId, input.workerId);
      if (run.kind !== "agent_automation") throw new DomainError("invalid_state", "AI run kind is not agent_automation");
      return db.aiRun.update({
        where: { id: run.id },
        data: { status: "succeeded", output: input.output as never, completedAt: new Date(), workerId: null, leaseExpiresAt: null, errorCode: null, errorMessage: null },
      });
    },

    getRun(input: { userId: string; runId: string }) {
      return db.aiRun.findFirst({ where: { id: input.runId, userId: input.userId } });
    },

    async retryRun(input: { userId: string; runId: string; now?: Date }) {
      const result = await db.aiRun.updateMany({
        where: { id: input.runId, userId: input.userId, status: "failed" },
        data: { status: "queued", attempts: 0, availableAt: input.now ?? new Date(), completedAt: null, errorCode: null, errorMessage: null, workerId: null, leaseExpiresAt: null },
      });
      if (result.count !== 1) throw new DomainError("invalid_state", "only an owned failed AI run can be retried");
      return db.aiRun.findFirstOrThrow({ where: { id: input.runId, userId: input.userId } });
    },

    async getRelated(input: { userId: string; targetType: "note" | "clip" | "feed_entry"; targetId: string }) {
      const relations = await db.contentRelation.findMany({
        where: { userId: input.userId, sourceType: input.targetType, sourceId: input.targetId },
        orderBy: { score: "desc" },
        take: 20,
      });
      return enrichRelations(db, relations.filter((relation): relation is typeof relation & { targetType: "note" | "clip" | "feed_entry" } => isContentTarget(relation.targetType)), input.userId);
    },

    async getNoteInsights(input: { userId: string; noteId: string }) {
      const note = await db.note.findFirst({
        where: { id: input.noteId, userId: input.userId, deletedAt: null },
        select: { id: true, version: true },
      });
      if (!note) return null;
      return db.noteInsight.findMany({
        where: { userId: input.userId, noteId: note.id, inputVersion: note.version },
        orderBy: { kind: "asc" },
      });
    },

    async queryRelated(input: { userId: string; embedding: number[]; limit: number }) {
      const rows = await db.contentEmbedding.findMany({ where: { userId: input.userId }, orderBy: { updatedAt: "desc" }, take: 500 });
      return rows
        .map((row) => ({ targetType: row.targetType, targetId: row.targetId, inputVersion: row.inputVersion, model: row.model, score: cosine(input.embedding, jsonVector(row.embedding)) }))
        .filter((row) => Number.isFinite(row.score))
        .sort((left, right) => right.score - left.score)
        .slice(0, Math.min(Math.max(input.limit, 1), 20));
    },

    async retryOrFail(input: { runId: string; workerId: string; error: unknown; now?: Date; maxAttempts?: number }) {
      const now = input.now ?? new Date();
      const run = await requireRunningRun(db, input.runId, input.workerId);
      const maxAttempts = input.maxAttempts ?? 3;
      const retry = run.attempts < maxAttempts;
      const delayMs = Math.min(60_000 * 2 ** Math.max(run.attempts - 1, 0), 60 * 60 * 1000);
      return db.aiRun.update({
        where: { id: run.id },
        data: {
          status: retry ? "queued" : "failed",
          availableAt: retry ? new Date(now.getTime() + delayMs) : now,
          workerId: null,
          leaseExpiresAt: null,
          completedAt: retry ? null : now,
          errorCode: "workflow_failed",
          errorMessage: safeError(input.error),
        },
      });
    },

    async supersede(input: { runId: string; workerId?: string; reason: string }) {
      const result = await db.aiRun.updateMany({
        where: { id: input.runId, status: { in: ["queued", "running"] }, ...(input.workerId === undefined ? {} : { workerId: input.workerId }) },
        data: { status: "superseded", completedAt: new Date(), workerId: null, leaseExpiresAt: null, errorCode: "superseded", errorMessage: input.reason },
      });
      if (result.count !== 1) throw new DomainError("invalid_state", "AI run cannot be superseded");
      return db.aiRun.findUniqueOrThrow({ where: { id: input.runId } });
    },
  };
}

async function relationCandidates(db: PrismaClient, run: AiRun) {
  if (!isContentTarget(run.targetType)) return [];
  const source = await db.contentEmbedding.findFirst({ where: { userId: run.userId, targetType: run.targetType, targetId: run.targetId } });
  if (!source) return [];
  const vector = jsonVector(source.embedding);
  const rows = await db.contentEmbedding.findMany({ where: { userId: run.userId, NOT: { targetType: run.targetType, targetId: run.targetId } }, orderBy: { updatedAt: "desc" }, take: 500 });
  return rows.map((row) => ({ targetType: row.targetType, targetId: row.targetId, targetVersion: row.inputVersion, similarity: cosine(vector, jsonVector(row.embedding)) }))
    .filter((row) => Number.isFinite(row.similarity) && row.similarity > 0)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, 50);
}

async function insightEvidence(db: PrismaClient, run: AiRun) {
  const relations = await db.contentRelation.findMany({ where: { userId: run.userId, sourceType: "note", sourceId: run.targetId }, orderBy: { score: "desc" }, take: 10 });
  const evidence = [];
  for (const relation of relations) {
    if (!isContentTarget(relation.targetType)) continue;
    const target = await findEvidenceTarget(db, run.userId, relation.targetType, relation.targetId);
    if (target) evidence.push({ targetType: relation.targetType, targetId: relation.targetId, title: target.title, excerpt: target.content.slice(0, 500) });
  }
  return evidence;
}

function isContentTarget(value: string): value is "note" | "clip" | "feed_entry" {
  return value === "note" || value === "clip" || value === "feed_entry";
}

function findEvidenceTarget(db: PrismaClient, userId: string, type: "note" | "clip" | "feed_entry", id: string) {
  const where = { id, userId, deletedAt: null };
  const select = { title: true, content: true };
  if (type === "note") return db.note.findFirst({ where, select });
  if (type === "clip") return db.clip.findFirst({ where, select });
  return db.feedEntry.findFirst({ where, select });
}

async function enrichRelations(
  db: PrismaClient,
  relations: Array<{ targetType: "note" | "clip" | "feed_entry"; targetId: string; [key: string]: unknown }>,
  userId: string,
) {
  const enriched = await Promise.all(relations.map(async (relation) => {
    const target = await findRelatedTarget(db, userId, relation.targetType, relation.targetId);
    if (!target) return null;
    return {
      ...relation,
      title: target.title,
      excerpt: target.content.slice(0, 240) || null,
      href: target.href,
    };
  }));
  return enriched.filter((relation): relation is NonNullable<typeof relation> => relation !== null);
}

async function findRelatedTarget(db: PrismaClient, userId: string, type: "note" | "clip" | "feed_entry", id: string) {
  const where = { id, userId, deletedAt: null };
  if (type === "note") {
    const note = await db.note.findFirst({ where, select: { title: true, content: true, slug: true } });
    return note ? { ...note, href: `/notes/${note.slug}` } : null;
  }
  if (type === "clip") {
    const clip = await db.clip.findFirst({ where, select: { title: true, content: true } });
    return clip ? { ...clip, href: `/clips/${id}` } : null;
  }
  const entry = await db.feedEntry.findFirst({ where, select: { title: true, content: true } });
  return entry ? { ...entry, href: `/feed-entries/${id}` } : null;
}

function jsonVector(value: unknown): number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number") ? value : [];
}

function cosine(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) return Number.NEGATIVE_INFINITY;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : Number.NEGATIVE_INFINITY;
}

async function completeTarget(
  db: PrismaClient,
  input: CompleteBase,
  kind: "summary" | "embedding" | "relation" | "note_insight",
  write: (tx: Prisma.TransactionClient, run: AiRun) => Promise<{ count: number; output: unknown }>,
) {
  return db.$transaction(async (tx) => {
    const run = await requireRunningRun(tx, input.runId, input.workerId);
    if (run.kind !== kind) throw new DomainError("invalid_state", `AI run kind is not ${kind}`);
    const result = await write(tx, run);
    if (result.count !== 1) {
      return tx.aiRun.update({ where: { id: run.id }, data: { status: "superseded", completedAt: new Date(), workerId: null, leaseExpiresAt: null, errorCode: "version_conflict", errorMessage: "content version changed before workflow completion" } });
    }
    return tx.aiRun.update({ where: { id: run.id }, data: { status: "succeeded", output: result.output as never, completedAt: new Date(), workerId: null, leaseExpiresAt: null, errorCode: null, errorMessage: null } });
  });
}

function updateTarget(tx: Prisma.TransactionClient, run: AiRun, version: number, data: Record<string, unknown>) {
  const where = { id: run.targetId, userId: run.userId, deletedAt: null, version };
  if (run.targetType === "note") return tx.note.updateMany({ where, data });
  if (run.targetType === "clip") return tx.clip.updateMany({ where, data });
  return tx.feedEntry.updateMany({ where, data });
}

function findTarget(tx: Prisma.TransactionClient, run: AiRun) {
  const where = { id: run.targetId, userId: run.userId, deletedAt: null };
  const select = { version: true };
  if (run.targetType === "note") return tx.note.findFirst({ where, select });
  if (run.targetType === "clip") return tx.clip.findFirst({ where, select });
  return tx.feedEntry.findFirst({ where, select });
}

async function requireRunningRun(db: Pick<PrismaClient, "aiRun"> | Prisma.TransactionClient, runId: string, workerId: string) {
  const run = await db.aiRun.findFirst({ where: { id: runId, status: "running", workerId } });
  if (!run) throw new DomainError("invalid_state", "AI run is not owned by this worker");
  return run;
}

function defaultRunKey(input: EnqueueAiRunDto) {
  const source = [input.kind, input.targetType, input.targetId, input.inputVersion, input.inputHash ?? ""].join(":");
  return createHash("sha256").update(source).digest("hex");
}

function enqueueFollowup(
  tx: Prisma.TransactionClient,
  run: AiRun,
  kind: "relation" | "note_insight",
  inputVersion: number,
  priority: number,
) {
  const idempotencyKey = `${kind}:${run.targetType}:${run.targetId}:v${inputVersion}`;
  return tx.aiRun.upsert({
    where: { userId_idempotencyKey: { userId: run.userId, idempotencyKey } },
    create: {
      userId: run.userId,
      kind,
      targetType: run.targetType,
      targetId: run.targetId,
      inputVersion,
      idempotencyKey,
      priority,
    },
    update: {},
  });
}

function safeError(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 500);
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message.slice(0, 500);
  }
  if (typeof error === "string") return error.slice(0, 500);
  return "workflow execution failed";
}
