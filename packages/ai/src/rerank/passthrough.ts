import type { Reranker, RerankInput, RerankResult } from "./types";

export const PASSTHROUGH_PROVIDER = "passthrough";

/**
 * Preserves the incoming (RRF) order and assigns strictly descending synthetic
 * scores so downstream consumers keep the caller's ranking. Used when no
 * provider is configured and as the fail-open target for real providers.
 */
export function createPassthroughReranker(): Reranker {
  return {
    async rerank(input: RerankInput): Promise<RerankResult> {
      return passthroughResult(input, { reason: "passthrough_provider" });
    },
  };
}

export function passthroughResult(
  input: RerankInput,
  options: { model?: string; reason: string },
): RerankResult {
  const topN = clampTopN(input.topN, input.documents.length);
  const results = input.documents
    .slice(0, topN)
    .map((_document, index) => ({ index, score: syntheticScore(index, input.documents.length) }));
  return {
    provider: PASSTHROUGH_PROVIDER,
    model: options.model ?? PASSTHROUGH_PROVIDER,
    results,
    fellBack: true,
    fallbackReason: options.reason,
  };
}

function clampTopN(topN: number | undefined, length: number) {
  if (topN === undefined || topN <= 0) return length;
  return Math.min(topN, length);
}

function syntheticScore(index: number, length: number) {
  if (length <= 1) return 1;
  return (length - index) / length;
}
