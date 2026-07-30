import { describe, expect, it } from "vitest";

import { sendContextChip } from "../../apps/web/src/lib/agent/conversation-store";
import {
  applyConversationEvent,
  createLiveTurn,
  finalizeLegacyTurn,
  messagesToTranscriptRows,
} from "../../apps/web/src/lib/agent/transcript-adapter";
import type { PersistedMessage } from "../../apps/web/src/lib/agent/types";

const chip = { kind: "note", title: "周报草稿" };

describe("transcript context chip (#6)", () => {
  it("derives the chip from the send context resource", () => {
    expect(sendContextChip({
      content: "总结这篇",
      context: { resource: { type: "note", id: "n1", title: "周报草稿" } },
    })).toEqual(chip);

    expect(sendContextChip({ content: "hi" })).toBeUndefined();
    expect(sendContextChip({ content: "hi", context: null })).toBeUndefined();

    expect(sendContextChip({
      content: "hi",
      context: { resource: { type: "clip", id: "c1" } },
    })).toEqual({ kind: "clip", title: "" });
  });

  it("keeps the chip on the row finalized from a legacy result", () => {
    const turn = createLiveTurn("chat-1", "turn-1", "总结这篇", chip);
    const completed = finalizeLegacyTurn(turn, { assistantMessage: { content: "好的" } });
    expect(completed.contextChip).toEqual(chip);

    const failed = finalizeLegacyTurn(turn, { error: { message: "boom" } });
    expect(failed.contextChip).toEqual(chip);
  });

  it("does not add a chip when the send had no context", () => {
    const turn = createLiveTurn("chat-1", "turn-1", "总结这篇");
    const completed = finalizeLegacyTurn(turn, { assistantMessage: { content: "好的" } });
    expect(completed.contextChip).toBeUndefined();
  });

  it("keeps the chip on stable turn.completed / turn.failed terminal rows", () => {
    const base = createLiveTurn("chat-1", "live-1", "总结这篇", chip);
    const started = applyConversationEvent(base, {
      type: "turn.started", chatId: "chat-1", turnId: "turn-9", seq: 1,
    });
    const done = applyConversationEvent(started, {
      type: "turn.completed",
      chatId: "chat-1",
      turnId: "turn-9",
      seq: 2,
      message: { id: "m1", role: "assistant", content: "好的", status: "completed", createdAt: "2026-07-30T00:00:00Z" },
    });
    expect(done.terminal?.contextChip).toEqual(chip);

    const failed = applyConversationEvent(started, {
      type: "turn.failed",
      chatId: "chat-1",
      turnId: "turn-9",
      seq: 2,
      error: { code: "internal", message: "boom", retryable: true },
      retryable: true,
    });
    expect(failed.terminal?.contextChip).toEqual(chip);
  });

  it("maps persisted contextAttachments back to a chip on reload", () => {
    const messages: PersistedMessage[] = [
      {
        id: "u1",
        turnId: "turn-1",
        role: "user",
        content: "总结这篇",
        contextAttachments: [{ targetType: "note", title: "周报草稿" }],
      },
      { id: "a1", turnId: "turn-1", role: "assistant", content: "好的", status: "completed" },
      { id: "u2", turnId: "turn-2", role: "user", content: "无上下文" },
      { id: "a2", turnId: "turn-2", role: "assistant", content: "收到", status: "completed" },
    ];

    const rows = messagesToTranscriptRows(messages);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.contextChip).toEqual(chip);
    expect(rows[1]?.contextChip).toBeUndefined();
  });
});
