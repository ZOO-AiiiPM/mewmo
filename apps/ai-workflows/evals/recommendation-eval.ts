import { readFile } from "node:fs/promises";

// ZOO-64 离线检索评测：以固定标注样本对比 dense-only / lexical-only / RRF / RRF+rerank，
// 记录 Recall@K、MRR、nDCG。纯函数、可重复运行，不依赖数据库或真实模型。

// 与 packages/application 的 relationCandidates 保持一致的 RRF 常量。
export const RRF_K = 60;

export interface EvalCandidate {
  id: string;
  type: "note" | "clip" | "feed_entry";
  denseRank: number | null;
  lexicalRank: number | null;
  semanticScore: number;
  relevant: boolean;
}

export interface EvalCase {
  id: string;
  category: string;
  note?: string;
  source: string;
  candidates: EvalCandidate[];
}

export type StrategyName = "dense-only" | "lexical-only" | "rrf" | "rrf-rerank";

export interface StrategyMetrics {
  recallAtK: number;
  mrr: number;
  ndcgAtK: number;
}

export async function loadRecommendationCases(): Promise<EvalCase[]> {
  const raw = await readFile(new URL("./datasets/recommendation-cases.json", import.meta.url), "utf8");
  return JSON.parse(raw) as EvalCase[];
}

function byRank(candidates: EvalCandidate[], route: "denseRank" | "lexicalRank"): string[] {
  return candidates
    .filter((candidate) => candidate[route] !== null)
    .sort((left, right) => (left[route] as number) - (right[route] as number))
    .map((candidate) => candidate.id);
}

// RRF 融合，等价于生产实现：score = Σ 1/(k + rank)。
export function rrfFuse(candidates: EvalCandidate[]): string[] {
  const scored = candidates.map((candidate) => {
    let score = 0;
    if (candidate.denseRank !== null) score += 1 / (RRF_K + candidate.denseRank);
    if (candidate.lexicalRank !== null) score += 1 / (RRF_K + candidate.lexicalRank);
    return { id: candidate.id, score };
  });
  return scored
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.id);
}

// 模拟 reranker：对 RRF 候选池按语义分重排（生产中由 RerankerPort 提供）。
export function rerankBySemanticScore(candidates: EvalCandidate[], pool: string[]): string[] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  return [...pool].sort((left, right) => (byId.get(right)?.semanticScore ?? 0) - (byId.get(left)?.semanticScore ?? 0));
}

export function rankCandidates(candidates: EvalCandidate[], strategy: StrategyName): string[] {
  if (strategy === "dense-only") return byRank(candidates, "denseRank");
  if (strategy === "lexical-only") return byRank(candidates, "lexicalRank");
  const fused = rrfFuse(candidates);
  return strategy === "rrf" ? fused : rerankBySemanticScore(candidates, fused);
}

export function recallAtK(ranked: string[], relevant: Set<string>, k: number): number {
  if (relevant.size === 0) return 0;
  const hits = ranked.slice(0, k).filter((id) => relevant.has(id)).length;
  return hits / relevant.size;
}

export function mrr(ranked: string[], relevant: Set<string>): number {
  const index = ranked.findIndex((id) => relevant.has(id));
  return index === -1 ? 0 : 1 / (index + 1);
}

export function ndcgAtK(ranked: string[], relevant: Set<string>, k: number): number {
  if (relevant.size === 0) return 0;
  const dcg = ranked.slice(0, k).reduce((sum, id, index) => (relevant.has(id) ? sum + 1 / Math.log2(index + 2) : sum), 0);
  const idealHits = Math.min(relevant.size, k);
  let idcg = 0;
  for (let index = 0; index < idealHits; index += 1) idcg += 1 / Math.log2(index + 2);
  return idcg === 0 ? 0 : dcg / idcg;
}

export function scoreCase(evalCase: EvalCase, strategy: StrategyName, k: number): StrategyMetrics {
  const relevant = new Set(evalCase.candidates.filter((candidate) => candidate.relevant).map((candidate) => candidate.id));
  const ranked = rankCandidates(evalCase.candidates, strategy);
  return { recallAtK: recallAtK(ranked, relevant, k), mrr: mrr(ranked, relevant), ndcgAtK: ndcgAtK(ranked, relevant, k) };
}

// 聚合各策略在全体样本上的平均指标，仅统计存在相关项的样本（no-relevant 样本用于健壮性校验）。
export function evaluateStrategies(cases: EvalCase[], k = 5): Record<StrategyName, StrategyMetrics> {
  const strategies: StrategyName[] = ["dense-only", "lexical-only", "rrf", "rrf-rerank"];
  const scored = cases.filter((evalCase) => evalCase.candidates.some((candidate) => candidate.relevant));
  const result = {} as Record<StrategyName, StrategyMetrics>;
  for (const strategy of strategies) {
    const totals = scored.reduce(
      (acc, evalCase) => {
        const metrics = scoreCase(evalCase, strategy, k);
        return { recallAtK: acc.recallAtK + metrics.recallAtK, mrr: acc.mrr + metrics.mrr, ndcgAtK: acc.ndcgAtK + metrics.ndcgAtK };
      },
      { recallAtK: 0, mrr: 0, ndcgAtK: 0 },
    );
    const size = Math.max(scored.length, 1);
    result[strategy] = { recallAtK: totals.recallAtK / size, mrr: totals.mrr / size, ndcgAtK: totals.ndcgAtK / size };
  }
  return result;
}
