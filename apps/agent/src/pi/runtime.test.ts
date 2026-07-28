import { createFakeAIRuntime } from "@mewmo/ai";
import { describe, expect, it, vi } from "vitest";

import { AgentError } from "../errors";
import type {
  AgentObservabilityPort,
  AgentTurnObservation,
} from "../observability/port";
import type { ApplicationPort, SessionEntryRecord } from "../ports";
import { TEST_ACTOR, createApplicationStub } from "../testing";
import { assertAgentResponseSucceeded, assertSafeToolConfiguration, createAgentRuntime, pageContextInstruction } from "./runtime";

describe("pageContextInstruction", () => {
  it("keeps page metadata out of the persisted user prompt", () => {
    expect(pageContextInstruction({ targetType: "note", targetId: "note-1", draft: { content: "draft" } }))
      .toContain('{"kind":"mewmo_page_context","targetType":"note","targetId":"note-1","hasUnsavedDraft":true}');
    expect(pageContextInstruction(null)).not.toContain("用户请求：");
  });
});

describe("assertAgentResponseSucceeded", () => {
  it("accepts completed model responses", () => {
    expect(() =>
      assertAgentResponseSucceeded({ stopReason: "stop" }),
    ).not.toThrow();
  });

  it("turns provider failures into retryable dependency errors", () => {
    expect(() =>
      assertAgentResponseSucceeded({
        stopReason: "error",
        errorMessage: "fetch failed",
      }),
    ).toThrowError(
      expect.objectContaining<Partial<AgentError>>({
        code: "dependency_unavailable",
        retryable: true,
      }),
    );
  });

  it("preserves rate-limit and abort semantics", () => {
    expect(() =>
      assertAgentResponseSucceeded({
        stopReason: "error",
        errorMessage: "provider returned 429",
      }),
    ).toThrowError(
      expect.objectContaining<Partial<AgentError>>({ code: "rate_limited" }),
    );
    expect(() =>
      assertAgentResponseSucceeded({ stopReason: "aborted" }),
    ).toThrowError(
      expect.objectContaining<Partial<AgentError>>({ code: "timeout" }),
    );
  });
});

describe("assertSafeToolConfiguration", () => {
  it("accepts Mewmo domain tools", () => {
    expect(() => assertSafeToolConfiguration(
      ["content_search", "read_current_context", "note_update"],
      ["content_search", "read_current_context"],
    )).not.toThrow();
  });

  it.each(["bash", "read", "write", "edit", "grep", "find", "ls"])(
    "rejects the coding tool %s even when it is not active",
    (tool) => {
      expect(() => assertSafeToolConfiguration(["content_search", tool], ["content_search"]))
        .toThrow(/Coding tools are disabled/);
    },
  );
});

describe("Agent Runtime observability", () => {
  it("keeps the completed response and Usage when tracing updates and finalization fail", async () => {
    const entries = new Map<string, SessionEntryRecord>();
    let activeLeafId: string | null = null;
    let entrySeq = 0;
    const append = vi.fn(
      async ({
        entry,
      }: Parameters<ApplicationPort["sessions"]["append"]>[0]) => {
        const stored = { ...entry, entrySeq: ++entrySeq };
        entries.set(stored.entryId, stored);
        if (stored.type === "leaf" && isRecord(stored.payload)) {
          activeLeafId =
            typeof stored.payload.targetId === "string"
              ? stored.payload.targetId
              : null;
        }
        return stored;
      },
    );
    const application = createApplicationStub({
      sessions: {
        metadata: async () => ({
          id: "chat-1",
          createdAt: new Date().toISOString(),
          activeLeafId,
        }),
        append,
        get: async ({ entryId }) => entries.get(entryId),
        list: async ({ type }) =>
          [...entries.values()].filter((entry) => !type || entry.type === type),
      },
    });
    const observability: AgentObservabilityPort = {
      async observeTurn(_input, operation) {
        const result = await operation(throwingObservation());
        throw new Error(`export failed after ${String(result)}`);
      },
      async shutdown() {},
    };
    const runtime = createAgentRuntime({
      ai: createFakeAIRuntime({ agentResponses: ["observable answer"] }),
      application,
      maxSteps: 6,
      timeoutMs: 5_000,
      observability,
    });

    await expect(
      runtime.run({
        actor: TEST_ACTOR,
        chatId: "chat-1",
        turnId: "turn-1",
        workerId: "worker-1",
        request: {
          clientRequestId: "request-1",
          content: "private prompt",
          skillId: undefined,
          context: null,
        },
      }),
    ).resolves.toMatchObject({ text: "observable answer" });
    expect(
      append.mock.calls.some(
        ([input]) => input.usage?.operation === "agent.response",
      ),
    ).toBe(true);
  });

  it("marks failures that happen before the Harness is created", async () => {
    const failed = vi.fn();
    const observability: AgentObservabilityPort = {
      observeTurn: (_input, operation) =>
        operation({
          configure: vi.fn(),
          generationStarted: vi.fn(),
          generationCompleted: vi.fn(),
          toolStarted: vi.fn(),
          toolCompleted: vi.fn(),
          completed: vi.fn(),
          failed,
        }),
      async shutdown() {},
    };
    const runtime = createAgentRuntime({
      ai: createFakeAIRuntime(),
      application: createApplicationStub({
        skills: {
          list: async () => {
            throw new AgentError(
              "dependency_unavailable",
              "Skills unavailable.",
            );
          },
        },
      }),
      maxSteps: 6,
      timeoutMs: 5_000,
      observability,
    });

    await expect(
      runtime.run({
        actor: TEST_ACTOR,
        chatId: "chat-1",
        turnId: "turn-1",
        workerId: "worker-1",
        request: {
          clientRequestId: "request-1",
          content: "private prompt",
          skillId: undefined,
          context: null,
        },
      }),
    ).rejects.toMatchObject({ code: "dependency_unavailable" });
    expect(failed).toHaveBeenCalledWith({
      code: "dependency_unavailable",
      retryable: true,
      providerCallCount: 0,
      generationCount: 0,
    });
  });
});

function throwingObservation(): AgentTurnObservation {
  const fail = () => {
    throw new Error("observer update failed");
  };
  return {
    configure: fail,
    generationStarted: fail,
    generationCompleted: fail,
    toolStarted: fail,
    toolCompleted: fail,
    completed: fail,
    failed: fail,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
