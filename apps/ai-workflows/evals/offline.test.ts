import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { parseWorkflowPrompt } from "../src/prompts";
import { assertValidSummary, summaryCharacterCount } from "../src/workflows/summary";

describe("AI Workflow offline eval contracts", () => {
  it.each(["article-summary.zh", "note-insight.zh"])("validates %s prompt metadata", async (name) => {
    const source = await readFile(new URL(`../prompts/${name}.md`, import.meta.url), "utf8");
    const prompt = parseWorkflowPrompt(source);
    expect(prompt.metadata.id).toContain("workflow.");
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
});
