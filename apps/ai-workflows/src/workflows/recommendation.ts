import type {
  RecommendationCandidate,
  RecommendationWorkflowInput,
  RecommendationWorkflowResult,
  WorkflowHandlerContext,
} from "../contracts";

const FINAL_TOP_K = 5;
const RERANK_TIMEOUT_MS = 5_000;

export async function runRecommendationWorkflow(
  input: RecommendationWorkflowInput,
  context: WorkflowHandlerContext,
): Promise<RecommendationWorkflowResult> {
  const limit = Math.max(1, Math.min(input.limit ?? FINAL_TOP_K, 20));
  // RRF 顺序是 fail-open 基线：候选到达时已按 rrfScore 降序排列。
  const pool = input.candidates
    .filter((candidate) => candidate.targetId !== input.targetId)
    .filter((candidate) => Number.isFinite(candidate.similarity));
  if (pool.length === 0) return { kind: "recommendation", relations: [] };

  const ordered = await rerankPool(input, context, pool, limit);
  const relations = ordered.slice(0, limit).map((candidate, index) => ({
    targetType: candidate.targetType,
    targetId: candidate.targetId,
    targetVersion: candidate.targetVersion,
    similarity: candidate.similarity,
    rank: index + 1,
  }));
  return { kind: "recommendation", relations };
}

async function rerankPool(
  input: RecommendationWorkflowInput,
  context: WorkflowHandlerContext,
  pool: RecommendationCandidate[],
  limit: number,
): Promise<RecommendationCandidate[]> {
  const query = input.sourceText.trim();
  const documents = pool.map((candidate) => candidate.text ?? "");
  if (!query || documents.every((doc) => doc.length === 0)) {
    console.info(
      `[recommendation] rerank skipped target=${input.targetId} reason=empty_query_or_documents candidates=${pool.length}`,
    );
    return pool;
  }
  const startedAt = Date.now();
  try {
    const outcome = await context.ai.rerank({
      purpose: "workflow.recommendation",
      query,
      documents,
      topN: limit,
      timeoutMs: RERANK_TIMEOUT_MS,
    });
    const reordered = applyRerank(pool, outcome.results);
    console.info(
      `[recommendation] rerank target=${input.targetId} provider=${outcome.provider} model=${outcome.model} candidates=${pool.length} reranked=${reordered.length} fellBack=${outcome.fellBack}${outcome.fallbackReason ? ` reason=${outcome.fallbackReason}` : ""} durationMs=${Date.now() - startedAt}`,
    );
    return reordered.length ? reordered : pool;
  } catch (error) {
    // fail-open：rerank 抛错/超时/非法响应一律回退到 RRF 顺序，绝不阻塞内容入库。
    const reason = error instanceof Error ? error.message : "rerank_error";
    console.warn(
      `[recommendation] rerank failed target=${input.targetId} reason=${reason} durationMs=${Date.now() - startedAt}; falling back to RRF order`,
    );
    return pool;
  }
}

function applyRerank(
  pool: RecommendationCandidate[],
  results: { index: number; score: number }[],
): RecommendationCandidate[] {
  if (!results.length) return pool;
  const seen = new Set<number>();
  const reordered: RecommendationCandidate[] = [];
  for (const item of results) {
    const candidate = pool[item.index];
    if (!candidate || seen.has(item.index)) continue;
    seen.add(item.index);
    reordered.push(candidate);
  }
  // rerank 未覆盖的候选按原 RRF 顺序补齐，保证不丢候选。
  pool.forEach((candidate, index) => {
    if (!seen.has(index)) reordered.push(candidate);
  });
  return reordered;
}
