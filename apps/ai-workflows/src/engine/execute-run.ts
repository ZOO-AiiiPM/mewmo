import type {
  AiWorkflowApplicationPort,
  ClaimedAiRun,
  WorkflowHandler,
  WorkflowHandlerContext,
  WorkflowInput,
} from "../contracts";
import { runEmbeddingWorkflow } from "../workflows/embedding";
import { runNoteInsightWorkflow } from "../workflows/note-insight";
import { runRecommendationWorkflow } from "../workflows/recommendation";
import { runSummaryWorkflow } from "../workflows/summary";

const handlers: Record<ClaimedAiRun["kind"], WorkflowHandler> = {
  summary: (input, context) => runSummaryWorkflow(expectKind(input, "summary"), context),
  embedding: (input, context) => runEmbeddingWorkflow(expectKind(input, "embedding"), context),
  recommendation: (input) => runRecommendationWorkflow(expectKind(input, "recommendation")),
  note_insight: (input, context) => runNoteInsightWorkflow(expectKind(input, "note_insight"), context),
};

export async function executeClaimedRun(input: {
  run: ClaimedAiRun;
  application: AiWorkflowApplicationPort;
  context: WorkflowHandlerContext;
  workerId: string;
  timeoutMs: number;
  now: () => Date;
}): Promise<"succeeded" | "retrying" | "failed" | "superseded"> {
  const { run, application, context } = input;
  try {
    const workflowInput = await application.getInput(run);
    if (!workflowInput) {
      await application.supersede({ runId: run.id, workerId: input.workerId, reason: "target_missing" });
      return "superseded";
    }
    if (workflowInput.currentVersion !== run.inputVersion || workflowInput.inputVersion !== run.inputVersion) {
      await application.supersede({ runId: run.id, workerId: input.workerId, reason: "version_changed" });
      return "superseded";
    }
    if (workflowInput.kind !== run.kind || workflowInput.targetType !== run.targetType || workflowInput.targetId !== run.targetId) {
      throw new Error("workflow_input_mismatch");
    }
    const result = await withTimeout(handlers[run.kind](workflowInput, context), input.timeoutMs);
    await recordModelCalls(application, run, result);
    await completeWorkflowResult(application, run, input.workerId, result);
    return "succeeded";
  } catch (error) {
    const normalized = normalizeWorkflowError(error);
    return application.retryOrFail({
      runId: run.id,
      workerId: input.workerId,
      error: { code: normalized.errorCode, message: normalized.errorMessage },
      now: input.now(),
      maxAttempts: 3,
    });
  }
}

async function recordModelCalls(
  application: AiWorkflowApplicationPort,
  run: ClaimedAiRun,
  result: Awaited<ReturnType<WorkflowHandler>>,
) {
  if (!("modelCalls" in result)) return;
  for (const [index, model] of result.modelCalls.entries()) {
    const usage = model.usage;
    await application.recordUsage({
      userId: run.userId,
      runId: run.id,
      purpose: model.profile,
      operation: `workflow.${run.kind}`,
      provider: model.provider ?? "unknown",
      requestedModel: model.model ?? model.profile,
      ...(model.responseModel ? { responseModel: model.responseModel } : {}),
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      ...(usage?.reasoningTokens === undefined ? {} : { reasoningTokens: usage.reasoningTokens }),
      cacheReadTokens: usage?.cacheReadTokens ?? 0,
      cacheWriteTokens: usage?.cacheWriteTokens ?? 0,
      ...(usage?.providerCostUsd === undefined ? {} : { providerCostUsd: usage.providerCostUsd }),
      ...(usage?.priceSnapshot === undefined ? {} : { priceSnapshot: usage.priceSnapshot }),
      idempotencyKey: `workflow:${run.id}:attempt:${run.attempt}:call:${index}`,
    });
  }
}

async function completeWorkflowResult(
  application: AiWorkflowApplicationPort,
  run: ClaimedAiRun,
  workerId: string,
  result: Awaited<ReturnType<WorkflowHandler>>,
) {
  if (result.kind === "summary") {
    await application.completeSummary({
      runId: run.id,
      workerId,
      expectedVersion: run.inputVersion,
      summary: result.summary,
    });
    return;
  }
  if (result.kind === "embedding") {
    await application.completeEmbedding({
      runId: run.id,
      workerId,
      expectedVersion: run.inputVersion,
      embedding: result.vector,
      dimensions: result.dimensions,
      model: result.model.model ?? result.model.profile,
    });
    return;
  }
  if (result.kind === "recommendation") {
    await application.completeRelations({
      runId: run.id,
      workerId,
      expectedVersion: run.inputVersion,
      relations: result.relations,
    });
    return;
  }
  await application.completeNoteInsight({
    runId: run.id,
    workerId,
    expectedVersion: run.inputVersion,
    insight: result.insights,
  });
}

export function normalizeWorkflowError(error: unknown) {
  if (error instanceof Error) {
    const code = error.name === "TimeoutError" ? "workflow_timeout" : sanitizeErrorCode(error.message);
    return { errorCode: code, errorMessage: error.message.slice(0, 2_000) };
  }
  return { errorCode: "workflow_unknown_error", errorMessage: "Unknown workflow error" };
}

function sanitizeErrorCode(message: string) {
  const value = message.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return value.slice(0, 80) || "workflow_error";
}

function expectKind<K extends WorkflowInput["kind"]>(input: WorkflowInput, kind: K): Extract<WorkflowInput, { kind: K }> {
  if (input.kind !== kind) throw new Error("workflow_handler_kind_mismatch");
  return input as Extract<WorkflowInput, { kind: K }>;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      const error = new Error(`Workflow timed out after ${timeoutMs}ms`);
      error.name = "TimeoutError";
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, expired]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
