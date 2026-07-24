/**
 * ZOO-64: provider-neutral reranker port.
 *
 * A reranker takes a source query and an ordered list of candidate documents
 * (already ranked by RRF) and returns a re-scored ordering. Implementations
 * MUST be fail-open: any provider error surfaces as a passthrough result that
 * preserves the incoming order so content ingestion is never blocked.
 */
export interface RerankInput {
  /** Source content text (title + excerpt). */
  query: string;
  /** Candidate texts, ordered by the caller's prior ranking (e.g. RRF). */
  documents: string[];
  /** Optional cap on returned items; defaults to documents.length. */
  topN?: number;
  /** Per-call timeout override (ms). */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface RerankResultItem {
  /** Index into the original `documents` array. */
  index: number;
  /** Provider relevance score (higher is more relevant). */
  score: number;
}

export interface RerankResult {
  provider: string;
  model: string;
  /** Best-first ordering; each item references an original document index. */
  results: RerankResultItem[];
  /** True when the passthrough/fail-open path produced this result. */
  fellBack: boolean;
  /** Populated when fellBack is true for observability. */
  fallbackReason?: string;
}

export interface Reranker {
  rerank(input: RerankInput): Promise<RerankResult>;
}

export interface RerankerConfig {
  /** "voyage" or "passthrough" (default). Unknown providers fall back to passthrough. */
  provider?: string;
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Maximum candidates forwarded to the provider; extra candidates keep RRF order. */
  maxCandidates?: number;
  /** Test-only transport injection. */
  fetch?: typeof fetch;
}
