import { describe, expect, it, vi } from "vitest";

import { startWorkerRuntime } from "./runtime";

describe("Worker runtime", () => {
  it("runs the existing summary worker and the PostgreSQL feed job runner", async () => {
    const events: string[] = [];
    const runtime = startWorkerRuntime({
      createWorker: () => ({ close: async () => { events.push("summary-close"); } }),
      createBackgroundJobRunner: () => ({ close: async () => { events.push("feed-job-close"); } }),
    });

    await runtime.stop();

    expect(events.sort()).toEqual(["feed-job-close", "summary-close"]);
  });

  it("only closes runtime resources once", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const runtime = startWorkerRuntime({
      createWorker: () => ({ close }),
      createBackgroundJobRunner: () => ({ close: vi.fn().mockResolvedValue(undefined) }),
    });

    await Promise.all([runtime.stop(), runtime.stop()]);

    expect(close).toHaveBeenCalledTimes(1);
  });
});
