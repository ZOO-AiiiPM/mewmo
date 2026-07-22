import type { AgentActor } from "./contracts";
import type { ApplicationPort } from "./ports";

export const TEST_ACTOR: AgentActor = {
  userId: "user-1",
  source: "internal-agent",
  clientId: "test-client",
  scopes: ["content:read", "notes:write", "knowledge:write", "trash:write"],
};

export function createApplicationStub(overrides: Partial<ApplicationPort> = {}): ApplicationPort {
  const base: ApplicationPort = {
    turns: {
      begin: async () => ({ turnId: "turn-1" }),
      complete: async () => ({
        userMessage: { id: "entry-user", role: "user", content: "user", status: "completed", createdAt: new Date().toISOString() },
        assistantMessage: { id: "entry-assistant", role: "assistant", content: "assistant", status: "completed", createdAt: new Date().toISOString() },
      }),
      fail: async () => {},
    },
    sessions: {
      metadata: async () => ({ id: "chat-1", createdAt: new Date().toISOString(), activeLeafId: null }),
      append: async ({ entry }) => ({ ...entry, entrySeq: 1 }),
      get: async () => undefined,
      list: async () => [],
    },
    skills: { list: async () => [] },
    content: {
      search: async () => ({ items: [] }),
      read: async () => ({ resourceUri: "mewmo://notes/note-1", type: "note", id: "note-1", title: "Note", content: "content", version: 1 }),
    },
    actions: {
      propose: async (input) => ({ id: "action-1", toolName: input.toolName, preview: input.preview, riskLevel: input.riskLevel, status: "proposed", executionMode: input.clientEffect ? "client" : "server", ...(input.clientEffect ? { clientEffect: input.clientEffect } : {}) }),
      get: async () => { throw new Error("not implemented"); },
      confirm: async () => { throw new Error("not implemented"); },
      cancel: async () => { throw new Error("not implemented"); },
      retry: async () => { throw new Error("not implemented"); },
      reportResult: async () => { throw new Error("not implemented"); },
    },
  };
  return {
    ...base,
    ...overrides,
    turns: { ...base.turns, ...overrides.turns },
    sessions: { ...base.sessions, ...overrides.sessions },
    skills: { ...base.skills, ...overrides.skills },
    content: { ...base.content, ...overrides.content },
    actions: { ...base.actions, ...overrides.actions },
  };
}
