export interface AiWorkflowQueryService {
  getRun(input: { userId: string; runId: string }): Promise<unknown | null>;
  retryRun(input: { userId: string; runId: string }): Promise<{ id: string; status?: string }>;
  getRelated(input: {
    userId: string;
    targetType: "note" | "clip" | "feed_entry";
    targetId: string;
  }): Promise<unknown[]>;
  queryRelated(input: {
    userId: string;
    text: string;
    contentHash: string;
    limit: number;
  }): Promise<{ items: unknown[]; embeddingModel?: string }>;
}

interface AdapterModule {
  createWebAiWorkflowQueryService(): Promise<AiWorkflowQueryService> | AiWorkflowQueryService;
}

let servicePromise: Promise<AiWorkflowQueryService> | undefined;

export function getAiWorkflowQueryService() {
  servicePromise ??= loadService();
  return servicePromise;
}

async function loadService() {
  const moduleName = process.env.APPLICATION_ADAPTER_MODULE?.trim();
  if (!moduleName) throw new Error("APPLICATION_ADAPTER_MODULE is required for AI workflow queries");
  const adapter = await import(/* webpackIgnore: true */ moduleName) as Partial<AdapterModule>;
  if (typeof adapter.createWebAiWorkflowQueryService !== "function") {
    throw new Error("Application adapter must export createWebAiWorkflowQueryService()");
  }
  return adapter.createWebAiWorkflowQueryService();
}
