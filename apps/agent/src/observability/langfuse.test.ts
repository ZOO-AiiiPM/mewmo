import type {
  LangfuseAgent,
  LangfuseGeneration,
  LangfuseTool,
} from "@langfuse/tracing";
import { describe, expect, it, vi } from "vitest";

import { loadAgentConfig } from "../config";
import {
  createConfiguredAgentObservability,
  createLangfuseObservability,
  privateUserId,
  redactLangfuseData,
} from "./langfuse";

const identitySecret = "test-secret-that-is-at-least-thirty-two-characters";
const langfuseConfig = {
  publicKey: "pk-test-not-real",
  secretKey: "sk-test-not-real",
  baseUrl: "https://cloud.langfuse.com",
  environment: "development",
  release: "commit-123",
  userHashSecret: identitySecret,
  shutdownTimeoutMs: 100,
};

describe("Langfuse Agent observability", () => {
  it("creates a private Turn hierarchy with usage and no content payload", async () => {
    const root = fakeRoot();
    const sdk = { start: vi.fn(), shutdown: vi.fn(async () => {}) };
    const propagated: unknown[] = [];
    const observability = createLangfuseObservability(langfuseConfig, {
      createSdk: () => sdk,
      startTurn: (operation) => operation(root.value),
      propagate: (input, operation) => {
        propagated.push(input);
        return operation();
      },
    });

    await observability.observeTurn(
      {
        userId: "raw-user-id",
        chatId: "chat-1",
        turnId: "turn-1",
        configuredMaxRetries: 2,
      },
      async (turn) => {
        turn.configure({
          purpose: "agent.chat",
          provider: "google",
          requestedModel: "gemini-flash",
        });
        turn.generationStarted({
          sequence: 1,
          operation: "agent.response",
          purpose: "agent.chat",
          provider: "google",
          requestedModel: "gemini-flash",
        });
        turn.generationCompleted({
          sequence: 1,
          operation: "agent.response",
          purpose: "agent.chat",
          provider: "google",
          requestedModel: "gemini-flash",
          responseModel: "gemini-flash-2026",
          stopReason: "stop",
          inputTokens: 12,
          outputTokens: 4,
          totalTokens: 17,
          cacheReadTokens: 2,
          cacheWriteTokens: 0,
          providerCostUsd: 0.01,
        });
        turn.toolStarted({ toolCallId: "tool-1", toolName: "content_read" });
        turn.toolCompleted({
          toolCallId: "tool-1",
          toolName: "content_read",
          isError: false,
        });
        turn.completed({ providerCallCount: 1, generationCount: 1 });
        return "answer";
      },
    );

    expect(sdk.start).toHaveBeenCalledOnce();
    expect(propagated).toEqual([
      expect.objectContaining({
        userId: privateUserId("raw-user-id", identitySecret),
        sessionId: "chat-1",
        metadata: { chatId: "chat-1", turnId: "turn-1" },
        version: "commit-123",
      }),
    ]);
    expect(root.startObservation).toHaveBeenCalledWith(
      "agent.generation.1",
      expect.objectContaining({
        model: "gemini-flash",
      }),
      { asType: "generation" },
    );
    expect(root.startObservation).toHaveBeenCalledWith(
      "agent.tool.content_read",
      {
        metadata: { toolCallId: "tool-1", toolName: "content_read" },
      },
      { asType: "tool" },
    );
    expect(root.children[0]?.update).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-flash-2026",
        usageDetails: {
          input: 12,
          output: 4,
          total: 17,
          cacheRead: 2,
          cacheWrite: 0,
        },
        costDetails: { total: 0.01 },
      }),
    );
    expect(root.children[1]?.update).toHaveBeenCalledWith({
      metadata: {
        toolCallId: "tool-1",
        toolName: "content_read",
        status: "completed",
      },
    });
    expect(root.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          providerCallCount: 1,
          generationCount: 1,
        }),
      }),
    );
    expect(
      JSON.stringify({
        propagated,
        root: root.calls(),
        children: root.children.map((child) => child.calls()),
      }),
    ).not.toMatch(/raw-user-id|private note|prompt|args|result|email/iu);
  });

  it("keeps raw identifiers stable only behind an HMAC", () => {
    const first = privateUserId("user-1", "salt-1");
    expect(first).toBe(privateUserId("user-1", "salt-1"));
    expect(first).not.toBe(privateUserId("user-1", "salt-2"));
    expect(first).not.toContain("user-1");
  });

  it("does not expose Agent errors to OpenTelemetry automatic exception capture", async () => {
    const privateError = new Error("provider response contains a private note");
    const startTurn = vi.fn(
      async (operation: (root: LangfuseAgent) => Promise<void>) => {
        await expect(operation(fakeRoot().value)).resolves.toBeUndefined();
      },
    );
    const observability = createLangfuseObservability(langfuseConfig, {
      createSdk: () => ({ start() {}, async shutdown() {} }),
      startTurn,
      propagate: (_input, operation) => operation(),
    });

    await expect(
      observability.observeTurn(
        {
          userId: "raw-user-id",
          chatId: "chat-1",
          turnId: "turn-1",
          configuredMaxRetries: 2,
        },
        async (turn) => {
          turn.failed({
            code: "dependency_unavailable",
            retryable: true,
            providerCallCount: 1,
            generationCount: 1,
          });
          throw privateError;
        },
      ),
    ).rejects.toBe(privateError);
    expect(startTurn).toHaveBeenCalledOnce();
  });

  it("redacts sensitive keys, credentials, bearer tokens, and email", () => {
    expect(
      redactLangfuseData({
        content: "private note",
        nested: {
          toolArgs: { noteId: "note-1" },
          owner: "person@example.com",
          authorization: "Bearer token-value",
          label: "key sk-1234567890",
        },
      }),
    ).toEqual({
      content: "[REDACTED]",
      nested: {
        toolArgs: "[REDACTED]",
        owner: "[REDACTED_EMAIL]",
        authorization: "[REDACTED]",
        label: "key [REDACTED_KEY]",
      },
    });
  });

  it("redacts metadata after the tracing SDK serializes it", () => {
    const serialized = JSON.stringify({
      chatId: "chat-1",
      nested: { content: "private note", email: "person@example.com" },
    });
    expect(JSON.parse(String(redactLangfuseData(serialized)))).toEqual({
      chatId: "chat-1",
      nested: { content: "[REDACTED]", email: "[REDACTED]" },
    });
  });

  it("falls back to no-op when SDK initialization fails", async () => {
    const warn = vi.fn();
    const config = loadAgentConfig({
      AGENT_IDENTITY_SECRET: identitySecret,
      LANGFUSE_PUBLIC_KEY: "pk-test",
      LANGFUSE_SECRET_KEY: "sk-test",
    });
    const observability = createConfiguredAgentObservability(config, {}, warn, {
      createSdk: () => {
        throw new Error("contains secret sk-do-not-log");
      },
      startTurn: vi.fn(),
      propagate: vi.fn(),
    });

    await expect(
      observability.observeTurn(
        {
          userId: "user-1",
          chatId: "chat-1",
          turnId: "turn-1",
          configuredMaxRetries: 2,
        },
        async () => "answer",
      ),
    ).resolves.toBe("answer");
    expect(warn).toHaveBeenCalledWith(
      "Langfuse initialization failed; Agent tracing is disabled.",
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain("sk-do-not-log");
  });

  it("disables tracing without stopping the Agent when only one key is configured", async () => {
    const warn = vi.fn();
    const config = loadAgentConfig({
      AGENT_IDENTITY_SECRET: identitySecret,
      LANGFUSE_SECRET_KEY: "sk-test-not-real",
    });
    const createSdk = vi.fn();
    const observability = createConfiguredAgentObservability(config, {}, warn, {
      createSdk,
      startTurn: vi.fn(),
      propagate: vi.fn(),
    });

    await expect(
      observability.observeTurn(
        {
          userId: "user-1",
          chatId: "chat-1",
          turnId: "turn-1",
          configuredMaxRetries: 2,
        },
        async () => "answer",
      ),
    ).resolves.toBe("answer");
    expect(createSdk).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      "Langfuse credentials are incomplete; Agent tracing is disabled.",
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain("sk-test-not-real");
  });

  it("does not fail shutdown when telemetry rejects", async () => {
    const warn = vi.fn();
    const observability = createLangfuseObservability(
      langfuseConfig,
      {
        createSdk: () => ({
          start() {},
          shutdown: async () => {
            throw new Error("offline");
          },
        }),
        startTurn: vi.fn(),
        propagate: vi.fn(),
      },
      warn,
    );

    await expect(observability.shutdown()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      "Langfuse shutdown did not complete; Agent shutdown continued.",
    );
  });
});

function fakeRoot() {
  const update = vi.fn();
  const children: Array<ReturnType<typeof fakeChild>> = [];
  const startObservation = vi.fn(
    (_name: string, _attributes: unknown, options: { asType: string }) => {
      const child = fakeChild();
      children.push(child);
      return options.asType === "generation"
        ? (child.value as unknown as LangfuseGeneration)
        : (child.value as unknown as LangfuseTool);
    },
  );
  return {
    value: { update, startObservation } as unknown as LangfuseAgent,
    update,
    startObservation,
    children,
    calls: () => ({
      update: update.mock.calls,
      startObservation: startObservation.mock.calls,
    }),
  };
}

function fakeChild() {
  const update = vi.fn();
  const end = vi.fn();
  return {
    value: { update, end },
    update,
    end,
    calls: () => ({ update: update.mock.calls, end: end.mock.calls }),
  };
}
