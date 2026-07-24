import type { Api, CredentialStore, Model, ModelCost, Models } from "@earendil-works/pi-ai";

import type { AIProvider, CompletionMessage } from "../providers/types";
import type { RerankInput, RerankResult, RerankerConfig } from "../rerank/types";

export type ModelPurpose =
  | "agent.chat"
  | "agent.deep_insight"
  | "workflow.summary"
  | "workflow.recommendation"
  | "workflow.embedding"
  | "workflow.note_insight"
  | "eval.judge";

export interface ProviderDefinition {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
  /**
   * Use Pi's built-in provider and its OAuth/API-key resolver. This is only
   * valid for the provider's first-party endpoint and catalogued models.
   */
  useBuiltinProvider?: boolean;
  /** Test-only transport injection retained for the existing runtime contract. */
  fetch?: typeof fetch;
}

export interface ModelDefinition {
  provider: string;
  model: string;
  contextWindow?: number;
  maxTokens?: number;
  reasoning?: boolean;
  /** Optional output dimensionality forwarded to the embedding endpoint. */
  dimensions?: number;
  /** Required for custom endpoints to report a known provider cost. */
  cost?: ModelCost;
}

export interface AIRuntimeConfig {
  providers: Record<string, ProviderDefinition>;
  models: Partial<Record<ModelPurpose, ModelDefinition>>;
  /** App-owned, user-scoped credential storage for Pi OAuth/BYOK flows. */
  credentials?: CredentialStore;
  /** ZOO-64: provider-neutral reranker config; absent/keyless => passthrough. */
  reranker?: RerankerConfig;
}

export type AIEnvironment = Record<string, string | undefined>;

export interface GenerateTextInput {
  purpose: Exclude<ModelPurpose, "workflow.embedding">;
  system?: string;
  messages: CompletionMessage[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
  signal?: AbortSignal;
}

export interface GenerateObjectInput<T> extends GenerateTextInput {
  schema: { parse(value: unknown): T };
  maxSchemaRetries?: number;
}

export interface EmbedInput {
  purpose: "workflow.embedding";
  values: string[];
}

export interface UsageMetadata {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens?: number;
  totalTokens: number;
  /** Undefined means this endpoint has no verified price catalog. */
  providerCostUsd?: number;
  pricingKnown: boolean;
  priceSnapshot?: ModelCost;
}

export interface TextGenerationResult {
  text: string;
  purpose: ModelPurpose;
  provider: string;
  model: string;
  responseModel?: string;
  usage: UsageMetadata;
}

export interface ObjectGenerationResult<T> extends Omit<TextGenerationResult, "text"> {
  object: T;
  /** One item for each provider request, including JSON repair retries. */
  attempts: TextGenerationResult[];
}

export interface EmbeddingResult {
  embeddings: number[][];
  purpose: "workflow.embedding";
  provider: AIProvider;
  model: string;
}

export interface AIRuntime {
  /** Pi types are intentionally exposed only to packages/ai and apps/agent/src/pi. */
  models(): Models;
  model(purpose: Exclude<ModelPurpose, "workflow.embedding">): Model<Api>;
  modelPricing(purpose: Exclude<ModelPurpose, "workflow.embedding">): { known: boolean; priceSnapshot?: ModelCost };
  generateText(input: GenerateTextInput): Promise<TextGenerationResult>;
  generateObject<T>(input: GenerateObjectInput<T>): Promise<ObjectGenerationResult<T>>;
  /** Legacy embedding port. A replacement backend is intentionally undecided. */
  embed(input: EmbedInput): Promise<EmbeddingResult>;
  /** ZOO-64: fail-open reranker over RRF candidate text. */
  rerank(input: RerankInput): Promise<RerankResult>;
}

export type FakeTextHandler = (input: GenerateTextInput) => string | Promise<string>;
export type FakeEmbeddingHandler = (input: EmbedInput) => number[][] | Promise<number[][]>;
export type FakeRerankHandler = (input: RerankInput) => RerankResult | Promise<RerankResult>;

export type { Reranker, RerankInput, RerankResult, RerankerConfig } from "../rerank/types";

export interface FakeAIRuntimeOptions {
  text?: string | FakeTextHandler;
  embeddings?: number[][] | FakeEmbeddingHandler;
  /** Deterministic rerank override; defaults to passthrough (RRF order). */
  rerank?: FakeRerankHandler;
  /** Responses consumed by Pi AgentHarness tests. */
  agentResponses?: string[];
}
