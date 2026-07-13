import { describe, expect, it, vi } from "vitest";

import { processClipFetchJob } from "./clip-worker";

describe("processClipFetchJob", () => {
  it("calls the secured Web background extraction endpoint", async () => {
    const fetchBackground = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "success" })));

    const result = await processClipFetchJob(
      { clipId: "clip-1" },
      {
        fetchBackground,
        env: {
          FEED_REFRESH_BASE_URL: "https://mewmo.test",
          FEED_CRON_SECRET: "secret",
        },
      },
    );

    expect(fetchBackground).toHaveBeenCalledWith(
      "https://mewmo.test/api/clips/clip-1?background=1",
      {
        method: "POST",
        headers: { authorization: "Bearer secret" },
        signal: expect.any(AbortSignal),
      },
    );
    expect(result).toEqual({ status: "success" });
  });

  it("rejects failed background extraction so BullMQ retries", async () => {
    await expect(
      processClipFetchJob(
        { clipId: "clip-1" },
        {
          fetchBackground: async () => new Response("failed", { status: 502 }),
          env: { NEXTAUTH_URL: "http://localhost:3000" },
        },
      ),
    ).rejects.toThrow("Clip background fetch failed: 502");
  });
});
