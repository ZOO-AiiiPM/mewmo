import type { AgentErrorCode } from "../contracts";

export interface AgentTurnObservationInput {
  userId: string;
  chatId: string;
  turnId: string;
  configuredMaxRetries: number;
}

export interface AgentGenerationStart {
  sequence: number;
  operation: "agent.response" | "agent.compaction";
  purpose: "agent.chat" | "agent.deep_insight";
  provider: string;
  requestedModel: string;
}

export interface AgentGenerationEnd extends AgentGenerationStart {
  responseModel?: string;
  stopReason: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  reasoningTokens?: number;
  providerCostUsd?: number;
}

export interface AgentToolObservationStart {
  toolCallId: string;
  toolName: string;
}

export interface AgentToolObservationEnd extends AgentToolObservationStart {
  isError: boolean;
}

export interface AgentTurnObservation {
  configure(input: {
    purpose: "agent.chat" | "agent.deep_insight";
    provider: string;
    requestedModel: string;
  }): void;
  generationStarted(input: AgentGenerationStart): void;
  generationCompleted(input: AgentGenerationEnd): void;
  toolStarted(input: AgentToolObservationStart): void;
  toolCompleted(input: AgentToolObservationEnd): void;
  completed(input: {
    providerCallCount: number;
    generationCount: number;
  }): void;
  failed(input: {
    code: AgentErrorCode;
    retryable: boolean;
    providerCallCount: number;
    generationCount: number;
  }): void;
}

export interface AgentObservabilityPort {
  observeTurn<T>(
    input: AgentTurnObservationInput,
    operation: (observation: AgentTurnObservation) => Promise<T>,
  ): Promise<T>;
  shutdown(): Promise<void>;
}

export type ObservabilityWarning = (message: string) => void;

const noopTurnObservation: AgentTurnObservation = {
  configure() {},
  generationStarted() {},
  generationCompleted() {},
  toolStarted() {},
  toolCompleted() {},
  completed() {},
  failed() {},
};

export async function observeAgentTurn<T>(
  observability: AgentObservabilityPort | undefined,
  input: AgentTurnObservationInput,
  operation: (observation: AgentTurnObservation) => Promise<T>,
  warn: ObservabilityWarning = defaultWarning,
): Promise<T> {
  if (!observability) return operation(noopTurnObservation);

  let outcome:
    | { ok: true; value: T }
    | { ok: false; error: unknown }
    | undefined;
  try {
    await observability.observeTurn(input, async (observation) => {
      try {
        const value = await operation(safeObservation(observation, warn));
        outcome = { ok: true, value };
        return value;
      } catch (error) {
        outcome = { ok: false, error };
        throw error;
      }
    });
  } catch {
    if (outcome?.ok) {
      warn("Langfuse turn finalization failed; Agent execution continued.");
      return outcome.value;
    }
    if (outcome && !outcome.ok) throw outcome.error;
    warn(
      "Langfuse turn initialization failed; Agent execution continued without tracing.",
    );
    return operation(noopTurnObservation);
  }

  if (outcome?.ok) return outcome.value;
  if (outcome && !outcome.ok) throw outcome.error;
  warn(
    "Langfuse observer skipped the Agent operation; execution continued without tracing.",
  );
  return operation(noopTurnObservation);
}

export function createNoopObservability(): AgentObservabilityPort {
  return {
    observeTurn: (_input, operation) => operation(noopTurnObservation),
    async shutdown() {},
  };
}

function safeObservation(
  observation: AgentTurnObservation,
  warn: ObservabilityWarning,
): AgentTurnObservation {
  return {
    configure: (input) => safely(() => observation.configure(input), warn),
    generationStarted: (input) =>
      safely(() => observation.generationStarted(input), warn),
    generationCompleted: (input) =>
      safely(() => observation.generationCompleted(input), warn),
    toolStarted: (input) => safely(() => observation.toolStarted(input), warn),
    toolCompleted: (input) =>
      safely(() => observation.toolCompleted(input), warn),
    completed: (input) => safely(() => observation.completed(input), warn),
    failed: (input) => safely(() => observation.failed(input), warn),
  };
}

function safely(operation: () => void, warn: ObservabilityWarning) {
  try {
    operation();
  } catch {
    warn("Langfuse observation update failed; Agent execution continued.");
  }
}

function defaultWarning(message: string) {
  console.warn(`[agent-observability] ${message}`);
}
