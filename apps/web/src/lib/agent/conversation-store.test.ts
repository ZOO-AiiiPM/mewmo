import { describe, expect, it } from "vitest";

import { upsertTranscriptRow } from "./conversation-store";
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
});
