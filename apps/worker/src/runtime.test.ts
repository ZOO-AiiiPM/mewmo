import { describe, expect, it, vi } from "vitest";

import { startWorkerRuntime } from "./runtime";

describe("Worker runtime", () => {
  it("runs only the persistent summary worker", async () => {
    const events: string[] = [];
    const runtime = startWorkerRuntime({
      createWorker: () => ({ close: async () => { events.push("summary-close"); } }),
    });

    await runtime.stop();

    expect(events).toEqual(["summary-close"]);
  });

  it("only closes runtime resources once", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const runtime = startWorkerRuntime({
      createWorker: () => ({ close }),
    });

    await Promise.all([runtime.stop(), runtime.stop()]);

    expect(close).toHaveBeenCalledTimes(1);
  });
});
