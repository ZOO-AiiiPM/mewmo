import { describe, expect, it, vi } from "vitest";

import {
  createNoopObservability,
  observeAgentTurn,
  type AgentObservabilityPort,
  type AgentTurnObservation,
} from "./port";

const input = {
  userId: "user-private",
  chatId: "chat-1",
  turnId: "turn-1",
  configuredMaxRetries: 2,
};

describe("observeAgentTurn", () => {
  it("runs without an observer", async () => {
    await expect(
      observeAgentTurn(undefined, input, async () => "answer"),
    ).resolves.toBe("answer");
  });

  it("keeps the Agent result when observer initialization or finalization fails", async () => {
    const before = failingPort(async () => {
      throw new Error("init failed");
    });
    const after = failingPort(async (_input, operation) => {
      await operation(recordingObservation());
      throw new Error("flush failed");
    });
    const operation = vi.fn(async () => "answer");

    await expect(
      observeAgentTurn(before, input, operation, vi.fn()),
    ).resolves.toBe("answer");
    await expect(
      observeAgentTurn(after, input, operation, vi.fn()),
    ).resolves.toBe("answer");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not swallow an Agent operation failure", async () => {
    const failure = new Error("model failed");
    await expect(
      observeAgentTurn(createNoopObservability(), input, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
  });

  it("isolates individual observation update failures", async () => {
    const warn = vi.fn();
    const observer = recordingObservation({
      configure: () => {
        throw new Error("broken");
      },
    });
    const port = failingPort((_input, operation) => operation(observer));

    await expect(
      observeAgentTurn(
        port,
        input,
        async (turn) => {
          turn.configure({
            purpose: "agent.chat",
            provider: "google",
            requestedModel: "gemini",
          });
          return "answer";
        },
        warn,
      ),
    ).resolves.toBe("answer");
    expect(warn).toHaveBeenCalledWith(
      "Langfuse observation update failed; Agent execution continued.",
    );
  });
});

function failingPort(
  observeTurn: AgentObservabilityPort["observeTurn"],
): AgentObservabilityPort {
  return { observeTurn, async shutdown() {} };
}

function recordingObservation(
  overrides: Partial<AgentTurnObservation> = {},
): AgentTurnObservation {
  return {
    configure() {},
    generationStarted() {},
    generationCompleted() {},
    toolStarted() {},
    toolCompleted() {},
    completed() {},
    failed() {},
    ...overrides,
  };
}
