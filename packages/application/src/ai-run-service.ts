import { getPrisma, Prisma, type AiRun, type PrismaClient } from "@mewmo/db";
import { enqueueAiRunSchema, type EnqueueAiRunDto } from "@mewmo/shared";
import { createHash } from "node:crypto";
import { DomainError } from "./errors";

export interface ClaimDueAiRunsInput {
  workerId: string;
  limit: number;
  leaseMs: number;
  now?: Date;
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
      return db.$transaction(async (tx) => {
        const claimed = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          WITH due AS (
            SELECT id
            FROM ai_runs
            WHERE (status = 'queued' AND available_at <= ${now})
               OR (status = 'running' AND lease_expires_at <= ${now})
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
      const where = { id: run.targetId, userId: run.userId, deletedAt: null };
      const select = { id: true, title: true, content: true, version: true, summary: true };
      if (run.targetType === "note") return db.note.findFirst({ where, select });
      if (run.targetType === "clip") return db.clip.findFirst({ where, select });
      return db.feedEntry.findFirst({ where, select });
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
        return { count: 1, output: { relationCount: input.relations.length } };
      });
    },

    completeNoteInsight(input: CompleteBase & { insight: { kind: "completeness" | "duplicate_viewpoint" | "viewpoint_change"; content: string; data?: unknown } }) {
      return completeTarget(db, input, "note_insight", async (tx, run) => {
        if (run.targetType !== "note") throw new DomainError("invalid_state", "note insight target must be a note");
        const current = await tx.note.findFirst({ where: { id: run.targetId, userId: run.userId, deletedAt: null }, select: { version: true } });
        if (!current || current.version !== input.expectedVersion) return { count: 0, output: null };
        await tx.noteInsight.upsert({
          where: { userId_noteId_kind: { userId: run.userId, noteId: run.targetId, kind: input.insight.kind } },
          create: { userId: run.userId, noteId: run.targetId, inputVersion: input.expectedVersion, kind: input.insight.kind, content: input.insight.content, ...(input.insight.data === undefined ? {} : { data: input.insight.data as never }) },
          update: { inputVersion: input.expectedVersion, content: input.insight.content, ...(input.insight.data === undefined ? {} : { data: input.insight.data as never }) },
        });
        return { count: 1, output: { kind: input.insight.kind } };
      });
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

function safeError(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 500);
  return "workflow execution failed";
}
