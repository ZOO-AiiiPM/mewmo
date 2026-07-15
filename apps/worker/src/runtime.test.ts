import { describe, expect, it, vi } from "vitest";

import { startWorkerRuntime } from "./runtime";

describe("Worker runtime", () => {
  it("closes the temporary clip and summary workers without a feed scheduler", async () => {
    const events: string[] = [];
    const runtime = startWorkerRuntime({
      createWorkers: () => [
        { close: async () => { events.push("clip-close"); } },
        { close: async () => { events.push("summary-close"); } },
      ],
    });

    await runtime.stop();

    expect(events).toEqual(["clip-close", "summary-close"]);
  });

  it("only closes runtime resources once", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const runtime = startWorkerRuntime({
      createWorkers: () => [{ close }],
    });

    await Promise.all([runtime.stop(), runtime.stop()]);

    expect(close).toHaveBeenCalledTimes(1);
  });
});
