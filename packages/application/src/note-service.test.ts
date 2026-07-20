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
      aiAction: { findFirst: vi.fn().mockResolvedValue({ expectedVersion: 2 }) },
      note: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findFirst: vi.fn().mockResolvedValue({ version: 3 }),
      },
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
});
