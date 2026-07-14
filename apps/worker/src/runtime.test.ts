import { describe, expect, it, vi } from "vitest";

import { startWorkerRuntime } from "./runtime";

describe("Worker runtime", () => {
  it("stops the scheduler before closing all queue workers", async () => {
    const events: string[] = [];
    const runtime = startWorkerRuntime({
      createWorkers: () => [
        { close: async () => { events.push("clip-close"); } },
        { close: async () => { events.push("feed-close"); } },
        { close: async () => { events.push("summary-close"); } },
      ],
      startScheduler: () => ({
        stop() {
          events.push("scheduler-stop");
        },
      }),
    });

    await runtime.stop();

    expect(events[0]).toBe("scheduler-stop");
    expect(events.slice(1)).toEqual(["clip-close", "feed-close", "summary-close"]);
  });

  it("only closes runtime resources once", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const stop = vi.fn();
    const runtime = startWorkerRuntime({
      createWorkers: () => [{ close }],
      startScheduler: () => ({ stop }),
    });

    await Promise.all([runtime.stop(), runtime.stop()]);

    expect(stop).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
