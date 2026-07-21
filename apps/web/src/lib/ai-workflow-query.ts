import { createAIRuntime, loadAIRuntimeConfig } from "@mewmo/ai";
import { createAiRunService } from "@mewmo/application";

export interface AiWorkflowQueryService {
  getRun(input: { userId: string; runId: string }): Promise<unknown | null>;
  retryRun(input: { userId: string; runId: string }): Promise<{ id: string; status?: string }>;
  getRelated(input: { userId: string; targetType: "note" | "clip" | "feed_entry"; targetId: string }): Promise<unknown[]>;
  getNoteInsights(input: { userId: string; noteId: string }): Promise<unknown[] | null>;
  queryRelated(input: { userId: string; text: string; contentHash: string; limit: number }): Promise<{ items: unknown[]; embeddingModel?: string }>;
}

let servicePromise: Promise<AiWorkflowQueryService> | undefined;

export function getAiWorkflowQueryService() {
  servicePromise ??= createService();
  return servicePromise;
}

async function createService(): Promise<AiWorkflowQueryService> {
  const runs = createAiRunService();
  return {
    getRun: (input) => runs.getRun(input),
    retryRun: (input) => runs.retryRun(input),
    getRelated: (input) => runs.getRelated(input),
    getNoteInsights: (input) => runs.getNoteInsights(input),
    async queryRelated(input) {
      const ai = createAIRuntime(loadAIRuntimeConfig());
      const generated = await ai.embed({ purpose: "workflow.embedding", values: [input.text.slice(0, 24_000)] });
      const vector = generated.embeddings[0];
      if (!vector) return { items: [], embeddingModel: generated.model };
      return { items: await runs.queryRelated({ userId: input.userId, embedding: vector, limit: input.limit }), embeddingModel: generated.model };
    },
  };
}
