import { describe, expect, it, vi } from "vitest";

import { waitForFirstFeedEntry } from "../../apps/web/src/lib/feed-first-entry";

describe("first feed entry runtime", () => {
  it("bounds a response body that never closes", async () => {
    vi.useFakeTimers();
    const neverClosingBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("["));
      },
    });
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("feed-entries")) return new Response(neverClosingBody, { headers: { "content-type": "application/json" } });
      return Response.json({ lastFetchStatus: "queued" });
    });
    const pending = waitForFirstFeedEntry(
      { id: "feed-1", type: "article" },
      1_000,
      { fetcher: fetcher as typeof fetch, requestTimeoutMs: 200, pollIntervalMs: 100 },
    );

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toBe(false);
    vi.useRealTimers();
  });
});
