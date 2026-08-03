import type { AgentHarnessEvent } from "@earendil-works/pi-agent-core/node";
import { describe, expect, it, vi } from "vitest";

import { createHarnessObservationBridge } from "./harness-bridge";
import type { AgentTurnObservation } from "./port";

describe("createHarnessObservationBridge", () => {
  it("projects complete generation and tool payloads", () => {
    const observation = fakeObservation();
    const bridge = createHarnessObservationBridge({
      observation,
      purpose: "agent.chat",
      provider: "google",
      requestedModel: "gemini-flash",
      pricingKnown: true,
    });

    bridge.providerRequestStarted();
    bridge.providerPayload({
      messages: [{ role: "user", content: "private prompt" }],
      reasoning: { effort: "high", summary: "auto" },
    });
    bridge.event(assistantEnd("toolUse", 10, 2));
    bridge.event({
      type: "tool_execution_start",
      toolCallId: "tool-1",
      toolName: "content_read",
      args: { content: "private note" },
    } as AgentHarnessEvent);
    bridge.event({
      type: "tool_execution_end",
      toolCallId: "tool-1",
      toolName: "content_read",
      result: { content: "private result" },
      isError: false,
    } as AgentHarnessEvent);
    bridge.providerRequestStarted();
    bridge.event(assistantEnd("stop", 20, 5));

    expect(bridge.generationCount()).toBe(2);
    expect(bridge.providerCallCount()).toBe(2);
    expect(observation.generationStarted).toHaveBeenCalledTimes(2);
    expect(observation.generationCompleted).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sequence: 2,
        provider: "google",
        requestedModel: "gemini-flash",
        responseModel: "gemini-flash-2026",
        stopReason: "stop",
        inputTokens: 20,
        outputTokens: 5,
        totalTokens: 26,
        providerCostUsd: 0.01,
      }),
    );
    expect(observation.toolStarted).toHaveBeenCalledWith({
      toolCallId: "tool-1",
      toolName: "content_read",
      input: { content: "private note" },
    });
    expect(observation.toolCompleted).toHaveBeenCalledWith({
      toolCallId: "tool-1",
      toolName: "content_read",
      isError: false,
      output: { content: "private result" },
    });
    expect(observation.generationInput).toHaveBeenCalledWith({
      sequence: 1,
      input: {
        messages: [{ role: "user", content: "private prompt" }],
        reasoning: { effort: "high", summary: "auto" },
      },
      modelParameters: { "reasoning.effort": "high" },
    });
  });

  it("records compaction as a separate generation", () => {
    const observation = fakeObservation();
    const bridge = createHarnessObservationBridge({
      observation,
      purpose: "agent.deep_insight",
      provider: "anthropic",
      requestedModel: "claude",
      pricingKnown: false,
      prompt: { name: "agent/system.zh", version: 3, isFallback: false },
    });
    const input = { messages: [{ role: "user", content: "full history" }] };
    const result = {
      summary: "compacted history",
      tokensBefore: 3_000,
      usage: usage(30, 4),
    };
    const sequence = bridge.compactionStarted(input);
    bridge.compactionCompleted(sequence, result);

    expect(observation.generationCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "agent.compaction",
        purpose: "agent.deep_insight",
        inputTokens: 30,
        outputTokens: 4,
        output: result,
      }),
    );
    expect(observation.generationInput).toHaveBeenCalledWith({ sequence, input });
    expect(observation.generationStarted).toHaveBeenCalledWith(
      expect.not.objectContaining({ prompt: expect.anything() }),
    );
    expect(
      observation.generationCompleted.mock.calls[0]?.[0],
    ).not.toHaveProperty("providerCostUsd");
    expect(bridge.generationCount()).toBe(1);
    expect(bridge.providerCallCount()).toBe(0);
  });

  it("sanitizes direct URL tool observations", () => {
    const observation = fakeObservation();
    const bridge = createHarnessObservationBridge({ observation, purpose: "agent.chat", provider: "google", requestedModel: "gemini-flash", pricingKnown: true });
    bridge.event({ type: "tool_execution_start", toolCallId: "tool-1", toolName: "clip_url_save", args: { url: "https://example.com/private?token=secret" } } as AgentHarnessEvent);
    bridge.event({ type: "tool_execution_end", toolCallId: "tool-1", toolName: "clip_url_save", result: { action: "clip_saved", status: "created", title: "Private title", content: "secret" }, isError: false } as AgentHarnessEvent);
    expect(observation.toolStarted).toHaveBeenCalledWith({ toolCallId: "tool-1", toolName: "clip_url_save", input: { action: "clip_saved", url: "example.com" } });
    expect(observation.toolCompleted).toHaveBeenCalledWith({ toolCallId: "tool-1", toolName: "clip_url_save", isError: false, output: { action: "clip_saved", status: "created" } });
  });

  it("records a sanitized failed status without projecting provider errors", () => {
    const observation = fakeObservation();
    const bridge = createHarnessObservationBridge({ observation, purpose: "agent.chat", provider: "custom", requestedModel: "deepseek-v4-flash", pricingKnown: false });
    bridge.event({ type: "tool_execution_end", toolCallId: "tool-1", toolName: "feed_url_subscribe", result: new Error("private upstream detail"), isError: true } as AgentHarnessEvent);
    expect(observation.toolCompleted).toHaveBeenCalledWith({ toolCallId: "tool-1", toolName: "feed_url_subscribe", isError: true, output: { action: "feed_subscribed", status: "failed" } });
  });
});

function fakeObservation() {
  return {
    configure: vi.fn(),
    generationStarted: vi.fn(),
    generationInput: vi.fn(),
    generationCompleted: vi.fn(),
    toolStarted: vi.fn(),
    toolCompleted: vi.fn(),
    completed: vi.fn(),
    failed: vi.fn(),
  } satisfies AgentTurnObservation;
}

function assistantEnd(
  stopReason: "toolUse" | "stop",
  input: number,
  output: number,
) {
  return {
    type: "message_end",
    message: {
      role: "assistant",
      content: [],
      api: "google-generative-ai",
      provider: "google",
      model: "gemini-flash",
      responseModel: "gemini-flash-2026",
      stopReason,
      timestamp: Date.now(),
      usage: usage(input, output),
    },
  } as AgentHarnessEvent;
}

function usage(input: number, output: number) {
  return {
    input,
    output,
    cacheRead: 1,
    cacheWrite: 0,
    totalTokens: input + output + 1,
    cost: {
      input: 0.005,
      output: 0.005,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0.01,
    },
  };
}
