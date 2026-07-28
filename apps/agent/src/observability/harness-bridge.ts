import type { AssistantMessage, Usage } from "@earendil-works/pi-ai";
import type { AgentHarnessEvent } from "@earendil-works/pi-agent-core/node";

import type { AgentGenerationStart, AgentTurnObservation } from "./port";

interface HarnessObservationBridgeOptions {
  observation: AgentTurnObservation;
  purpose: "agent.chat" | "agent.deep_insight";
  provider: string;
  requestedModel: string;
  pricingKnown: boolean;
}

export interface HarnessObservationBridge {
  generationCount(): number;
  providerCallCount(): number;
  providerRequestStarted(): number;
  compactionStarted(): number;
  compactionCompleted(sequence: number, usage: Usage | undefined): void;
  event(event: AgentHarnessEvent): void;
}

export function createHarnessObservationBridge(
  options: HarnessObservationBridgeOptions,
): HarnessObservationBridge {
  let nextSequence = 0;
  let providerCallCount = 0;
  const pendingResponseGenerations: number[] = [];

  const startGeneration = (operation: AgentGenerationStart["operation"]) => {
    const sequence = ++nextSequence;
    options.observation.generationStarted(
      generationBase(options, sequence, operation),
    );
    return sequence;
  };

  return {
    generationCount: () => nextSequence,
    providerCallCount: () => providerCallCount,
    providerRequestStarted() {
      providerCallCount += 1;
      const sequence = startGeneration("agent.response");
      pendingResponseGenerations.push(sequence);
      return sequence;
    },
    compactionStarted: () => startGeneration("agent.compaction"),
    compactionCompleted(sequence, usage) {
      options.observation.generationCompleted({
        ...generationBase(options, sequence, "agent.compaction"),
        stopReason: "stop",
        ...usageFields(usage, options.pricingKnown),
      });
    },
    event(event) {
      if (event.type === "message_end" && isAssistantMessage(event.message)) {
        const sequence = pendingResponseGenerations.shift();
        if (sequence !== undefined) {
          options.observation.generationCompleted({
            ...generationBase(options, sequence, "agent.response"),
            ...(event.message.responseModel
              ? { responseModel: event.message.responseModel }
              : {}),
            stopReason: event.message.stopReason,
            ...usageFields(event.message.usage, options.pricingKnown),
          });
        }
        return;
      }
      if (event.type === "tool_execution_start") {
        options.observation.toolStarted({
          toolCallId: event.toolCallId,
          toolName: event.toolName,
        });
        return;
      }
      if (event.type === "tool_execution_end") {
        options.observation.toolCompleted({
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          isError: event.isError,
        });
      }
    },
  };
}

function generationBase(
  options: HarnessObservationBridgeOptions,
  sequence: number,
  operation: AgentGenerationStart["operation"],
): AgentGenerationStart {
  return {
    sequence,
    operation,
    purpose: options.purpose,
    provider: options.provider,
    requestedModel: options.requestedModel,
  };
}

function usageFields(usage: Usage | undefined, pricingKnown: boolean) {
  return {
    inputTokens: usage?.input ?? 0,
    outputTokens: usage?.output ?? 0,
    totalTokens: usage?.totalTokens ?? 0,
    cacheReadTokens: usage?.cacheRead ?? 0,
    cacheWriteTokens: usage?.cacheWrite ?? 0,
    ...(usage?.reasoning === undefined
      ? {}
      : { reasoningTokens: usage.reasoning }),
    ...(pricingKnown && usage ? { providerCostUsd: usage.cost.total } : {}),
  };
}

function isAssistantMessage(message: unknown): message is AssistantMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "role" in message &&
    message.role === "assistant"
  );
}
