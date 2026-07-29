import { createAIRuntime, loadAIRuntimeConfig } from "@mewmo/ai";
import { createAiRunService, createAiUsageService } from "@mewmo/application";
import type { AiRuntimePort, AiWorkflowApplicationPort, ClaimedAiRun, WorkflowInput } from "./contracts";
import { createConfiguredWorkflowObservability } from "./observability/langfuse";
import type { AiWorkflowRuntimePorts } from "./runtime";
import { loadWorkflowPromptLink } from "./prompt-manifest";

export function createAiWorkflowRuntimePorts(): AiWorkflowRuntimePorts {
  const runtime = createAIRuntime(loadAIRuntimeConfig());
  const observability = createConfiguredWorkflowObservability();
  const runs = createAiRunService();
  const usage = createAiUsageService();
  const ai: AiRuntimePort = {
    async generateText(input) {
      const prompt = input.promptId ? await loadWorkflowPromptLink(input.promptId) : undefined;
      return observability.observeModelCall({ name: "workflow.generation.summary", purpose: input.purpose, type: "generation", input: { system: input.system, user: input.user }, ...(prompt ? { prompt } : {}) }, async () => {
        const result = await runtime.generateText({ purpose: input.purpose, system: input.system, messages: [{ role: "user", content: input.user }] });
        const value = { text: result.text, metadata: metadata(result) };
        return { value, metadata: value.metadata, output: result.text };
      });
    },
    async rerank(input) {
      return observability.observeModelCall({ name: "workflow.retriever.recommendation", purpose: input.purpose, type: "retriever", input: { query: input.query, documents: input.documents, topN: input.topN } }, async () => {
        const result = await runtime.rerank({ query: input.query, documents: input.documents, timeoutMs: input.timeoutMs, ...(input.topN === undefined ? {} : { topN: input.topN }) });
        return {
          value: { provider: result.provider, model: result.model, results: result.results, fellBack: result.fellBack, ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}) },
          metadata: { profile: input.purpose, provider: result.provider, model: result.model },
          output: result,
        };
      });
    },
    async generateObject<T>(input: { purpose: "workflow.note-insight"; schema: unknown; system: string; user: string; timeoutMs: number; promptId?: string }) {
      const schema = input.schema;
      if (!hasParser<T>(schema)) throw new Error("workflow structured schema must implement parse()");
      const prompt = input.promptId ? await loadWorkflowPromptLink(input.promptId) : undefined;
      return observability.observeModelCall({ name: "workflow.generation.note_insight", purpose: input.purpose, type: "generation", input: { system: input.system, user: input.user }, ...(prompt ? { prompt } : {}) }, async () => {
        const result = await runtime.generateObject<T>({ purpose: "workflow.note_insight", schema, system: input.system, messages: [{ role: "user", content: input.user }] });
        const attempts = result.attempts.map(metadata);
        const value = { value: result.object, metadata: metadata(result), attempts };
        return { value, metadata: aggregateModelMetadata(attempts, value.metadata), output: result.object };
      });
    },
    async embed(input) {
      return observability.observeModelCall({ name: "workflow.embedding", purpose: input.purpose, type: "embedding", input: input.values }, async () => {
        const result = await runtime.embed({ purpose: input.purpose, values: input.values });
        const model = metadata(result);
        return { value: result.embeddings.map((vector) => ({ vector, dimensions: vector.length, metadata: model })), metadata: model, output: result.embeddings };
      });
    },
  };
  const application: AiWorkflowApplicationPort = {
    async claimDue(input) {
      return (await runs.claimDue({ ...input, kinds: ["summary", "embedding", "relation", "note_insight"] })).map((run) => {
        if (run.kind === "agent_automation" || run.targetType === "automation") throw new Error("fixed Workflow claimed an Agent automation run");
        return {
          id: run.id,
          userId: run.userId,
          kind: run.kind === "relation" ? "recommendation" as const : run.kind,
          targetType: run.targetType,
          targetId: run.targetId,
          inputVersion: run.inputVersion,
          attempt: run.attempts,
        };
      });
    },
    recordUsage: (input) => usage.record(input),
    async getInput(run) {
      const foundationRun = foundationRunShape(run);
      const source = await runs.getInput(foundationRun as never);
      return source ? workflowInput(run, source as Record<string, unknown>) : null;
    },
    completeSummary: (input) => runs.completeSummary(input),
    completeEmbedding: (input) => runs.completeEmbedding(input),
    completeRelations: (input) => runs.completeRelations({ ...input, relations: input.relations.map((relation) => ({ targetType: relation.targetType, targetId: relation.targetId, score: relation.similarity, reason: `rank:${relation.rank}` })) }),
    completeNoteInsight: (input) => runs.completeNoteInsight({ ...input, insights: input.insight.map((item) => ({ kind: insightKind(item.type), content: item.message, data: { evidenceTargetIds: item.evidenceTargetIds } })) }),
    async supersede(input) { await runs.supersede(input); },
    async retryOrFail(input) { const run = await runs.retryOrFail(input); return run.status === "queued" ? "retrying" : "failed"; },
  };
  return { ai, application, observability };
}

