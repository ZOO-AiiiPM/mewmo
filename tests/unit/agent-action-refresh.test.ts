import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  planWorkspaceRefresh,
  refreshWorkspaceAfterAgentAction,
} from "../../apps/web/src/lib/agent/agent-action-refresh";
import type { AgentActionProposal } from "../../apps/web/src/lib/agent-contract";
import {
  getWorkspaceResource,
  setWorkspaceResource,
} from "../../apps/web/src/lib/workspace-data-cache";
import { workspaceResourceKeys } from "../../apps/web/src/lib/workspace-resource-keys";

const keys = workspaceResourceKeys;

function action(overrides: Partial<AgentActionProposal>): AgentActionProposal {
  return {
    id: "action-1",
    toolName: "knowledge_base_create",
    status: "succeeded",
    riskLevel: "medium",
    executionMode: "server",
    preview: {},
    ...overrides,
  };
}

describe("planWorkspaceRefresh (#10-F)", () => {
  it("refreshes the knowledge base list after knowledge_base_create", () => {
    const plan = planWorkspaceRefresh(action({ toolName: "knowledge_base_create" }));
    expect(plan.refreshKeys).toEqual([keys.knowledgeBases()]);
    expect(plan.invalidateKeys).toEqual([]);
    expect(plan.invalidatePrefixes).toEqual([]);
  });

  it("refreshes note lists after note_create", () => {
    const plan = planWorkspaceRefresh(action({ toolName: "note_create" }));
    expect(plan.refreshKeys).toEqual([keys.notesList(), keys.todayList()]);
  });

  it("invalidates the note detail for note_update targets", () => {
    const plan = planWorkspaceRefresh(action({
      toolName: "note_update",
      preview: { targets: [{ type: "note", id: "n1" }, { type: "knowledge_base", id: "kb1" }] },
    }));
    expect(plan.invalidateKeys).toEqual([keys.noteDetail("n1")]);
    expect(plan.refreshKeys).toContain(keys.notesList());
  });

  it("invalidates knowledge tree/content prefixes after note_move", () => {
    const plan = planWorkspaceRefresh(action({ toolName: "note_move" }));
    expect(plan.refreshKeys).toEqual([keys.notesList(), keys.knowledgeBases()]);
    expect(plan.invalidatePrefixes).toEqual(["knowledge:tree:", "knowledge:contents:"]);
  });

  it("falls back to refreshing every workspace list for unknown write tools", () => {
    const plan = planWorkspaceRefresh(action({ toolName: "future_tool" }));
    expect(plan.refreshKeys).toEqual([
      keys.notesList(), keys.todayList(), keys.trashList(), keys.knowledgeBases(),
    ]);
    expect(plan.invalidatePrefixes).toEqual(["knowledge:tree:", "knowledge:contents:"]);
  });
});

describe("refreshWorkspaceAfterAgentAction (#10-F)", () => {
  const dispatched: Array<string[]> = [];

  beforeEach(() => {
    dispatched.length = 0;
    if (typeof globalThis.CustomEvent === "undefined") {
      (globalThis as Record<string, unknown>).CustomEvent = class {
        type: string;
        detail: unknown;
        constructor(type: string, init?: { detail?: unknown }) {
          this.type = type;
          this.detail = init?.detail;
        }
      };
    }
    (globalThis as Record<string, unknown>).window = {
      dispatchEvent: (event: { detail?: { keys?: string[] } }) => {
        dispatched.push(event.detail?.keys ?? []);
        return true;
      },
    };
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
  });

  it("invalidates detail caches, keeps list caches, and broadcasts refresh keys", () => {
    setWorkspaceResource(keys.noteDetail("n1"), { id: "n1" });
    setWorkspaceResource(keys.notesList(), [{ id: "n1" }]);

    refreshWorkspaceAfterAgentAction(action({
      id: "action-invalidate",
      toolName: "note_update",
      preview: { targets: [{ type: "note", id: "n1" }] },
    }));

    // detail is hard-invalidated; the list stays for flicker-free refetch
    expect(getWorkspaceResource(keys.noteDetail("n1"))).toBeNull();
    expect(getWorkspaceResource(keys.notesList())).not.toBeNull();
    expect(dispatched).toEqual([[keys.notesList(), keys.todayList()]]);
  });

  it("ignores non-succeeded statuses", () => {
    setWorkspaceResource(keys.noteDetail("n2"), { id: "n2" });
    for (const status of ["proposed", "confirmed", "executing", "failed", "cancelled"] as const) {
      refreshWorkspaceAfterAgentAction(action({
        id: `action-${status}`,
        toolName: "note_update",
        status,
        preview: { targets: [{ type: "note", id: "n2" }] },
      }));
    }
    expect(getWorkspaceResource(keys.noteDetail("n2"))).not.toBeNull();
    expect(dispatched).toEqual([]);
  });

  it("handles each action id once even if succeeded is reported repeatedly", () => {
    const succeeded = action({ id: "action-dedupe", toolName: "knowledge_base_create" });
    refreshWorkspaceAfterAgentAction(succeeded);
    refreshWorkspaceAfterAgentAction(succeeded);
    expect(dispatched).toEqual([[keys.knowledgeBases()]]);
  });
});
