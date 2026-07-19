import { describe, expect, it, vi } from "vitest";

import { startBackgroundJobRunner } from "./background-job-runner";

const job = {
  id: "job-1",
  type: "feed_entry_process" as const,
  payload: { userId: "user-1", entryId: "entry-1" },
  status: "running" as const,
  lockedUntil: new Date("2026-07-16T00:05:00Z"),
  attempts: 1,
  maxAttempts: 3,
  userId: "user-1",
};

describe("background job runner", () => {
  it("starts immediately, drains available jobs, then schedules an idle check", async () => {
    const repository = {
      enqueueMissingFeedEntryProcessJobs: vi.fn().mockResolvedValue(2),
      claimNext: vi.fn().mockResolvedValueOnce(job).mockResolvedValueOnce(null),
      complete: vi.fn().mockResolvedValue({ count: 1 }),
      fail: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const processJob = vi.fn().mockResolvedValue({ status: "ok" });
    const setTimer = vi.fn(() => 1 as unknown as ReturnType<typeof setTimeout>);
    const runner = startBackgroundJobRunner({
      repository,
      processJob,
      setTimer,
    });

    await vi.waitFor(() =>
      expect(repository.complete).toHaveBeenCalledWith(job),
    );
    expect(repository.enqueueMissingFeedEntryProcessJobs).toHaveBeenCalledWith(
      500,
    );
    expect(processJob).toHaveBeenCalledWith(job);
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 30_000);
    await runner.close();
  });

  it("records a retryable failure instead of crashing the worker", async () => {
    const repository = {
      enqueueMissingFeedEntryProcessJobs: vi.fn().mockResolvedValue(0),
      claimNext: vi.fn().mockResolvedValueOnce(job).mockResolvedValueOnce(null),
      complete: vi.fn().mockResolvedValue({ count: 1 }),
      fail: vi.fn().mockResolvedValue({ count: 1 }),
    };
    const runner = startBackgroundJobRunner({
      repository,
      processJob: vi.fn().mockRejectedValue(new Error("AI unavailable")),
      setTimer: vi.fn(() => 1 as unknown as ReturnType<typeof setTimeout>),
    });

    await vi.waitFor(() =>
      expect(repository.fail).toHaveBeenCalledWith(job, "AI unavailable"),
    );
    expect(repository.complete).not.toHaveBeenCalled();
    await runner.close();
  });
});
