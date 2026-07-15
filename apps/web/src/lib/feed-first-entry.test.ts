import { describe, expect, it, vi } from "vitest";

import { waitForFirstFeedEntry } from "./feed-first-entry";

describe("waitForFirstFeedEntry", () => {
  it("settles by the overall deadline when both polling requests never settle", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(() => new Promise<Response>(() => {}));
    const pending = waitForFirstFeedEntry(
      { id: "feed-1", type: "article" },
      1_000,
      { fetcher, requestTimeoutMs: 200, pollIntervalMs: 100 },
    );

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toBe(false);
    expect(fetcher).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    vi.useRealTimers();
  });
});
