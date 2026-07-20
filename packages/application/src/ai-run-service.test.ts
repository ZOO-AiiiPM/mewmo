import { describe, expect, it, vi } from "vitest";
import { createAiRunService } from "./ai-run-service";

function transactionDb(run: Record<string, unknown>, target: "note" | "clip") {
  const tx = {
    aiRun: {
      findFirst: vi.fn().mockResolvedValue(run),
      upsert: vi.fn().mockResolvedValue({ id: "followup-1" }),
      update: vi.fn().mockResolvedValue({ ...run, status: "succeeded" }),
    },
    note: { findFirst: vi.fn().mockResolvedValue(target === "note" ? { version: 4 } : null) },
    clip: { findFirst: vi.fn().mockResolvedValue(target === "clip" ? { version: 4 } : null) },
    feedEntry: { findFirst: vi.fn() },
    contentEmbedding: { upsert: vi.fn() },
    contentRelation: { deleteMany: vi.fn(), createMany: vi.fn() },
  };
  return {
    tx,
    db: { $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)) },
  };
}

describe("AI run workflow chaining", () => {
  it("queues relation calculation after a version-safe embedding write", async () => {
    const { db, tx } = transactionDb({
      id: "run-1", userId: "user-1", kind: "embedding", targetType: "clip", targetId: "clip-1", status: "running", workerId: "worker-1",
    }, "clip");
    await createAiRunService({ prisma: db as never }).completeEmbedding({
      runId: "run-1", workerId: "worker-1", expectedVersion: 4, embedding: [0.1, 0.2], dimensions: 2, model: "embed-model",
    });
    expect(tx.aiRun.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ kind: "relation", targetType: "clip", targetId: "clip-1", inputVersion: 4 }),
    }));
  });

  it("queues note insight after note relations are refreshed", async () => {
    const { db, tx } = transactionDb({
      id: "run-2", userId: "user-1", kind: "relation", targetType: "note", targetId: "note-1", status: "running", workerId: "worker-1",
    }, "note");
    await createAiRunService({ prisma: db as never }).completeRelations({
      runId: "run-2", workerId: "worker-1", expectedVersion: 4, relations: [],
    });
    expect(tx.aiRun.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ kind: "note_insight", targetType: "note", targetId: "note-1", inputVersion: 4 }),
    }));
  });
});
