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

  it("returns owned related content with a navigable presentation", async () => {
    const db = {
      contentRelation: { findMany: vi.fn().mockResolvedValue([{ targetType: "note", targetId: "note-2", score: 0.91 }]) },
      note: { findFirst: vi.fn().mockResolvedValue({ title: "Related note", content: "Evidence", slug: "related-note" }) },
    };
    await expect(createAiRunService({ prisma: db as never }).getRelated({
      userId: "user-1", targetType: "note", targetId: "note-1",
    })).resolves.toEqual([{ targetType: "note", targetId: "note-2", score: 0.91, title: "Related note", excerpt: "Evidence", href: "/notes/related-note" }]);
    expect(db.note.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: "user-1" }) }));
  });

  it("returns note insights only for the current owned note version", async () => {
    const insights = [{ id: "insight-1", noteId: "note-1", inputVersion: 4, kind: "completeness", content: "Add evidence." }];
    const db = {
      note: { findFirst: vi.fn().mockResolvedValue({ id: "note-1", version: 4 }) },
      noteInsight: { findMany: vi.fn().mockResolvedValue(insights) },
    };
    await expect(createAiRunService({ prisma: db as never }).getNoteInsights({ userId: "user-1", noteId: "note-1" })).resolves.toEqual(insights);
    expect(db.noteInsight.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1", noteId: "note-1", inputVersion: 4 },
    }));
  });

  it("persists structured provider errors instead of hiding them", async () => {
    const update = vi.fn().mockResolvedValue({ id: "run-3", status: "queued" });
    const db = {
      aiRun: {
        findFirst: vi.fn().mockResolvedValue({ id: "run-3", status: "running", workerId: "worker-1", attempts: 1 }),
        update,
      },
    };
    await createAiRunService({ prisma: db as never }).retryOrFail({ runId: "run-3", workerId: "worker-1", error: { code: "provider_unavailable", message: "embedding request failed with status 503" } });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ errorMessage: "embedding request failed with status 503" }) }));
  });
});
