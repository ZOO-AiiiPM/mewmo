export type WorkflowKind = "summary" | "embedding" | "recommendation" | "note_insight";
export type WorkflowTargetType = "note" | "clip" | "feed_entry";

export interface ClaimedAiRun {
  id: string;
  userId: string;
  kind: WorkflowKind;
  targetType: WorkflowTargetType;
  targetId: string;
  inputVersion: number;
  attempt: number;
}

interface VersionedWorkflowInput {
  kind: WorkflowKind;
  targetType: WorkflowTargetType;
  targetId: string;
  inputVersion: number;
  currentVersion: number;
}

export interface SummaryWorkflowInput extends VersionedWorkflowInput {
  kind: "summary";
  targetType: "clip" | "feed_entry";
  title: string;
  source: string | null;
  url: string | null;
  content: string;
}

export interface EmbeddingWorkflowInput extends VersionedWorkflowInput {
  kind: "embedding";
  title: string;
  content: string;
  summary: string | null;
}

export interface RecommendationCandidate {
  targetType: WorkflowTargetType;
  targetId: string;
  targetVersion: number;
  similarity: number;
}

export interface RecommendationWorkflowInput extends VersionedWorkflowInput {
  kind: "recommendation";
  candidates: RecommendationCandidate[];
  limit?: number;
}

export interface NoteInsightEvidence {
  targetType: WorkflowTargetType;
  targetId: string;
  title: string;
  excerpt: string;
}

export interface NoteInsightWorkflowInput extends VersionedWorkflowInput {
  kind: "note_insight";
  targetType: "note";
  title: string;
  content: string;
  related: NoteInsightEvidence[];
}

export type WorkflowInput =
  | SummaryWorkflowInput
  | EmbeddingWorkflowInput
  | RecommendationWorkflowInput
  | NoteInsightWorkflowInput;

export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  providerCostUsd?: number;
  pricingKnown: boolean;
  priceSnapshot?: unknown;
}

export interface ModelMetadata {
  profile: string;
  provider?: string;
  model?: string;
  responseModel?: string;
  traceId?: string;
  usage?: ModelUsage;
}

export interface TextGenerationResult {
  text: string;
  metadata: ModelMetadata;
}

export interface StructuredGenerationResult<T> {
  value: T;
  metadata: ModelMetadata;
  attempts: ModelMetadata[];
}

export interface EmbeddingResult {
  vector: number[];
  dimensions: number;
  metadata: ModelMetadata;
}

export interface AiRuntimePort {
  generateText(input: {
    purpose: "workflow.summary";
    system: string;
    user: string;
    timeoutMs: number;
  }): Promise<TextGenerationResult>;
  generateObject<T>(input: {
    purpose: "workflow.note-insight";
    schema: unknown;
    system: string;
    user: string;
    timeoutMs: number;
  }): Promise<StructuredGenerationResult<T>>;
  embed(input: {
    purpose: "workflow.embedding";
    values: string[];
    timeoutMs: number;
  }): Promise<EmbeddingResult[]>;
}

export interface SummaryWorkflowResult {
  kind: "summary";
  summary: string;
  prompt: PromptMetadata;
  model: ModelMetadata;
  modelCalls: ModelMetadata[];
}

export interface EmbeddingWorkflowResult {
  kind: "embedding";
  vector: number[];
  dimensions: number;
  contentHash: string;
  model: ModelMetadata;
  modelCalls: ModelMetadata[];
}

export interface RecommendationRelation {
  targetType: WorkflowTargetType;
  targetId: string;
  targetVersion: number;
  similarity: number;
  rank: number;
}

export interface RecommendationWorkflowResult {
  kind: "recommendation";
  relations: RecommendationRelation[];
}

export interface NoteInsightItem {
  type: "completeness" | "duplicate" | "evolution";
  message: string;
  evidenceTargetIds: string[];
}

export interface NoteInsightWorkflowResult {
  kind: "note_insight";
  insights: NoteInsightItem[];
  prompt: PromptMetadata;
  model: ModelMetadata;
  modelCalls: ModelMetadata[];
}

export type WorkflowResult =
  | SummaryWorkflowResult
  | EmbeddingWorkflowResult
  | RecommendationWorkflowResult
  | NoteInsightWorkflowResult;

export interface PromptMetadata {
  id: string;
  version: number;
  task: string;
  revision: string;
}

export interface AiWorkflowApplicationPort {
  claimDue(input: {
    workerId: string;
    limit: number;
    leaseMs: number;
    now: Date;
  }): Promise<ClaimedAiRun[]>;
  recordUsage(input: {
    userId: string;
    runId: string;
    purpose: string;
    operation: string;
    provider: string;
    requestedModel: string;
    responseModel?: string;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens?: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    providerCostUsd?: number;
    priceSnapshot?: unknown;
    idempotencyKey: string;
  }): Promise<unknown>;
  getInput(run: ClaimedAiRun): Promise<WorkflowInput | null>;
  completeSummary(input: {
    runId: string;
    workerId: string;
    expectedVersion: number;
    summary: string;
  }): Promise<unknown>;
  completeEmbedding(input: {
    runId: string;
    workerId: string;
    expectedVersion: number;
    embedding: number[];
    dimensions: number;
    model: string;
  }): Promise<unknown>;
  completeRelations(input: {
    runId: string;
    workerId: string;
    expectedVersion: number;
    relations: RecommendationRelation[];
  }): Promise<unknown>;
  completeNoteInsight(input: {
    runId: string;
    workerId: string;
    expectedVersion: number;
    insight: NoteInsightItem[];
  }): Promise<unknown>;
  supersede(input: {
    runId: string;
    workerId?: string;
    reason: "target_missing" | "version_changed";
  }): Promise<void>;
  retryOrFail(input: {
    runId: string;
    workerId: string;
    error: { code: string; message: string };
    now: Date;
    maxAttempts?: number;
  }): Promise<"retrying" | "failed">;
}

export interface WorkflowHandlerContext {
  ai: AiRuntimePort;
  loadPrompt(name: "article-summary.zh" | "note-insight.zh"): Promise<LoadedPrompt>;
}

export interface LoadedPrompt {
  metadata: PromptMetadata;
  content: string;
}

export type WorkflowHandler = (
  input: WorkflowInput,
  context: WorkflowHandlerContext,
) => Promise<WorkflowResult>;
