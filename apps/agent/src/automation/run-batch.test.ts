import { describe, expect, it, vi } from "vitest";

import { runAgentAutomationsOnce, type AgentAutomationRunPort } from "./run-batch";
import type { AgentRuntimePort, ApplicationPort } from "../ports";

function setup() {
  const runs: AgentAutomationRunPort = {
    claimDue: vi.fn().mockResolvedValue([{ id: "run-1", userId: "user-1", targetId: "automation-1", automationId: "automation-1", inputVersion: 2, attempt: 1 }]),
    getInput: vi.fn().mockResolvedValue({ id: "automation-1", chatId: "chat-1", prompt: "整理日报", skillName: null, version: 2 }),
    complete: vi.fn().mockResolvedValue({}),
    retryOrFail: vi.fn().mockResolvedValue({ status: "queued" }),
    supersede: vi.fn().mockResolvedValue({}),
  };
  const application = {
    turns: {
      begin: vi.fn().mockResolvedValue({ turnId: "turn-1" }),
      complete: vi.fn().mockResolvedValue({ userMessage: { id: "u", role: "user", content: "整理日报", status: "completed", createdAt: "now" }, assistantMessage: { id: "a", role: "assistant", content: "完成", status: "completed", createdAt: "now" } }),
      fail: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as ApplicationPort;
  const runtime: AgentRuntimePort = {
    run: vi.fn().mockResolvedValue({ text: "完成", proposals: [], userEntryId: "u", assistantEntryId: "a" }),
  };
  return { runs, application, runtime };
}

describe("Agent automation runner", () => {
  it("executes an automation through the regular Agent turn boundary", async () => {
    const setupValue = setup();
    const result = await runAgentAutomationsOnce({ ...setupValue, workerId: "agent-worker", now: () => new Date("2026-07-22T00:00:00Z") });
    expect(result).toEqual({ claimed: 1, succeeded: 1, retrying: 0, superseded: 0 });
    expect(setupValue.application.turns.begin).toHaveBeenCalledWith(expect.objectContaining({ chatId: "chat-1", content: "整理日报" }));
    expect(setupValue.runtime.run).toHaveBeenCalledWith(expect.objectContaining({ turnId: "turn-1", actor: expect.objectContaining({ userId: "user-1" }) }));
    expect(setupValue.runs.complete).toHaveBeenCalledWith(expect.objectContaining({ runId: "run-1" }));
  });

  it("does not call the Agent when an automation version is stale", async () => {
    const setupValue = setup();
    vi.mocked(setupValue.runs.getInput).mockResolvedValue({ id: "automation-1", chatId: "chat-1", prompt: "整理日报", skillName: null, version: 3 });
    const result = await runAgentAutomationsOnce({ ...setupValue, workerId: "agent-worker" });
    expect(result).toMatchObject({ claimed: 1, superseded: 1 });
    expect(setupValue.runtime.run).not.toHaveBeenCalled();
  });
});
