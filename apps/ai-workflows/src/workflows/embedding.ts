import { createHash } from "node:crypto";

import type {
  EmbeddingWorkflowInput,
  EmbeddingWorkflowResult,
  WorkflowHandlerContext,
} from "../contracts";

export async function runEmbeddingWorkflow(
  input: EmbeddingWorkflowInput,
  context: WorkflowHandlerContext,
): Promise<EmbeddingWorkflowResult> {
  const text = buildEmbeddingText(input);
  const [embedded] = await context.ai.embed({
    purpose: "workflow.embedding",
    values: [text],
    timeoutMs: 30_000,
  });
  if (!embedded) throw new Error("embedding_missing_result");
  if (embedded.vector.length === 0 || embedded.vector.some((value) => !Number.isFinite(value))) {
    throw new Error("embedding_invalid_vector");
  }
  if (embedded.dimensions !== embedded.vector.length) throw new Error("embedding_dimension_mismatch");
  return {
    kind: "embedding",
    vector: embedded.vector,
    dimensions: embedded.dimensions,
    contentHash: createHash("sha256").update(text).digest("hex"),
    model: embedded.metadata,
    modelCalls: [embedded.metadata],
  };
}

export function buildEmbeddingText(input: EmbeddingWorkflowInput) {
  return [input.title.trim(), input.summary?.trim(), input.content.trim()]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 24_000);
}
