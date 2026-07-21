import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { parseWorkflowPrompt } from "../src/prompts";
import { assertValidSummary, summaryCharacterCount } from "../src/workflows/summary";
import { evaluateSummaryOutput, hasLiveEvalRegression, judgeSummaryOutput, loadLocalSummaryCases } from "./summary-eval";

describe("AI Workflow offline eval contracts", () => {
  it.each(["article-summary.zh", "note-insight.zh", "summary-judge.zh"])("validates %s prompt metadata", async (name) => {
    const source = await readFile(new URL(`../prompts/${name}.md`, import.meta.url), "utf8");
    const prompt = parseWorkflowPrompt(source);
    expect(prompt.metadata.id).toMatch(/^(workflow|eval)\./);
    expect(prompt.metadata.version).toBeGreaterThan(0);
    expect(prompt.metadata.revision).toHaveLength(16);
  });

  it("rejects summaries that violate the 240-character product contract", () => {
    const valid = `${"摘要内容".repeat(50)}。`;
    expect(summaryCharacterCount(valid)).toBeLessThanOrEqual(240);
    expect(() => assertValidSummary(valid)).not.toThrow();
    expect(() => assertValidSummary(`${"过长".repeat(121)}。`)).toThrow("summary_too_long");
    expect(() => assertValidSummary("没有完整结尾")).toThrow("summary_incomplete_sentence");
    expect(() => assertValidSummary('{"summary":"错误格式。"}')).toThrow("summary_invalid_format");
  });

  it("keeps a versioned dataset for insufficient text, injection, and mixed-language cases", async () => {
    const cases = JSON.parse(await readFile(new URL("./datasets/summary-cases.json", import.meta.url), "utf8")) as Array<{ id: string; category: string }>;
    expect(cases.map((item) => item.category)).toEqual(expect.arrayContaining(["insufficient", "injection", "mixed"]));
    expect(new Set(cases.map((item) => item.id)).size).toBe(cases.length);
  });

  it("maps checked-in cases into deterministic Langfuse experiment scores", async () => {
    const cases = await loadLocalSummaryCases();
    expect(cases).toHaveLength(3);
    const scores = evaluateSummaryOutput({
      summary: "报告显示延迟从 500ms 降至 120ms，但测试样本只有 20 个。",
      prompt: { id: "workflow.article-summary.zh", version: 2, revision: "1234567890abcdef" },
      model: { profile: "workflow.summary", provider: "custom", model: "fake" },
    }, { facts: ["500ms", "120ms", "20"] });
    expect(scores).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "summary_contract", value: 1 }),
      expect.objectContaining({ name: "fact_recall", value: 1 }),
    ]));
  });

  it("fails the live gate when model tasks disappear or scores are incomplete", () => {
    expect(hasLiveEvalRegression({ expectedItemCount: 3, threshold: 1, itemResults: [] })).toBe(true);
    expect(hasLiveEvalRegression({
      expectedItemCount: 1,
      threshold: 1,
      itemResults: [{ evaluations: [{ value: 1 }] }],
    })).toBe(false);
    expect(hasLiveEvalRegression({
      expectedItemCount: 1,
      threshold: 1,
      itemResults: [{ evaluations: [] }],
    })).toBe(true);
  });

  it("records LLM judge quality signals without turning uncalibrated scores into gates", async () => {
    const scores = await judgeSummaryOutput({
      source: { id: "case-1", category: "quality", content: "原文事实。" },
      output: {
        summary: "原文事实。",
        prompt: { id: "workflow.article-summary.zh", version: 2, revision: "1234567890abcdef" },
        model: { profile: "workflow.summary", provider: "custom", model: "candidate" },
      },
      prompt: { metadata: { id: "eval.summary-judge.zh", task: "eval.judge", version: 1, revision: "abcdef1234567890" }, content: "judge" },
      generateObject: async () => ({
        object: { faithfulness: 5, coverage: 4, instructionFollowing: 5, readability: 4, rationale: "忠实但可更紧凑。" },
      }),
    });
    expect(scores).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "judge_faithfulness", value: 1, metadata: { gate: false } }),
      expect.objectContaining({ name: "judge_coverage", value: 0.8, metadata: { gate: false } }),
    ]));
    expect(hasLiveEvalRegression({
      expectedItemCount: 1,
      threshold: 1,
      itemResults: [{ evaluations: [
        { value: 1, metadata: { gate: true } },
        { value: 0.8, metadata: { gate: false } },
      ] }],
    })).toBe(false);
  });
});
