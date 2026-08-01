import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentActionProposal } from "../agent-contract";
import { replaceTranscriptProposals, truncatePersistedConversation, truncateTranscriptRows, upsertTranscriptRow } from "./conversation-store";
import type { TranscriptRow } from "./types";

const row = (turnId: string, status: TranscriptRow["status"]): TranscriptRow => ({
  turnId,
  userContent: "问题",
  assistant: [],
  status,
  proposals: [],
});

describe("conversation row reconciliation", () => {
  it("replaces the matching turn instead of appending a duplicate", () => {
    expect(upsertTranscriptRow([row("turn-1", "streaming")], row("turn-1", "completed"))).toEqual([
      row("turn-1", "completed"),
    ]);
  });

  it("appends a different turn", () => {
    expect(upsertTranscriptRow([row("turn-1", "completed")], row("turn-2", "completed"))).toHaveLength(2);
  });

  it("hydrates persisted confirmation blocks with the current action state", () => {
    const stored = proposal("action-1", "proposed");
    const current = proposal("action-1", "succeeded");
    const rows = replaceTranscriptProposals([{
      ...row("turn-1", "completed"),
      proposals: [stored],
      assistant: [{ kind: "confirmation", proposal: stored }],
    }], [current]);

    expect(rows[0]?.proposals).toEqual([current]);
    expect(rows[0]?.assistant).toEqual([{ kind: "confirmation", proposal: current }]);
  });
});

describe("conversation replacement", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("removes the target turn and its local suffix", () => {
    expect(truncateTranscriptRows([row("turn-1", "completed"), row("turn-2", "completed"), row("turn-3", "completed")], "turn-2"))
      .toEqual([row("turn-1", "completed")]);
  });

  it("leaves local history untouched when the target is absent", () => {
    const rows = [row("turn-1", "completed")];
    expect(truncateTranscriptRows(rows, "missing")).toBe(rows);
  });

  it("fails closed on non-OK and network truncate failures", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(truncatePersistedConversation("chat/1", "turn-2")).resolves.toBe(false);
    await expect(truncatePersistedConversation("chat/1", "turn-2")).resolves.toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("/api/agent/chats/chat%2F1/truncate", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ turnId: "turn-2" }),
    }));
  });
});

function proposal(id: string, status: AgentActionProposal["status"]): AgentActionProposal {
  return {
    id,
    toolName: "note_create",
    preview: { title: "创建笔记" },
    riskLevel: "low",
    status,
    executionMode: "server",
  };
}
