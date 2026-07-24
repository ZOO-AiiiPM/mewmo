import type { Reranker, RerankInput, RerankResult, RerankResultItem, RerankerConfig } from "./types";

export const JINA_PROVIDER = "jina";
const DEFAULT_MODEL = "jina-reranker-v3";
const DEFAULT_BASE_URL = "https://api.jina.ai/v1";
const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Jina rerank adapter (jina-reranker-v3 by default). Throws on any transport,
 * status, or shape error; the composed reranker in index.ts turns those into a
 * fail-open passthrough result. Never call this directly from a workflow.
 */
export function createJinaReranker(config: RerankerConfig): Reranker {
  const apiKey = config.apiKey?.trim();
  if (!apiKey) throw new Error("jina reranker requires AI_RERANK_API_KEY (or JINA_API_KEY)");
  const model = config.model?.trim() || DEFAULT_MODEL;
  const baseUrl = stripSlash(config.baseUrl?.trim() || DEFAULT_BASE_URL);
  const defaultTimeout = config.timeoutMs && config.timeoutMs > 0 ? config.timeoutMs : DEFAULT_TIMEOUT_MS;
  const maxCandidates = config.maxCandidates && config.maxCandidates > 0 ? config.maxCandidates : undefined;
  const transport = config.fetch ?? fetch;

  return {
    async rerank(input: RerankInput): Promise<RerankResult> {
      const documents = maxCandidates ? input.documents.slice(0, maxCandidates) : input.documents;
      const topN = input.topN && input.topN > 0 ? Math.min(input.topN, documents.length) : documents.length;
      const controller = new AbortController();
      const timeoutMs = input.timeoutMs && input.timeoutMs > 0 ? input.timeoutMs : defaultTimeout;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const onAbort = () => controller.abort();
      input.signal?.addEventListener("abort", onAbort, { once: true });

      let response: Response;
      try {
        response = await transport(`${baseUrl}/rerank`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: input.query, documents, model, top_n: topN, return_documents: false }),
          signal: controller.signal,
        });
      } catch (error) {
        throw new Error(`jina rerank request failed: ${error instanceof Error ? error.message : "transport error"}`, { cause: error });
      } finally {
        clearTimeout(timer);
        input.signal?.removeEventListener("abort", onAbort);
      }

      if (!response.ok) throw new Error(`jina rerank request failed with status ${response.status}`);
      const data: unknown = await response.json().catch(() => undefined);
      const results = parseResults(data, documents.length);
      if (!results.length) throw new Error("jina rerank response did not include usable results");
      return { provider: JINA_PROVIDER, model, results, fellBack: false };
    },
  };
}

function parseResults(data: unknown, documentCount: number): RerankResultItem[] {
  if (!isRecord(data) || !Array.isArray(data.results)) throw new Error("jina rerank response was not an object with results[]");
  const items = data.results
    .map((item) => {
      if (!isRecord(item) || typeof item.index !== "number" || typeof item.relevance_score !== "number") return null;
      if (!Number.isInteger(item.index) || item.index < 0 || item.index >= documentCount) return null;
      if (!Number.isFinite(item.relevance_score)) return null;
      return { index: item.index, score: item.relevance_score } satisfies RerankResultItem;
    })
    .filter((item): item is RerankResultItem => item !== null)
    .sort((left, right) => right.score - left.score);
  return dedupeByIndex(items);
}

function dedupeByIndex(items: RerankResultItem[]): RerankResultItem[] {
  const seen = new Set<number>();
  const unique: RerankResultItem[] = [];
  for (const item of items) {
    if (seen.has(item.index)) continue;
    seen.add(item.index);
    unique.push(item);
  }
  return unique;
}

function stripSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
