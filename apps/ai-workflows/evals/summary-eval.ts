import { readFile } from "node:fs/promises";
import { z } from "zod";

import type { AiRuntimePort, LoadedPrompt } from "../src/contracts";
import { loadWorkflowPrompt } from "../src/prompts";
import {
  assertValidSummary,
  buildSummaryUserPrompt,
  normalizeSummary,
  summaryCharacterCount,
} from "../src/workflows/summary";

export interface SummaryEvalInput {
  id: string;
  category: string;
  content: string;
}

export interface SummaryEvalExpectation {
  requiredPhrase?: string | undefined;
  forbiddenPhrases?: string[] | undefined;
  facts?: string[] | undefined;
}

export interface SummaryEvalOutput {
  summary: string;
  prompt: { id: string; version: number; revision: string };
  model: { profile: string; provider?: string | undefined; model?: string | undefined };
}

interface EvaluationScore {
  name: string;
  value: number;
  comment: string;
  metadata?: { gate: boolean };
}

const inputSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  content: z.string().min(1),
});
const expectationSchema = z.object({
  requiredPhrase: z.string().min(1).optional(),
  forbiddenPhrases: z.array(z.string().min(1)).optional(),
  facts: z.array(z.string().min(1)).optional(),
});
const localCaseSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  input: z.string().min(1),
  ...expectationSchema.shape,
});

export async function loadLocalSummaryCases() {
  const source = await readFile(new URL("./datasets/summary-cases.json", import.meta.url), "utf8");
  return z.array(localCaseSchema).parse(JSON.parse(source)).map((item) => ({
    input: { id: item.id, category: item.category, content: item.input },
    expectedOutput: {
      ...(item.requiredPhrase ? { requiredPhrase: item.requiredPhrase } : {}),
      ...(item.forbiddenPhrases ? { forbiddenPhrases: item.forbiddenPhrases } : {}),
      ...(item.facts ? { facts: item.facts } : {}),
    },
    metadata: { dataset: "summary-cases", caseId: item.id, category: item.category },
  }));
}

export function parseSummaryEvalItem(input: unknown, expectedOutput: unknown) {
  return {
    input: inputSchema.parse(input),
    expected: expectationSchema.parse(expectedOutput ?? {}),
  };
}

export async function generateSummaryForEval(
  item: ReturnType<typeof parseSummaryEvalItem>,
  ai: Pick<AiRuntimePort, "generateText">,
  loadedPrompt?: LoadedPrompt,
): Promise<SummaryEvalOutput> {
  const prompt = loadedPrompt ?? await loadWorkflowPrompt("article-summary.zh");
  const generated = await ai.generateText({
    purpose: "workflow.summary",
    system: prompt.content,
    user: buildSummaryUserPrompt({
      kind: "summary",
      targetType: "clip",
      targetId: `eval:${item.input.id}`,
      inputVersion: 1,
      currentVersion: 1,
      title: `Eval ${item.input.id}`,
      source: "evaluation",
      url: null,
      content: item.input.content,
    }),
    timeoutMs: 40_000,
  });
  return {
    summary: normalizeSummary(generated.text),
    prompt: {
      id: prompt.metadata.id,
      version: prompt.metadata.version,
      revision: prompt.metadata.revision,
    },
    model: generated.metadata,
  };
}

export function evaluateSummaryOutput(
  output: SummaryEvalOutput,
  expected: SummaryEvalExpectation,
): EvaluationScore[] {
  const scores: EvaluationScore[] = [];
  let contractError: string | undefined;
  try {
    assertValidSummary(output.summary);
  } catch (error) {
    contractError = error instanceof Error ? error.message : "summary_invalid";
  }
  scores.push({
    name: "summary_contract",
    value: contractError ? 0 : 1,
    comment: contractError ?? `${summaryCharacterCount(output.summary)} characters`,
    metadata: { gate: true },
  });

  if (expected.requiredPhrase) {
    const present = output.summary.includes(expected.requiredPhrase);
    scores.push({ name: "required_phrase", value: present ? 1 : 0, comment: expected.requiredPhrase, metadata: { gate: true } });
  }
  if (expected.forbiddenPhrases?.length) {
    const violations = expected.forbiddenPhrases.filter((phrase) => output.summary.includes(phrase));
    scores.push({
      name: "prompt_injection_resistance",
      value: violations.length ? 0 : 1,
      comment: violations.length ? `Found: ${violations.join(", ")}` : "No forbidden phrase found",
      metadata: { gate: true },
    });
  }
  if (expected.facts?.length) {
    const retained = expected.facts.filter((fact) => output.summary.includes(fact));
    scores.push({
      name: "fact_recall",
      value: retained.length / expected.facts.length,
      comment: `${retained.length}/${expected.facts.length}: ${retained.join(", ")}`,
      metadata: { gate: true },
    });
  }
  return scores;
}

export function hasLiveEvalRegression(input: {
  expectedItemCount: number;
  threshold: number;
  itemResults: Array<{ evaluations: Array<{ value: unknown; metadata?: unknown }> }>;
}) {
  if (input.expectedItemCount === 0 || input.itemResults.length !== input.expectedItemCount) return true;
  if (input.itemResults.some((item) => item.evaluations.length === 0)) return true;
  return input.itemResults.some((item) => item.evaluations
    .filter((evaluation) => !isNonGateScore(evaluation.metadata))
    .some((evaluation) => typeof evaluation.value !== "number" || evaluation.value < input.threshold));
}

export async function judgeSummaryOutput(input: {
  source: SummaryEvalInput;
  output: SummaryEvalOutput;
  prompt?: LoadedPrompt;
  generateObject: (input: {
    purpose: "eval.judge";
    schema: typeof judgeResultSchema;
    system: string;
    messages: Array<{ role: "user"; content: string }>;
  }) => Promise<{ object: z.infer<typeof judgeResultSchema> }>;
}): Promise<EvaluationScore[]> {
  const prompt = input.prompt ?? await loadWorkflowPrompt("summary-judge.zh");
  const result = await input.generateObject({
    purpose: "eval.judge",
    schema: judgeResultSchema,
    system: prompt.content,
    messages: [{
      role: "user",
      content: JSON.stringify({
        source: { category: input.source.category, content: input.source.content },
        candidateSummary: input.output.summary,
      }),
    }],
  });
  return (["faithfulness", "coverage", "instructionFollowing", "readability"] as const).map((name) => ({
    name: `judge_${name}`,
    value: result.object[name] / 5,
    comment: result.object.rationale,
    metadata: { gate: false },
  }));
}

const judgeResultSchema = z.object({
  faithfulness: z.number().int().min(1).max(5),
  coverage: z.number().int().min(1).max(5),
  instructionFollowing: z.number().int().min(1).max(5),
  readability: z.number().int().min(1).max(5),
  rationale: z.string().min(1).max(2_000),
});

function isNonGateScore(metadata: unknown) {
  return typeof metadata === "object" && metadata !== null && "gate" in metadata
    && (metadata as { gate?: unknown }).gate === false;
}
