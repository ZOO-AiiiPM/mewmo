import { describe, expect, it, vi } from "vitest";

import type {
  AiRuntimePort,
  AiWorkflowApplicationPort,
  ClaimedAiRun,
  WorkflowInput,
} from "../contracts";
import { runWorkflowBatch } from "./run-batch";

const summaryRun: ClaimedAiRun = {
  id: "run-summary",
  userId: "user-1",
  kind: "summary",
  targetType: "feed_entry",
  targetId: "entry-1",
  inputVersion: 2,
  attempt: 1,
};

function summaryInput(overrides: Partial<WorkflowInput> = {}): WorkflowInput {
  return {
    kind: "summary",
    targetType: "feed_entry",
    targetId: "entry-1",
    inputVersion: 2,
    currentVersion: 2,
    title: "Article",
    source: "Feed",
    url: "https://example.com/article",
    content: "Article body",
    ...overrides,
  } as WorkflowInput;
}

function setup(runs: ClaimedAiRun[], inputs: Record<string, WorkflowInput | null>) {
  const application: AiWorkflowApplicationPort = {
    claimDue: vi.fn().mockResolvedValue(runs),
    getInput: vi.fn().mockImplementation(async (run: ClaimedAiRun) => inputs[run.id] ?? null),
    completeSummary: vi.fn().mockResolvedValue({ status: "succeeded" }),
    completeEmbedding: vi.fn().mockResolvedValue({ status: "succeeded" }),
    completeRelations: vi.fn().mockResolvedValue({ status: "succeeded" }),
    completeNoteInsight: vi.fn().mockResolvedValue({ status: "succeeded" }),
    retryOrFail: vi.fn().mockResolvedValue("retrying"),
    supersede: vi.fn().mockResolvedValue(undefined),
  };
  const ai: AiRuntimePort = {
    generateText: vi.fn().mockResolvedValue({
      text: "文章说明了后台任务如何可靠执行。",
      metadata: { profile: "workflow.summary", model: "fake-summary" },
    }),
    generateObject: vi.fn(),
    embed: vi.fn(),
  };
  return { application, ai };
}

const loadPrompt = vi.fn().mockResolvedValue({
  metadata: { id: "summary", version: 1, task: "workflow.summary", revision: "revision" },
  content: "Summarize safely",
});

describe("AI Workflow batch engine", () => {
  it("returns immediately when no tasks are due", async () => {
    const { application, ai } = setup([], {});
    await expect(runWorkflowBatch({
      application,
      context: { ai, loadPrompt },
      workerId: "worker-1",
    })).resolves.toEqual({ claimed: 0, succeeded: 0, retrying: 0, failed: 0, superseded: 0 });
    expect(application.getInput).not.toHaveBeenCalled();
  });

  it("completes a summary using the frozen Application method shape", async () => {
    const { application, ai } = setup([summaryRun], { [summaryRun.id]: summaryInput() });
    const result = await runWorkflowBatch({
      application,
      context: { ai, loadPrompt },
      workerId: "worker-1",
      now: () => new Date("2026-07-20T00:00:00Z"),
    });
    expect(result.succeeded).toBe(1);
    expect(application.completeSummary).toHaveBeenCalledWith({
      runId: summaryRun.id,
      workerId: "worker-1",
      expectedVersion: 2,
      summary: "文章说明了后台任务如何可靠执行。",
    });
  });

  it("supersedes stale work before calling the model", async () => {
    const { application, ai } = setup([summaryRun], {
      [summaryRun.id]: summaryInput({ currentVersion: 3 }),
    });
    const result = await runWorkflowBatch({
      application,
      context: { ai, loadPrompt },
      workerId: "worker-1",
    });
    expect(result.superseded).toBe(1);
    expect(ai.generateText).not.toHaveBeenCalled();
    expect(application.supersede).toHaveBeenCalledWith({
      runId: summaryRun.id,
      workerId: "worker-1",
      reason: "version_changed",
    });
  });

  it("isolates failures so later tasks still complete", async () => {
    const second = { ...summaryRun, id: "run-second", targetId: "entry-2" };
    const { application, ai } = setup([summaryRun, second], {
      [summaryRun.id]: summaryInput(),
      [second.id]: summaryInput({ targetId: "entry-2" }),
    });
    vi.mocked(ai.generateText)
      .mockRejectedValueOnce(new Error("provider unavailable"))
      .mockResolvedValueOnce({
        text: "第二个任务仍然能够成功完成。",
        metadata: { profile: "workflow.summary", model: "fake-summary" },
      });
    const result = await runWorkflowBatch({
      application,
      context: { ai, loadPrompt },
      workerId: "worker-1",
      concurrency: 1,
    });
    expect(result).toMatchObject({ claimed: 2, retrying: 1, succeeded: 1 });
    expect(application.retryOrFail).toHaveBeenCalledWith(expect.objectContaining({
      runId: summaryRun.id,
      workerId: "worker-1",
      maxAttempts: 3,
    }));
    expect(application.completeSummary).toHaveBeenCalledWith(expect.objectContaining({ runId: second.id }));
  });
});
