import type { AIEnvironment } from "../runtime/types";
import type { RerankerConfig } from "./types";

/**
 * Reads AI_RERANK_* config from the environment. Absence of AI_RERANK_API_KEY
 * (or a non-voyage provider) yields the passthrough reranker downstream.
 */
export function loadRerankerConfig(input: AIEnvironment = process.env): RerankerConfig {
  const config: RerankerConfig = {};
  const provider = nonEmpty(input.AI_RERANK_PROVIDER);
  const model = nonEmpty(input.AI_RERANK_MODEL);
  // provider=jina 时允许沿用共享的 JINA_API_KEY（与 ZOO-65 Jina 工具同一密钥）。
  const apiKey =
    nonEmpty(input.AI_RERANK_API_KEY) ??
    (provider?.toLowerCase() === "jina" ? nonEmpty(input.JINA_API_KEY) : undefined);
  const baseUrl = nonEmpty(input.AI_RERANK_BASE_URL);
  const timeoutMs = positiveInt(input.AI_RERANK_TIMEOUT_MS);
  const maxCandidates = positiveInt(input.AI_RERANK_MAX_CANDIDATES);
  if (provider) config.provider = provider;
  if (model) config.model = model;
  if (apiKey) config.apiKey = apiKey;
  if (baseUrl) config.baseUrl = baseUrl;
  if (timeoutMs) config.timeoutMs = timeoutMs;
  if (maxCandidates) config.maxCandidates = maxCandidates;
  return config;
}

function nonEmpty(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function positiveInt(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
