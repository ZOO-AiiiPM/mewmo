import { describe, expect, it, vi } from "vitest";
import type { AgentRequestContext } from "./ports";
import { ALL_TOOL_NAMES, READ_TOOL_NAMES, WRITE_TOOL_NAMES, createToolRegistry } from "./tools";
import { TEST_ACTOR, createApplicationStub } from "./testing";

function requestContext(overrides: Partial<AgentRequestContext["request"]> = {}): AgentRequestContext {
  return {
    actor: TEST_ACTOR,
    chatId: "chat-1",
    history: [],
    request: {
      clientRequestId: "request-1",
      content: "test",
      skill: "general",
      context: null,
      ...overrides,
    },
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
    const application = createApplicationStub({
      content: {
        search: vi.fn(async () => ({ items: [] })),
        read,
      },
    });
    const tools = createToolRegistry({
      application,
      context: requestContext({
        context: { targetType: "note", targetId: "note-1", draft: { title: "Draft", content: "latest", baseVersion: 8 } },
      }),
      proposals: [],
    });
    const result = await tools.read_current_context!.execute?.({}, {} as never);
    expect(result).toMatchObject({ source: "draft", content: "latest", version: 8 });
    expect(read).not.toHaveBeenCalled();
  });

  it("write tools create a proposal and never execute a domain mutation", async () => {
    const propose = vi.fn(async (input) => ({
      id: "action-1",
      toolName: input.toolName,
      preview: input.preview,
      riskLevel: input.riskLevel,
      status: "proposed" as const,
      executionMode: "server" as const,
    }));
    const application = createApplicationStub({
      actions: {
        propose,
        get: vi.fn(),
        confirm: vi.fn(),
        cancel: vi.fn(),
        retry: vi.fn(),
        reportResult: vi.fn(),
      },
    });
    const proposals: never[] = [];
    const tools = createToolRegistry({ application, context: requestContext(), proposals });
    const result = await tools.note_move_to_trash!.execute?.({ noteId: "note-1", expectedVersion: 3 }, {} as never);
    expect(result).toMatchObject({ actionId: "action-1", status: "proposed", requiresConfirmation: true });
    expect(propose).toHaveBeenCalledWith(expect.objectContaining({ toolName: "note_move_to_trash", riskLevel: "high", expectedVersion: 3 }));
    expect(proposals).toHaveLength(1);
  });

  it("freezes a current-note edit as a client draft effect", async () => {
    const application = createApplicationStub();
    const proposals: never[] = [];
    const tools = createToolRegistry({
      application,
      context: requestContext({ context: { targetType: "note", targetId: "note-1", draft: { content: "old", baseVersion: 4 } } }),
      proposals,
    });
    const result = await tools.note_update!.execute?.({ noteId: "note-1", content: "new", expectedVersion: 4 }, {} as never);
    expect(result).toMatchObject({
      status: "proposed",
      clientEffect: { kind: "note_draft_patch", noteId: "note-1", content: "new", baseVersion: 4 },
    });
  });
});
