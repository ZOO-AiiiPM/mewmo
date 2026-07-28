import { createHmac } from "node:crypto";

import { LangfuseSpanProcessor } from "@langfuse/otel";
import {
  propagateAttributes,
  startActiveObservation,
  type LangfuseAgent,
  type LangfuseGeneration,
  type LangfuseTool,
} from "@langfuse/tracing";
import { NodeSDK } from "@opentelemetry/sdk-node";

import type { AgentConfig } from "../config";
import {
  createNoopObservability,
  type AgentGenerationStart,
  type AgentObservabilityPort,
  type AgentToolObservationStart,
  type AgentTurnObservation,
  type AgentTurnObservationInput,
  type ObservabilityWarning,
} from "./port";

interface LangfuseConfig {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
  environment: string;
  release: string;
  userHashSecret: string;
  shutdownTimeoutMs: number;
}

interface LangfuseDependencies {
  createSdk(config: LangfuseConfig): TelemetrySdk;
  startTurn(operation: (root: LangfuseAgent) => Promise<void>): Promise<void>;
  propagate(
    input: {
      userId: string;
      sessionId: string;
      metadata: Record<string, string>;
      version: string;
    },
    operation: () => Promise<void>,
  ): Promise<void>;
}

interface TelemetrySdk {
  start(): void;
  shutdown(): Promise<void>;
}

const defaultWarning: ObservabilityWarning = (message) => {
  console.warn(`[agent-observability] ${message}`);
};

export function createConfiguredAgentObservability(
  config: AgentConfig,
  processEnv: NodeJS.ProcessEnv = process.env,
  warn: ObservabilityWarning = defaultWarning,
  dependencies?: LangfuseDependencies,
): AgentObservabilityPort {
  if (!config.LANGFUSE_PUBLIC_KEY && !config.LANGFUSE_SECRET_KEY)
    return createNoopObservability();
  if (!config.LANGFUSE_PUBLIC_KEY || !config.LANGFUSE_SECRET_KEY) {
    warn("Langfuse credentials are incomplete; Agent tracing is disabled.");
    return createNoopObservability();
  }

  const langfuseConfig: LangfuseConfig = {
    publicKey: config.LANGFUSE_PUBLIC_KEY,
    secretKey: config.LANGFUSE_SECRET_KEY,
    baseUrl: config.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com",
    environment:
      config.LANGFUSE_ENVIRONMENT ??
      (processEnv.NODE_ENV === "production" ? "production" : "development"),
    release:
      config.LANGFUSE_RELEASE ??
      processEnv.GIT_COMMIT_SHA ??
      processEnv.GITHUB_SHA ??
      "local",
    userHashSecret: config.AGENT_IDENTITY_SECRET,
    shutdownTimeoutMs: config.LANGFUSE_SHUTDOWN_TIMEOUT_MS ?? 3_000,
  };

  try {
    return createLangfuseObservability(
      langfuseConfig,
      dependencies ?? defaultDependencies(langfuseConfig),
      warn,
    );
  } catch {
    warn("Langfuse initialization failed; Agent tracing is disabled.");
    return createNoopObservability();
  }
}

export function createLangfuseObservability(
  config: LangfuseConfig,
  dependencies: LangfuseDependencies,
  warn: ObservabilityWarning = defaultWarning,
): AgentObservabilityPort {
  const sdk = dependencies.createSdk(config);
  sdk.start();

  return {
    async observeTurn<T>(
      input: AgentTurnObservationInput,
      operation: (observation: AgentTurnObservation) => Promise<T>,
    ) {
      let outcome:
        | { ok: true; value: T }
        | { ok: false; error: unknown }
        | undefined;
      await dependencies.startTurn(async (root) =>
        dependencies.propagate(
          {
            userId: privateUserId(input.userId, config.userHashSecret),
            sessionId: input.chatId,
            metadata: { chatId: input.chatId, turnId: input.turnId },
            version: config.release,
          },
          async () => {
            try {
              outcome = {
                ok: true,
                value: await operation(
                  createLangfuseTurnObservation(root, input),
                ),
              };
            } catch (error) {
              // Do not let provider errors reach OpenTelemetry's automatic exception recorder.
              outcome = { ok: false, error };
            }
          },
        ),
      );
      if (!outcome) throw new Error("Langfuse turn callback did not run.");
      if (!outcome.ok) throw outcome.error;
      return outcome.value;
    },
    async shutdown() {
      try {
        await withTimeout(sdk.shutdown(), config.shutdownTimeoutMs);
      } catch {
        warn("Langfuse shutdown did not complete; Agent shutdown continued.");
      }
    },
  };
}

