import { describe, expect, it, vi } from "vitest";

import { createReranker } from "./index";
import type { RerankInput } from "./types";
import { PASSTHROUGH_PROVIDER } from "./passthrough";
import { VOYAGE_PROVIDER } from "./voyage";
import { JINA_PROVIDER } from "./jina";
import { loadRerankerConfig } from "./env";

const input: RerankInput = {
  query: "缓存能降低延迟",
  documents: ["本地缓存降低感知延迟", "无关的天气预报", "缓存命中率优化策略"],
  topN: 2,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("reranker", () => {
  it("uses passthrough (RRF order) when no provider is configured", async () => {
    const reranker = createReranker();
    const result = await reranker.rerank(input);
    expect(result.provider).toBe(PASSTHROUGH_PROVIDER);
    expect(result.fellBack).toBe(true);
    expect(result.results.map((item) => item.index)).toEqual([0, 1]);
  });

  it("falls back to passthrough when voyage lacks an API key", async () => {
    const reranker = createReranker({ provider: "voyage" });
    const result = await reranker.rerank(input);
    expect(result.provider).toBe(PASSTHROUGH_PROVIDER);
  });

  it("reorders candidates from a valid voyage response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ data: [{ index: 2, relevance_score: 0.9 }, { index: 0, relevance_score: 0.8 }] }),
    );
    const reranker = createReranker({ provider: "voyage", apiKey: "k", fetch: fetchMock as unknown as typeof fetch });
    const result = await reranker.rerank(input);
    expect(result.provider).toBe(VOYAGE_PROVIDER);
    expect(result.fellBack).toBe(false);
    expect(result.results.map((item) => item.index)).toEqual([2, 0]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("fails open to RRF order on a 429 response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "rate_limited" }, 429));
    const reranker = createReranker({ provider: "voyage", apiKey: "k", fetch: fetchMock as unknown as typeof fetch });
    const result = await reranker.rerank(input);
    expect(result.provider).toBe(PASSTHROUGH_PROVIDER);
    expect(result.fellBack).toBe(true);
    expect(result.results.map((item) => item.index)).toEqual([0, 1]);
  });

  it("fails open on a transport error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    const reranker = createReranker({ provider: "voyage", apiKey: "k", fetch: fetchMock as unknown as typeof fetch });
    const result = await reranker.rerank(input);
    expect(result.provider).toBe(PASSTHROUGH_PROVIDER);
    expect(result.fallbackReason).toContain("network down");
  });

  it("fails open on a malformed voyage response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ data: [{ index: 99, relevance_score: 1 }] }));
    const reranker = createReranker({ provider: "voyage", apiKey: "k", fetch: fetchMock as unknown as typeof fetch });
    const result = await reranker.rerank(input);
    expect(result.provider).toBe(PASSTHROUGH_PROVIDER);
  });

  it("reorders candidates from a valid jina response (results[] shape)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ results: [{ index: 2, relevance_score: 0.91 }, { index: 0, relevance_score: 0.7 }] }),
    );
    const reranker = createReranker({ provider: "jina", apiKey: "k", fetch: fetchMock as unknown as typeof fetch });
    const result = await reranker.rerank(input);
    expect(result.provider).toBe(JINA_PROVIDER);
    expect(result.fellBack).toBe(false);
    expect(result.results.map((item) => item.index)).toEqual([2, 0]);
  });

  it("falls back to passthrough when jina lacks an API key", async () => {
    const reranker = createReranker({ provider: "jina" });
    const result = await reranker.rerank(input);
    expect(result.provider).toBe(PASSTHROUGH_PROVIDER);
  });

  it("loadRerankerConfig lets jina reuse JINA_API_KEY", () => {
    const config = loadRerankerConfig({ AI_RERANK_PROVIDER: "jina", JINA_API_KEY: "jk" });
    expect(config.provider).toBe("jina");
    expect(config.apiKey).toBe("jk");
  });
});
