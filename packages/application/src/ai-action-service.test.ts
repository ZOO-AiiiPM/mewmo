import { describe, expect, it, vi } from "vitest";
import { createAiActionService } from "./ai-action-service";

const actor = { userId: "user-1", source: "internal-agent" as const, scopes: ["*"] };

describe("AI action service", () => {
  it("confirmation does not claim a client action succeeded", async () => {
    const action = { id: "action-1", userId: "user-1", status: "proposed", executionMode: "client" };
    const db = {
      aiAction: {
        findFirst: vi.fn().mockResolvedValueOnce(action).mockResolvedValueOnce({ ...action, status: "confirmed" }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const result = await createAiActionService({ prisma: db as never }).confirm(actor, { actionId: "action-1" });
    expect(result.status).toBe("confirmed");
    expect(db.aiAction.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "confirmed" }) }));
  });

  it("rejects a retry from the wrong execution mode before mutating state", async () => {
    const db = {
      aiAction: {
        findFirst: vi.fn().mockResolvedValue({ id: "action-1", userId: "user-1", status: "failed", executionMode: "client" }),
        updateMany: vi.fn(),
      },
    };
    await expect(createAiActionService({ prisma: db as never }).retry(actor, { actionId: "action-1", executionMode: "server" })).rejects.toMatchObject({ code: "invalid_state" });
    expect(db.aiAction.updateMany).not.toHaveBeenCalled();
  });

  it("rejects client results for server actions", async () => {
    const db = {
      aiAction: {
        findFirst: vi.fn().mockResolvedValue({ id: "action-1", userId: "user-1", status: "executing", executionMode: "server" }),
        update: vi.fn(),
      },
    };
    await expect(createAiActionService({ prisma: db as never }).recordResult(actor, { actionId: "action-1", executionMode: "client", succeeded: true })).rejects.toMatchObject({ code: "invalid_state" });
    expect(db.aiAction.update).not.toHaveBeenCalled();
  });

  it("rejects a reused idempotency key when the frozen action input differs", async () => {
    const db = {
      aiAction: {
        upsert: vi.fn().mockResolvedValue({
          chatId: null,
          turnId: null,
          toolCallId: null,
          toolName: "note_create",
          input: { title: "old" },
          preview: { title: "old" },
          riskLevel: "write",
          executionMode: "server",
          clientEffect: null,
          expectedVersion: null,
        }),
      },
    };
    await expect(createAiActionService({ prisma: db as never }).propose(actor, {
      toolName: "note_create",
      input: { title: "new" },
      preview: { title: "new" },
      riskLevel: "write",
      executionMode: "server",
      idempotencyKey: "action-key",
    })).rejects.toMatchObject({ code: "conflict" });
  });
});
