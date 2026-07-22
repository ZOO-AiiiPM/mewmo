import { describe, expect, it, vi } from "vitest";

import type { AgentRequestContext } from "./ports";
import { createPiToolRegistry } from "./pi/tools";
import { ALL_TOOL_NAMES, READ_TOOL_NAMES, WRITE_TOOL_NAMES } from "./tools";
import { TEST_ACTOR, createApplicationStub } from "./testing";

function requestContext(overrides: Partial<AgentRequestContext["request"]> = {}): AgentRequestContext {
  return {
    actor: TEST_ACTOR,
    chatId: "chat-1",
    turnId: "turn-1",
    workerId: "worker-1",
    request: { clientRequestId: "request-1", content: "test", skillId: undefined, context: null, ...overrides },
  };
}

describe("Agent tool policy", () => {
  it("never registers permanent delete or Feed deletion tools", () => {
    expect(ALL_TOOL_NAMES).not.toContain("permanent_delete");
    expect(ALL_TOOL_NAMES).not.toContain("delete_feed");
    expect(ALL_TOOL_NAMES).not.toContain("delete_feed_entry");
    expect(WRITE_TOOL_NAMES).toContain("note_move_to_trash");
  });

  it("exposes only read tools to Deep Insight policy", () => {
    expect(READ_TOOL_NAMES).toEqual(["read_current_context", "content_search", "content_read"]);
    expect(READ_TOOL_NAMES.some((name) => (WRITE_TOOL_NAMES as readonly string[]).includes(name))).toBe(false);
  });

  it("returns unsaved draft as the latest current context without reading the database", async () => {
    const read = vi.fn();
    const tools = createPiToolRegistry({
      application: createApplicationStub({ content: { search: vi.fn(async () => ({ items: [] })), read } }),
      context: requestContext({ context: { targetType: "note", targetId: "note-1", draft: { title: "Draft", content: "latest", baseVersion: 8 } } }),
      proposals: [],
    });
    const tool = tools.find((candidate) => candidate.name === "read_current_context")!;
    const result = await tool.execute("call-1", {}, undefined);
    expect(result.details).toMatchObject({ source: "draft", content: "latest", version: 8 });
    expect(read).not.toHaveBeenCalled();
  });

  it("write tools freeze a Pi toolCall id into an AiAction proposal", async () => {
    const propose = vi.fn(async (input) => ({ id: "action-1", toolName: input.toolName, preview: input.preview, riskLevel: input.riskLevel, status: "proposed" as const, executionMode: "server" as const }));
    const proposals: never[] = [];
    const tools = createPiToolRegistry({ application: createApplicationStub({ actions: { ...createApplicationStub().actions, propose } }), context: requestContext(), proposals });
    const tool = tools.find((candidate) => candidate.name === "note_move_to_trash")!;
    const result = await tool.execute("pi-call-1", { noteId: "note-1", expectedVersion: 3 }, undefined);
    expect(result.details).toMatchObject({ actionId: "action-1", status: "proposed", requiresConfirmation: true });
    expect(propose).toHaveBeenCalledWith(expect.objectContaining({ turnId: "turn-1", toolCallId: "pi-call-1", toolName: "note_move_to_trash", expectedVersion: 3 }));
    expect(proposals).toHaveLength(1);
  });

  it("freezes a current-note edit as a client draft effect", async () => {
    const proposals: never[] = [];
    const tools = createPiToolRegistry({
      application: createApplicationStub(),
      context: requestContext({ context: { targetType: "note", targetId: "note-1", draft: { content: "old", baseVersion: 4 } } }),
      proposals,
    });
    const tool = tools.find((candidate) => candidate.name === "note_update")!;
    const result = await tool.execute("call-1", { noteId: "note-1", content: "new", expectedVersion: 4 }, undefined);
    expect(result.details).toMatchObject({ status: "proposed", clientEffect: { kind: "note_draft_patch", noteId: "note-1", content: "new", baseVersion: 4 } });
  });
});
