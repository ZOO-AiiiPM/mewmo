import { describe, expect, it } from "vitest";

import { submitFeedAddBatch } from "../../apps/web/src/lib/feed-add-batch";

describe("feed add batch runtime", () => {
  it("keeps only rejected or queue-failed sources selected for retry", async () => {
    const result = await submitFeedAddBatch(
      [{ url: "ok" }, { url: "queue-failed" }, { url: "request-failed" }],
      async (candidate) => {
        if (candidate.url === "request-failed") throw new Error("request failed");
        return {
          ...candidate,
          existing: false,
          queued: candidate.url === "ok",
          backgroundStarted: candidate.url === "queue-failed",
        };
      },
    );

    expect(result.persistedFeeds.map((feed) => feed.url)).toEqual(["ok", "queue-failed"]);
    expect(result.savedFeeds.map((feed) => feed.url)).toEqual(["ok"]);
    expect(result.failedUrls).toEqual(["queue-failed", "request-failed"]);
    expect(result.outcomes).toEqual({ ok: "added", "queue-failed": "failed", "request-failed": "failed" });
  });
});
