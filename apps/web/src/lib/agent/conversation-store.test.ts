import { describe, expect, it } from "vitest";

import type { AgentActionProposal } from "../agent-contract";
import { replaceTranscriptProposals, upsertTranscriptRow } from "./conversation-store";
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
