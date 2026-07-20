import { createAIRuntime, loadAIRuntimeConfig } from "@mewmo/ai";
import { createAiRunService } from "@mewmo/application";
import type { AiRuntimePort, AiWorkflowApplicationPort, ClaimedAiRun, WorkflowInput } from "./contracts";
import type { AiWorkflowRuntimePorts } from "./runtime";

export function createAiWorkflowRuntimePorts(): AiWorkflowRuntimePorts {
  const runtime = createAIRuntime(loadAIRuntimeConfig());
  const runs = createAiRunService();
  const ai: AiRuntimePort = {
    async generateText(input) {
      const result = await runtime.generateText({ purpose: input.purpose, system: input.system, messages: [{ role: "user", content: input.user }] });
      return { text: result.text, metadata: metadata(result) };
    },
    async generateObject<T>(input: Parameters<AiRuntimePort["generateObject"]>[0]) {
      if (!hasParser<T>(input.schema)) throw new Error("workflow structured schema must implement parse()");
      const result = await runtime.generateObject({ purpose: "workflow.note_insight", schema: input.schema, system: input.system, messages: [{ role: "user", content: input.user }] });
      return { value: result.object, metadata: metadata(result) };
    },
    async embed(input) {
      const result = await runtime.embed({ purpose: input.purpose, values: input.values });
      return result.embeddings.map((vector) => ({ vector, dimensions: vector.length, metadata: metadata(result) }));
    },
  };
  const application: AiWorkflowApplicationPort = {
    async claimDue(input) {
      return (await runs.claimDue(input)).map((run) => ({
        id: run.id,
        userId: run.userId,
        kind: run.kind === "relation" ? "recommendation" : run.kind,
        targetType: run.targetType,
        targetId: run.targetId,
        inputVersion: run.inputVersion,
        attempt: run.attempts,
      }));
    },
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
  return { ai, application };
}

function metadata(result: { purpose: string; provider: string; model: string }) {
  return { profile: result.purpose, provider: result.provider, model: result.model };
}

function hasParser<T>(value: unknown): value is { parse(value: unknown): T } {
  return typeof value === "object" && value !== null && "parse" in value && typeof value.parse === "function";
}

function foundationRunShape(run: ClaimedAiRun) {
  return { ...run, kind: run.kind === "recommendation" ? "relation" : run.kind, attempts: run.attempt };
}

function workflowInput(run: ClaimedAiRun, source: Record<string, unknown>): WorkflowInput {
  const common = { kind: run.kind, targetType: run.targetType, targetId: run.targetId, inputVersion: run.inputVersion, currentVersion: number(source.version) };
  if (run.kind === "summary") return { ...common, kind: "summary", targetType: run.targetType as "clip" | "feed_entry", title: string(source.title), source: nullable(source.sourceName), url: nullable(source.url), content: string(source.content) };
  if (run.kind === "embedding") return { ...common, kind: "embedding", title: string(source.title), content: string(source.content), summary: nullable(source.summary) };
  if (run.kind === "recommendation") return { ...common, kind: "recommendation", candidates: array(source.candidates) as WorkflowInput & never } as WorkflowInput;
  return { ...common, kind: "note_insight", targetType: "note", title: string(source.title), content: string(source.content), related: array(source.related) as WorkflowInput & never } as WorkflowInput;
}

function insightKind(type: "completeness" | "duplicate" | "evolution") {
  if (type === "duplicate") return "duplicate_viewpoint" as const;
  if (type === "evolution") return "viewpoint_change" as const;
  return "completeness" as const;
}

function string(value: unknown) { return typeof value === "string" ? value : ""; }
function nullable(value: unknown) { return typeof value === "string" ? value : null; }
function number(value: unknown) { return typeof value === "number" ? value : 0; }
function array(value: unknown) { return Array.isArray(value) ? value : []; }
