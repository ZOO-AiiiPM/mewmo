import { describe, expect, it, vi } from "vitest";

import { createAiAutomationService } from "./ai-automation-service";

describe("AI automation service", () => {
  it("enqueues a due automation with a stable scheduled occurrence key", async () => {
    const scheduledFor = new Date("2026-07-22T00:00:00.000Z");
    const automation = {
      id: "automation-1",
      userId: "user-1",
      version: 3,
      enabled: true,
      nextRunAt: scheduledFor,
      cronExpression: "0 * * * *",
      timezone: "UTC",
    };
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: automation.id }]),
      aiAutomation: {
        findUnique: vi.fn().mockResolvedValue(automation),
        update: vi.fn().mockResolvedValue({}),
      },
      aiRun: { upsert: vi.fn().mockResolvedValue({ id: "run-1" }) },
    };
    const db = { $transaction: vi.fn((operation: (client: typeof tx) => unknown) => operation(tx)) };
    await expect(createAiAutomationService({ prisma: db as never }).enqueueDue({ now: new Date("2026-07-22T00:10:00.000Z") })).resolves.toEqual([{ id: "run-1" }]);
    expect(tx.aiRun.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        kind: "agent_automation",
        targetType: "automation",
        idempotencyKey: "agent_automation:automation-1:2026-07-22T00:00:00.000Z",
      }),
    }));
  });
});
