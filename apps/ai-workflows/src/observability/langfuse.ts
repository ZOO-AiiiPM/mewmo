import { createHmac } from "node:crypto";

import { LangfuseSpanProcessor } from "@langfuse/otel";
import { propagateAttributes, startActiveObservation, startObservation, type LangfuseChain } from "@langfuse/tracing";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { z } from "zod";

import type { ClaimedAiRun, ModelMetadata } from "../contracts";
import { createNoopWorkflowObservability, type WorkflowModelObservationInput, type WorkflowObservabilityPort, type WorkflowRunObservation, type WorkflowRunStatus } from "./port";

const optionalValue = <Schema extends z.ZodType>(schema: Schema) => z.preprocess(emptyAsUndefined, schema.optional());

const configSchema = z.object({
  LANGFUSE_PUBLIC_KEY: optionalValue(z.string().trim().min(1)),
  LANGFUSE_SECRET_KEY: optionalValue(z.string().trim().min(1)),
  LANGFUSE_BASE_URL: optionalValue(z.string().url()),
  LANGFUSE_ENVIRONMENT: optionalValue(z.string().trim().min(1).max(40)),
  LANGFUSE_RELEASE: optionalValue(z.string().trim().min(1).max(200)),
  LANGFUSE_USER_HASH_SECRET: optionalValue(z.string().min(32)),
  LANGFUSE_SHUTDOWN_TIMEOUT_MS: optionalValue(z.coerce.number().int().min(100).max(15_000)),
});

type WorkflowLangfuseConfig = {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
  environment: string;
  release: string;
  userHashSecret: string;
  shutdownTimeoutMs: number;
};

interface WorkflowLangfuseDependencies {
  createSdk(config: WorkflowLangfuseConfig): TelemetrySdk;
  startRun(operation: (root: LangfuseChain) => Promise<void>): Promise<void>;
  startModel(input: WorkflowModelObservationInput): ModelObservation;
  propagate(
    input: {
      userId: string;
      metadata: Record<string, string>;
      version: string;
      traceName: string;
    },
    operation: () => Promise<void>,
  ): Promise<void>;
}

interface TelemetrySdk {
  start(): void;
  shutdown(): Promise<void>;
}

interface ModelObservation {
  update(input: Record<string, unknown>): void;
  end(): void;
}

type ObservabilityWarning = (message: string) => void;

const defaultWarning: ObservabilityWarning = (message) => {
  console.warn(`[workflow-observability] ${message}`);
};

export function createConfiguredWorkflowObservability(processEnv: NodeJS.ProcessEnv = process.env, warn: ObservabilityWarning = defaultWarning, dependencies?: WorkflowLangfuseDependencies): WorkflowObservabilityPort {
  const parsed = configSchema.safeParse(processEnv);
  if (!parsed.success) {
    warn("Langfuse configuration is invalid; Workflow tracing is disabled.");
    return createNoopWorkflowObservability();
  }
  const env = parsed.data;
  if (!env.LANGFUSE_PUBLIC_KEY && !env.LANGFUSE_SECRET_KEY) {
    return createNoopWorkflowObservability();
  }
  if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY || !env.LANGFUSE_USER_HASH_SECRET) {
    warn("Langfuse credentials are incomplete; Workflow tracing is disabled.");
    return createNoopWorkflowObservability();
  }

  const config: WorkflowLangfuseConfig = {
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    baseUrl: env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com",
    environment: env.LANGFUSE_ENVIRONMENT ?? (processEnv.NODE_ENV === "production" ? "production" : "development"),
    release: env.LANGFUSE_RELEASE ?? processEnv.GIT_COMMIT_SHA ?? processEnv.GITHUB_SHA ?? "local",
    userHashSecret: env.LANGFUSE_USER_HASH_SECRET,
    shutdownTimeoutMs: env.LANGFUSE_SHUTDOWN_TIMEOUT_MS ?? 3_000,
  };

  try {
    return createLangfuseWorkflowObservability(config, dependencies ?? defaultDependencies(config), warn);
  } catch {
    warn("Langfuse initialization failed; Workflow tracing is disabled.");
    return createNoopWorkflowObservability();
  }
}

