import { describe, expect, it, vi } from "vitest";
import { createAiActionService } from "./ai-action-service";

const actor = { userId: "user-1", source: "internal-agent" as const, scopes: ["*"] };

describe("AI action service", () => {
  it("confirmation does not claim a client action succeeded", async () => {
    const action = { id: "action-1", userId: "user-1", status: "proposed" };
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
});
