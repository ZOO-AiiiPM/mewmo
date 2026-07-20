import type {
  RecommendationWorkflowInput,
  RecommendationWorkflowResult,
} from "../contracts";

export async function runRecommendationWorkflow(
  input: RecommendationWorkflowInput,
): Promise<RecommendationWorkflowResult> {
  const limit = Math.max(1, Math.min(input.limit ?? 5, 20));
  const relations = input.candidates
    .filter((candidate) => candidate.targetId !== input.targetId)
    .filter((candidate) => Number.isFinite(candidate.similarity) && candidate.similarity > 0)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, limit)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  return { kind: "recommendation", relations };
}