export function createLangfuseWorkflowObservability(config: WorkflowLangfuseConfig, dependencies: WorkflowLangfuseDependencies, warn: ObservabilityWarning = defaultWarning): WorkflowObservabilityPort {
  const sdk = dependencies.createSdk(config);
  sdk.start();

  return {
    async observeRun(run, operation) {
      let outcome: { ok: true; value: WorkflowRunStatus } | { ok: false; error: unknown } | undefined;
      try {
        await dependencies.startRun(async (root) =>
          dependencies.propagate(
            {
              userId: privateWorkflowUserId(run.userId, config.userHashSecret),
              traceName: `workflow.${run.kind}`,
              version: config.release,
              metadata: propagatedRunMetadata(run),
            },
            async () => {
              try {
                const value = await operation(createRunObservation(root, warn));
                outcome = { ok: true, value };
                safely(() => updateRun(root, run, value), warn);
              } catch (error) {
                outcome = { ok: false, error };
                safely(
                  () =>
                    root.update({
                      level: "ERROR",
                      statusMessage: "Workflow run failed unexpectedly",
                      metadata: { ...runMetadata(run), status: "failed" },
                    }),
                  warn,
                );
              }
            },
          ),
        );
      } catch {
        if (outcome?.ok) {
          warn("Langfuse run finalization failed; Workflow execution continued.");
          return outcome.value;
        }
        if (outcome && !outcome.ok) throw outcome.error;
        warn("Langfuse run initialization failed; Workflow execution continued without tracing.");
        return operation(noopRunObservation);
      }
      if (outcome?.ok) return outcome.value;
      if (outcome && !outcome.ok) throw outcome.error;
      warn("Langfuse observer skipped the Workflow operation; execution continued without tracing.");
      return operation(noopRunObservation);
    },
    async observeModelCall<T>(input: WorkflowModelObservationInput, operation: () => Promise<{ value: T; metadata: ModelMetadata; output?: unknown }>) {
      let observation: ModelObservation | undefined;
      try {
        observation = dependencies.startModel(input);
      } catch {
        warn("Langfuse model observation failed to start; model execution continued.");
        return (await operation()).value;
      }
      try {
        const result = await operation();
        safely(() => updateModel(observation, input, result.metadata, result.output), warn);
        return result.value;
      } catch (error) {
        safely(
          () =>
            observation.update({
              level: "ERROR",
              statusMessage: "Workflow model call failed",
              metadata: { purpose: input.purpose },
            }),
          warn,
        );
        throw error;
      } finally {
        safely(() => observation.end(), warn);
      }
    },
    async shutdown() {
      try {
        await withTimeout(sdk.shutdown(), config.shutdownTimeoutMs);
      } catch {
        warn("Langfuse shutdown did not complete; Workflow shutdown continued.");
      }
    },
  };
}

export function privateWorkflowUserId(userId: string, secret: string) {
  return `usr_${createHmac("sha256", secret).update(`langfuse-user:${userId}`).digest("hex")}`;
}

function defaultDependencies(config: WorkflowLangfuseConfig): WorkflowLangfuseDependencies {
  return {
    createSdk: () =>
      new NodeSDK({
        spanProcessors: [
          new LangfuseSpanProcessor({
            publicKey: config.publicKey,
            secretKey: config.secretKey,
            baseUrl: config.baseUrl,
            environment: config.environment,
            release: config.release,
            exportMode: "batched",
            mediaUploadEnabled: false,
            mask: ({ data }) => redactWorkflowTraceData(data),
          }),
        ],
      }),
    startRun: (operation) => startActiveObservation("workflow.run", operation, { asType: "chain" }),
    startModel: (input) => {
      const attributes = {
        ...(input.input === undefined ? {} : { input: input.input }),
        ...(input.prompt ? { prompt: input.prompt } : {}),
        metadata: { purpose: input.purpose },
      };
      if (input.type === "generation") {
        return modelObservation(startObservation(input.name, attributes, { asType: "generation" }));
      }
      if (input.type === "embedding") {
        return modelObservation(startObservation(input.name, attributes, { asType: "embedding" }));
      }
      return modelObservation(startObservation(input.name, attributes, { asType: "retriever" }));
    },
    propagate: (input, operation) => propagateAttributes(input, operation),
  };
}

