import { describe, expect, it, vi } from "vitest";

import { submitFeedAddRequest } from "./feed-add-request";

describe("submitFeedAddRequest", () => {
  it("returns the parsed feed when the request succeeds", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "feed-1" }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(submitFeedAddRequest({ url: "https://example.com/feed" }, { fetchImpl }))
      .resolves.toEqual({ id: "feed-1" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/feeds",
      expect.objectContaining({ method: "POST", signal: expect.any(AbortSignal) }),
    );
  });

  it("rejects a request that exceeds its browser-side time limit", async () => {
    const fetchImpl = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    }));

    await expect(submitFeedAddRequest({ url: "https://example.com/feed" }, { fetchImpl, timeoutMs: 5 }))
      .rejects.toBeDefined();
  });

  it("rejects non-success API responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 502 }));
    await expect(submitFeedAddRequest({}, { fetchImpl })).rejects.toThrow("Feed add request failed");
  });
});