function metadata(result: {
  purpose: string;
  provider: string;
  model: string;
  responseModel?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    reasoningTokens?: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    totalTokens: number;
    providerCostUsd?: number;
    pricingKnown: boolean;
    priceSnapshot?: unknown;
  };
}) {
  return {
    profile: result.purpose,
    provider: result.provider,
    model: result.model,
    ...(result.responseModel ? { responseModel: result.responseModel } : {}),
    ...(result.usage ? { usage: result.usage } : {}),
  };
}

function hasParser<T>(value: unknown): value is { parse(value: unknown): T } {
  return typeof value === "object" && value !== null && "parse" in value && typeof value.parse === "function";
}

function aggregateModelMetadata(attempts: ReturnType<typeof metadata>[], fallback: ReturnType<typeof metadata>) {
  if (attempts.length <= 1) return attempts[0] ?? fallback;
  const usage = attempts.map((attempt) => attempt.usage).filter((item) => item !== undefined);
  if (usage.length === 0) return fallback;
  return {
    ...fallback,
    usage: {
      inputTokens: usage.reduce((sum, item) => sum + item.inputTokens, 0),
      outputTokens: usage.reduce((sum, item) => sum + item.outputTokens, 0),
      reasoningTokens: usage.reduce((sum, item) => sum + (item.reasoningTokens ?? 0), 0),
      cacheReadTokens: usage.reduce((sum, item) => sum + item.cacheReadTokens, 0),
      cacheWriteTokens: usage.reduce((sum, item) => sum + item.cacheWriteTokens, 0),
      totalTokens: usage.reduce((sum, item) => sum + item.totalTokens, 0),
      providerCostUsd: usage.reduce((sum, item) => sum + (item.providerCostUsd ?? 0), 0),
      pricingKnown: usage.every((item) => item.pricingKnown),
    },
  };
}

function foundationRunShape(run: ClaimedAiRun) {
  return { ...run, kind: run.kind === "recommendation" ? "relation" : run.kind, attempts: run.attempt };
}

function workflowInput(run: ClaimedAiRun, source: Record<string, unknown>): WorkflowInput {
  const common = { kind: run.kind, targetType: run.targetType, targetId: run.targetId, inputVersion: run.inputVersion, currentVersion: number(source.version) };
  if (run.kind === "summary") return { ...common, kind: "summary", targetType: run.targetType as "clip" | "feed_entry", title: string(source.title), source: nullable(source.sourceName), url: nullable(source.url), content: string(source.content) };
  if (run.kind === "embedding") return { ...common, kind: "embedding", title: string(source.title), content: string(source.content), summary: nullable(source.summary) };
  if (run.kind === "recommendation") return { ...common, kind: "recommendation", sourceText: sourceText(source), candidates: array(source.candidates) as WorkflowInput & never } as WorkflowInput;
  return { ...common, kind: "note_insight", targetType: "note", title: string(source.title), content: string(source.content), related: array(source.related) as WorkflowInput & never } as WorkflowInput;
}

function insightKind(type: "completeness" | "duplicate" | "evolution") {
  if (type === "duplicate") return "duplicate_viewpoint" as const;
  if (type === "evolution") return "viewpoint_change" as const;
  return "completeness" as const;
}

function string(value: unknown) { return typeof value === "string" ? value : ""; }
function sourceText(source: Record<string, unknown>) { return [string(source.title), string(source.content)].filter((value) => value.length > 0).join("\n").slice(0, 2_000); }
function nullable(value: unknown) { return typeof value === "string" ? value : null; }
function number(value: unknown) { return typeof value === "number" ? value : 0; }
function array(value: unknown) { return Array.isArray(value) ? value : []; }