function runMetadata(run: ClaimedAiRun) {
  return {
    runId: run.id,
    kind: run.kind,
    targetType: run.targetType,
    targetId: run.targetId,
    inputVersion: run.inputVersion,
    attempt: run.attempt,
  };
}

function propagatedRunMetadata(run: ClaimedAiRun) {
  return Object.fromEntries(Object.entries(runMetadata(run)).map(([key, value]) => [key, String(value)]));
}

function updateRun(root: LangfuseChain, run: ClaimedAiRun, status: WorkflowRunStatus) {
  root.update({
    metadata: { ...runMetadata(run), status },
    statusMessage: `Workflow run ${status}`,
    ...(status === "retrying" || status === "failed" ? { level: "ERROR" as const } : {}),
  });
}

function updateModel(observation: ModelObservation, input: WorkflowModelObservationInput, metadata: ModelMetadata, output: unknown) {
  const usage = metadata.usage;
  observation.update({
    ...(output === undefined ? {} : { output }),
    ...(input.type === "retriever"
      ? {}
      : {
          model: metadata.responseModel ?? metadata.model ?? metadata.profile,
        }),
    metadata: {
      purpose: input.purpose,
      profile: metadata.profile,
      provider: metadata.provider ?? "unknown",
      requestedModel: metadata.model ?? metadata.profile,
    },
    ...(usage
      ? {
          usageDetails: {
            input: usage.inputTokens,
            output: usage.outputTokens,
            total: usage.totalTokens,
            cacheRead: usage.cacheReadTokens,
            cacheWrite: usage.cacheWriteTokens,
            ...(usage.reasoningTokens === undefined ? {} : { reasoning: usage.reasoningTokens }),
          },
        }
      : {}),
    ...(usage?.providerCostUsd === undefined ? {} : { costDetails: { total: usage.providerCostUsd } }),
  });
}

function modelObservation(observation: { update(input: never): unknown; end(): unknown }): ModelObservation {
  return {
    update: (input) => {
      observation.update(input as never);
    },
    end: () => {
      observation.end();
    },
  };
}

export function redactWorkflowTraceData(data: unknown): unknown {
  if (typeof data === "string") return redactStructuredString(data);
  if (Array.isArray(data)) return data.map(redactWorkflowTraceData);
  if (!isRecord(data)) return data;
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, sensitiveKey(key) ? "[REDACTED]" : redactWorkflowTraceData(value)]));
}

function redactString(value: string) {
  return value
    .replace(/\bBearer\s+[^\s,;]+/giu, "Bearer [REDACTED]")
    .replace(/\b(?:sk|pk)[-_][A-Za-z0-9_-]{8,}\b/gu, "[REDACTED_KEY]");
}

function redactStructuredString(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null) return redactString(value);
    return JSON.stringify(redactWorkflowTraceData(parsed));
  } catch {
    return redactString(value);
  }
}

function sensitiveKey(key: string) {
  const normalized = key.replace(/[^a-z0-9]/giu, "").toLowerCase();
  return normalized === "authorization"
    || normalized === "proxyauthorization"
    || normalized === "cookie"
    || normalized === "setcookie"
    || normalized.endsWith("apikey")
    || normalized.endsWith("secret")
    || normalized.endsWith("token")
    || normalized.endsWith("password")
    || normalized.endsWith("credential")
    || normalized.endsWith("credentials")
    || normalized.endsWith("privatekey");
}

const noopRunObservation: WorkflowRunObservation = { input() {}, output() {} };

function createRunObservation(root: LangfuseChain, warn: ObservabilityWarning): WorkflowRunObservation {
  return {
    input: (value) => safely(() => root.update({ input: value }), warn),
    output: (value) => safely(() => root.update({ output: value }), warn),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function emptyAsUndefined(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

function safely(operation: () => void, warn: ObservabilityWarning) {
  try {
    operation();
  } catch {
    warn("Langfuse observation update failed; Workflow execution continued.");
  }
}

async function withTimeout(operation: Promise<void>, timeoutMs: number) {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error("Telemetry shutdown timed out")), timeoutMs);
    timer.unref();
  });
  try {
    await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
