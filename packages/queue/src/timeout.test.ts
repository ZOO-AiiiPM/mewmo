import { describe, expect, it, vi } from "vitest";

import { withTimeout } from "./timeout";

describe("withTimeout", () => {
  it("rejects an operation that never settles", async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise<never>(() => {}), 1_000, "queue timed out");
    const assertion = expect(pending).rejects.toThrow("queue timed out");

    await vi.advanceTimersByTimeAsync(1_000);

    await assertion;
    vi.useRealTimers();
  });

  it("clears its timer when the operation settles", async () => {
    vi.useFakeTimers();

    await expect(withTimeout(Promise.resolve("ok"), 1_000, "timeout")).resolves.toBe("ok");
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
