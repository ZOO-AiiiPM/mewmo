import { describe, expect, it, vi } from "vitest";
import { createNoteService } from "./note-service";
import { DomainError } from "./errors";

const actor = { userId: "user-1", source: "internal-agent" as const, scopes: ["notes:write", "trash:write"] };

describe("note application service", () => {
  it("requires confirmed actions for Agent writes", async () => {
    const db = { aiAction: { findFirst: vi.fn() } };
    const service = createNoteService({ prisma: db as never });
    await expect(service.update(actor, {
      noteId: "note-1", expectedVersion: 2, patch: { title: "Updated" }, idempotencyKey: "key-1",
    })).rejects.toMatchObject({ code: "confirmation_required" });
    expect(db.aiAction.findFirst).not.toHaveBeenCalled();
  });

  it("rejects stale versions without overwriting content", async () => {
    const db = {
      aiAction: { findFirst: vi.fn().mockResolvedValue({ expectedVersion: 2, toolName: "note_update" }) },
      note: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn().mockResolvedValue({ version: 3 }),
      },
      $transaction: vi.fn((operation: (tx: unknown) => unknown) => operation(db)),
    };
    const service = createNoteService({ prisma: db as never });
    const promise = service.update(actor, {
      noteId: "note-1", expectedVersion: 2, patch: { title: "Updated" }, idempotencyKey: "key-1", actionId: "action-1",
    });
    await expect(promise).rejects.toEqual(expect.objectContaining<Partial<DomainError>>({ code: "conflict" }));
    expect(db.note.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: "user-1", version: 2 }),
    }));
  });

  it("atomically queues note embedding after an Agent content update", async () => {
    const updated = { id: "note-1", userId: "user-1", title: "Updated", content: "Body", version: 3 };
    const db = {
      aiAction: { findFirst: vi.fn().mockResolvedValue({ expectedVersion: 2, toolName: "note_update" }) },
      aiRun: { upsert: vi.fn().mockResolvedValue({ id: "run-1" }) },
      note: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirstOrThrow: vi.fn().mockResolvedValue(updated),
      },
      $transaction: vi.fn((operation: (tx: unknown) => unknown) => operation(db)),
    };
    const result = await createNoteService({ prisma: db as never }).update(actor, {
      noteId: "note-1", expectedVersion: 2, patch: { content: "Body" }, idempotencyKey: "key-1", actionId: "action-1",
    });
    expect(result).toEqual(updated);
    expect(db.aiRun.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ kind: "embedding", targetType: "note", targetId: "note-1", inputVersion: 3 }),
    }));
  });

  it("atomically queues note embedding after an Agent note creation", async () => {
    const created = { id: "note-2", userId: "user-1", title: "Created", content: "Body", slug: "created", version: 1 };
    const db = {
      aiAction: { findFirst: vi.fn().mockResolvedValue({ expectedVersion: null, toolName: "note_create" }) },
      aiRun: { upsert: vi.fn().mockResolvedValue({ id: "run-2" }) },
      note: { create: vi.fn().mockResolvedValue(created) },
      $transaction: vi.fn((operation: (tx: unknown) => unknown) => operation(db)),
    };
    const result = await createNoteService({ prisma: db as never }).create(actor, {
      title: "Created", content: "Body", idempotencyKey: "key-2", actionId: "action-2",
    });
    expect(result).toEqual(created);
    expect(db.aiRun.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ kind: "embedding", targetType: "note", targetId: "note-2", inputVersion: 1 }),
    }));
  });
});
