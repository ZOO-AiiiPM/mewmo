import { createPassthroughReranker, passthroughResult, PASSTHROUGH_PROVIDER } from "./passthrough";
import type { Reranker, RerankInput, RerankResult, RerankerConfig } from "./types";
import { createVoyageReranker, VOYAGE_PROVIDER } from "./voyage";
import { createJinaReranker, JINA_PROVIDER } from "./jina";

/**
 * Builds a fail-open reranker from config. A real provider (Voyage or Jina) is
 * used only when a matching provider and API key are present; otherwise the
 * passthrough reranker preserves RRF order. Any provider error is caught and
 * downgraded to passthrough so recommendation never fails on rerank.
 */
export function createReranker(config: RerankerConfig = {}): Reranker {
  const provider = config.provider?.trim().toLowerCase();
  const delegate = resolveDelegate(provider, config);
  if (!delegate) return createPassthroughReranker();

  return {
    async rerank(input: RerankInput): Promise<RerankResult> {
      try {
        return await delegate.rerank(input);
      } catch (error) {
        const reason = error instanceof Error ? error.message : "rerank_provider_error";
        console.warn(`[rerank] provider "${provider}" failed, falling back to RRF order: ${reason}`);
        return passthroughResult(input, { reason });
      }
    },
  };
}

function resolveDelegate(provider: string | undefined, config: RerankerConfig): Reranker | undefined {
  if (!provider || provider === PASSTHROUGH_PROVIDER) return undefined;
  if (provider === VOYAGE_PROVIDER) {
    if (!config.apiKey?.trim()) {
      console.warn(`[rerank] provider "voyage" configured without AI_RERANK_API_KEY, using passthrough`);
      return undefined;
    }
    return createVoyageReranker(config);
  }
  if (provider === JINA_PROVIDER) {
    if (!config.apiKey?.trim()) {
      console.warn(`[rerank] provider "jina" configured without AI_RERANK_API_KEY/JINA_API_KEY, using passthrough`);
      return undefined;
    }
    return createJinaReranker(config);
  }
  console.warn(`[rerank] unknown provider "${provider}", using passthrough`);
  return undefined;
}

export { createPassthroughReranker, PASSTHROUGH_PROVIDER } from "./passthrough";
export { createVoyageReranker, VOYAGE_PROVIDER } from "./voyage";
export { createJinaReranker, JINA_PROVIDER } from "./jina";
export { loadRerankerConfig } from "./env";
export type { Reranker, RerankInput, RerankResult, RerankResultItem, RerankerConfig } from "./types";
