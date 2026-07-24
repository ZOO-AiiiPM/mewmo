import { describe, expect, it } from "vitest";

import {
  evaluateStrategies,
  loadRecommendationCases,
  rankCandidates,
  scoreCase,
  type EvalCase,
} from "./recommendation-eval";

describe("ZOO-64 hybrid retrieval offline eval", () => {
  it("keeps a versioned dataset covering the annotated retrieval scenarios", async () => {
    const cases = await loadRecommendationCases();
    expect(cases.map((item) => item.category)).toEqual(
      expect.arrayContaining(["paraphrase", "keyword-noise", "cross-type", "duplicate", "no-relevant"]),
    );
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length);
  });

  it("shows RRF fusion recalls at least as well as either single route", async () => {
    const cases = await loadRecommendationCases();
    const metrics = evaluateStrategies(cases, 5);
    expect(metrics.rrf.recallAtK).toBeGreaterThanOrEqual(metrics["dense-only"].recallAtK);
    expect(metrics.rrf.recallAtK).toBeGreaterThanOrEqual(metrics["lexical-only"].recallAtK);
    // 至少存在一路漏召的样本，融合应严格更优，验证 fusion 不是空操作。
    expect(metrics.rrf.recallAtK).toBeGreaterThan(
      Math.max(metrics["dense-only"].recallAtK, metrics["lexical-only"].recallAtK),
    );
  });

  it("shows rerank improves ranking quality (MRR/nDCG) over plain RRF order", async () => {
    const cases = await loadRecommendationCases();
    const metrics = evaluateStrategies(cases, 5);
    expect(metrics["rrf-rerank"].mrr).toBeGreaterThanOrEqual(metrics.rrf.mrr);
    expect(metrics["rrf-rerank"].ndcgAtK).toBeGreaterThanOrEqual(metrics.rrf.ndcgAtK);
  });

  it("scores the no-relevant case as zero without throwing", async () => {
    const cases = await loadRecommendationCases();
    const noRelevant = cases.find((item) => item.category === "no-relevant") as EvalCase;
    const metrics = scoreCase(noRelevant, "rrf-rerank", 5);
    expect(metrics).toEqual({ recallAtK: 0, mrr: 0, ndcgAtK: 0 });
  });

  it("is deterministic and repeatable across runs", async () => {
    const cases = await loadRecommendationCases();
    const first = evaluateStrategies(cases, 5);
    const second = evaluateStrategies(cases, 5);
    expect(first).toEqual(second);
    const paraphrase = cases.find((item) => item.category === "paraphrase") as EvalCase;
    expect(rankCandidates(paraphrase.candidates, "rrf")).toEqual(rankCandidates(paraphrase.candidates, "rrf"));
  });
});
