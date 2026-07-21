import type { LanguageModel } from "ai";
import type { AgentActionProposal, AgentActor } from "./contracts";
import type { ApplicationPort } from "./ports";

export function createApplicationStub(overrides: Partial<ApplicationPort> = {}): ApplicationPort {
  let actionSequence = 0;
  return {
    chats: overrides.chats ?? {
      async prepareTurn(input) {
        return {
          history: [],
          userMessage: { id: "message-user-1", role: "user", content: input.content, status: "completed", createdAt: "2026-07-20T00:00:00.000Z" },
        };
      },
      async completeTurn(input) {
        return { id: "message-assistant-1", role: "assistant", content: input.content, status: "completed", createdAt: "2026-07-20T00:00:01.000Z" };
      },
    },
    content: overrides.content ?? {
      async search() {
        return { items: [] };
      },
      async read(_actor, resourceUri) {
        return { resourceUri, type: "note", id: "note-1", title: "Test", content: "Test", version: 1 };
      },
    },
    actions: overrides.actions ?? {
      async propose(input) {
        actionSequence += 1;
        return {
          id: `action-${actionSequence}`,
          toolName: input.toolName,
          preview: input.preview,
          riskLevel: input.riskLevel,
          status: "proposed",
          executionMode: input.clientEffect ? "client" : "server",
          ...(input.clientEffect ? { clientEffect: input.clientEffect } : {}),
        } satisfies AgentActionProposal;
      },
      async get(input) {
        return actionView(input.actionId, "proposed", "server");
      },
      async confirm(input) {
        return actionView(input.actionId, "confirmed", input.executionMode);
      },
      async cancel(input) {
        return actionView(input.actionId, "cancelled", "server");
      },
      async retry(input) {
        return actionView(input.actionId, "executing", input.executionMode);
      },
      async reportResult(input) {
        return actionView(input.actionId, input.status, "client");
      },
    },
  };
}

function actionView(id: string, status: "proposed" | "confirmed" | "executing" | "succeeded" | "failed" | "cancelled", executionMode: "server" | "client") {
  return {
    id,
    toolName: "note_update" as const,
    preview: { title: "Update note" },
    riskLevel: "medium" as const,
    status,
    executionMode,
  };
}

export const TEST_ACTOR: AgentActor = {
  userId: "user-1",
  source: "internal-agent",
  clientId: "session-1",
  scopes: ["content:read", "notes:write", "knowledge:write", "trash:write"],
};

export function unusedLanguageModel(): LanguageModel {
  throw new Error("Language model should not be requested in this test.");
}