export function createLangfuseTurnObservation(
  root: LangfuseAgent,
  input: AgentTurnObservationInput,
): AgentTurnObservation {
  const generations = new Map<
    number,
    { observation: LangfuseGeneration; start: AgentGenerationStart }
  >();
  const tools = new Map<
    string,
    { observation: LangfuseTool; start: AgentToolObservationStart }
  >();
  const rootMetadata: Record<string, unknown> = {
    chatId: input.chatId,
    turnId: input.turnId,
    configuredMaxRetries: input.configuredMaxRetries,
  };

  root.update({ metadata: rootMetadata });

  return {
    configure(config) {
      Object.assign(rootMetadata, config);
      root.update({ metadata: rootMetadata });
    },
    generationStarted(start) {
      const observation = root.startObservation(
        `agent.generation.${start.sequence}`,
        {
          model: start.requestedModel,
          metadata: generationMetadata(start),
        },
        { asType: "generation" },
      );
      generations.set(start.sequence, { observation, start });
    },
    generationCompleted(end) {
      const active = generations.get(end.sequence);
      if (!active) return;
      active.observation.update({
        model: end.responseModel ?? end.requestedModel,
        metadata: {
          ...generationMetadata(active.start),
          stopReason: end.stopReason,
        },
        usageDetails: {
          input: end.inputTokens,
          output: end.outputTokens,
          total: end.totalTokens,
          cacheRead: end.cacheReadTokens,
          cacheWrite: end.cacheWriteTokens,
          ...(end.reasoningTokens === undefined
            ? {}
            : { reasoning: end.reasoningTokens }),
        },
        ...(end.providerCostUsd === undefined
          ? {}
          : { costDetails: { total: end.providerCostUsd } }),
        ...(end.stopReason === "error" || end.stopReason === "aborted"
          ? { level: "ERROR", statusMessage: `Generation ${end.stopReason}` }
          : {}),
      });
      active.observation.end();
      generations.delete(end.sequence);
    },
    toolStarted(start) {
      const observation = root.startObservation(
        `agent.tool.${start.toolName}`,
        {
          metadata: { toolCallId: start.toolCallId, toolName: start.toolName },
        },
        { asType: "tool" },
      );
      tools.set(start.toolCallId, { observation, start });
    },
    toolCompleted(end) {
      const active = tools.get(end.toolCallId);
      if (!active) return;
      active.observation.update({
        metadata: {
          toolCallId: active.start.toolCallId,
          toolName: active.start.toolName,
          status: end.isError ? "failed" : "completed",
        },
        ...(end.isError
          ? { level: "ERROR", statusMessage: "Tool execution failed" }
          : {}),
      });
      active.observation.end();
      tools.delete(end.toolCallId);
    },
    completed({ providerCallCount, generationCount }) {
      closeOpenObservations(generations, tools, false);
      root.update({
        statusMessage: "Agent turn completed",
        metadata: {
          ...rootMetadata,
          status: "completed",
          providerCallCount,
          generationCount,
        },
      });
    },
    failed({ code, retryable, providerCallCount, generationCount }) {
      closeOpenObservations(generations, tools, true);
      root.update({
        level: "ERROR",
        statusMessage: "Agent turn failed",
        metadata: {
          ...rootMetadata,
          status: "failed",
          errorCode: code,
          retryable,
          providerCallCount,
          generationCount,
        },
      });
    },
  };
}

export function privateUserId(userId: string, secret: string) {
  return `usr_${createHmac("sha256", secret).update(`langfuse-user:${userId}`).digest("hex")}`;
}

export function redactLangfuseData(data: unknown): unknown {
  if (typeof data === "string") return redactStructuredString(data);
  if (Array.isArray(data)) return data.map(redactLangfuseData);
  if (!isRecord(data)) return data;
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      sensitiveKey(key) ? "[REDACTED]" : redactLangfuseData(value),
    ]),
  );
}

function defaultDependencies(config: LangfuseConfig): LangfuseDependencies {
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
            mask: ({ data }) => redactLangfuseData(data),
          }),
        ],
      }),
    startTurn: (operation) =>
      startActiveObservation("agent.turn", operation, { asType: "agent" }),
    propagate: (input, operation) =>
      propagateAttributes({ ...input, traceName: "agent.turn" }, operation),
  };
}

function generationMetadata(input: AgentGenerationStart) {
  return {
    sequence: input.sequence,
    operation: input.operation,
    purpose: input.purpose,
    provider: input.provider,
    requestedModel: input.requestedModel,
  };
}

function closeOpenObservations(
  generations: Map<number, { observation: LangfuseGeneration }>,
  tools: Map<string, { observation: LangfuseTool }>,
  failed: boolean,
) {
  for (const { observation } of generations.values()) {
    if (failed)
      observation.update({
        level: "ERROR",
        statusMessage: "Agent turn failed before generation completed",
      });
    observation.end();
  }
  for (const { observation } of tools.values()) {
    if (failed)
      observation.update({
        level: "ERROR",
        statusMessage: "Agent turn failed before tool completed",
      });
    observation.end();
  }
  generations.clear();
  tools.clear();
}

async function withTimeout(operation: Promise<void>, timeoutMs: number) {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("Telemetry shutdown timed out")),
      timeoutMs,
    );
    timer.unref();
  });
  try {
    await Promise.race([operation, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function redactString(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[REDACTED_EMAIL]")
    .replace(/\bBearer\s+[^\s,;]+/giu, "Bearer [REDACTED]")
    .replace(/\b(?:sk|pk)[-_][A-Za-z0-9_-]{8,}\b/gu, "[REDACTED_KEY]");
}

function redactStructuredString(value: string) {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== "object" || parsed === null)
      return redactString(value);
    return JSON.stringify(redactLangfuseData(parsed));
  } catch {
    return redactString(value);
  }
}

function sensitiveKey(key: string) {
  return /(?:authorization|cookie|secret|token|api.?key|password|prompt|content|context|draft|args?|result|input|output|email)/iu.test(
    key,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
