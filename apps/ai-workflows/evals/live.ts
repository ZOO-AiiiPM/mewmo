import { LangfuseClient, type Evaluator, type ExperimentItem } from "@langfuse/client";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { createAIRuntime, loadAIRuntimeConfig } from "@mewmo/ai";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { z } from "zod";

import { loadWorkflowPrompt } from "../src/prompts";
import {
  evaluateSummaryOutput,
  generateSummaryForEval,
  hasLiveEvalRegression,
  judgeSummaryOutput,
  loadLocalSummaryCases,
  parseSummaryEvalItem,
  type SummaryEvalExpectation,
  type SummaryEvalInput,
  type SummaryEvalOutput,
} from "./summary-eval";

const envSchema = z.object({
  LANGFUSE_PUBLIC_KEY: z.string().min(1),
  LANGFUSE_SECRET_KEY: z.string().min(1),
  LANGFUSE_BASE_URL: z.string().url().default("https://cloud.langfuse.com"),
  LANGFUSE_DATASET_NAME: z.string().min(1).optional(),
  LANGFUSE_DATASET_VERSION: z.string().datetime({ offset: true }).optional(),
  LANGFUSE_RUN_NAME: z.string().min(1).optional(),
  EVAL_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(2),
  EVAL_FAIL_BELOW: z.coerce.number().min(0).max(1).default(1),
});

async function main() {
  const env = envSchema.parse(process.env);
  const aiConfig = loadAIRuntimeConfig();
  const aiRuntime = createAIRuntime(aiConfig);
  const candidatePrompt = await loadWorkflowPrompt("article-summary.zh");
  const judgePrompt = await loadWorkflowPrompt("summary-judge.zh");
  const release = process.env.GITHUB_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
  const telemetry = new NodeSDK({
    spanProcessors: [new LangfuseSpanProcessor({
      publicKey: env.LANGFUSE_PUBLIC_KEY,
      secretKey: env.LANGFUSE_SECRET_KEY,
      baseUrl: env.LANGFUSE_BASE_URL,
      environment: "evaluation",
      release,
      exportMode: "immediate",
    })],
  });
  telemetry.start();
  const client = new LangfuseClient({
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    baseUrl: env.LANGFUSE_BASE_URL,
  });
  const summaryPort = {
    async generateText(input: {
      purpose: "workflow.summary";
      system: string;
      user: string;
      timeoutMs: number;
    }) {
      const result = await aiRuntime.generateText({
        purpose: input.purpose,
        system: input.system,
        messages: [{ role: "user", content: input.user }],
      });
      return { text: result.text, metadata: { profile: result.purpose, provider: result.provider, model: result.model } };
    },
  };
  const task = async ({ input, expectedOutput }: { input?: unknown; expectedOutput?: unknown }) =>
    generateSummaryForEval(parseSummaryEvalItem(input, expectedOutput), summaryPort, candidatePrompt);
  const evaluator: Evaluator<unknown, unknown> = async ({ input, output, expectedOutput }) => {
    const item = parseSummaryEvalItem(input, expectedOutput);
    const parsedOutput = summaryOutputSchema.parse(output);
    return [
      ...evaluateSummaryOutput(parsedOutput, summaryExpectationSchema.parse(expectedOutput ?? {})),
      ...await judgeSummaryOutput({
        source: item.input,
        output: parsedOutput,
        prompt: judgePrompt,
        generateObject: (request) => aiRuntime.generateObject(request),
      }),
    ];
  };
  const common = {
    name: "mewmo-summary-live-eval",
    ...(env.LANGFUSE_RUN_NAME ? { runName: env.LANGFUSE_RUN_NAME } : {}),
    description: "Mewmo article summary prompt regression evaluation",
    metadata: {
      source: "mewmo-repository",
      commit: release,
      candidatePrompt: candidatePrompt.metadata,
      judgePrompt: judgePrompt.metadata,
      candidateModel: aiConfig.models["workflow.summary"]?.model,
      judgeModel: aiConfig.models["eval.judge"]?.model,
      datasetName: env.LANGFUSE_DATASET_NAME ?? "repository:summary-cases",
      datasetVersion: env.LANGFUSE_DATASET_VERSION ?? "repository",
    },
    task,
    evaluators: [evaluator],
    maxConcurrency: env.EVAL_MAX_CONCURRENCY,
  };

  try {
    let expectedItemCount: number;
    let result;
    if (env.LANGFUSE_DATASET_NAME) {
      const dataset = await client.dataset.get(env.LANGFUSE_DATASET_NAME, {
        ...(env.LANGFUSE_DATASET_VERSION ? { version: env.LANGFUSE_DATASET_VERSION } : {}),
      });
      expectedItemCount = dataset.items.length;
      result = await dataset.runExperiment(common);
    } else {
      const data = await loadLocalSummaryCases() as ExperimentItem<SummaryEvalInput, SummaryEvalExpectation>[];
      expectedItemCount = data.length;
      result = await client.experiment.run({
        ...common,
        data,
      });
    }
    console.log(await result.format({ includeItemResults: true }));

    if (hasLiveEvalRegression({
      expectedItemCount,
      threshold: env.EVAL_FAIL_BELOW,
      itemResults: result.itemResults,
    })) process.exitCode = 1;
  } finally {
    try {
      await client.shutdown();
    } finally {
      await telemetry.shutdown();
    }
  }
}

const summaryOutputSchema = z.object({
  summary: z.string(),
  prompt: z.object({ id: z.string(), version: z.number(), revision: z.string() }),
  model: z.object({ profile: z.string(), provider: z.string().optional(), model: z.string().optional() }),
}) satisfies z.ZodType<SummaryEvalOutput>;

const summaryExpectationSchema = z.object({
  requiredPhrase: z.string().optional(),
  forbiddenPhrases: z.array(z.string()).optional(),
  facts: z.array(z.string()).optional(),
}) satisfies z.ZodType<SummaryEvalExpectation>;

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
