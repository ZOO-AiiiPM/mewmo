import type { LanguageModel } from "ai";
import type { AgentActionProposal, AgentActor } from "./contracts";
import type { ApplicationPort } from "./ports";

export function createApplicationStub(overrides: Partial<ApplicationPort> = {}): ApplicationPort {
  let actionSequence = 0;
  return {
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
          ...(input.clientEffect ? { clientEffect: input.clientEffect } : {}),
        } satisfies AgentActionProposal;
      },
      async confirm(input) {
        return { id: input.actionId, status: "confirmed", executionMode: input.executionMode };
      },
      async cancel(input) {
        return { id: input.actionId, status: "cancelled" };
      },
      async retry(input) {
        return { id: input.actionId, status: "executing", executionMode: input.executionMode ?? "server" };
      },
      async reportResult(input) {
        return { id: input.actionId, status: input.status };
      },
    },
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
