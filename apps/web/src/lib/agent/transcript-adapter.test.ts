import { describe, expect, it } from "vitest";

import { applyConversationEvent, applyLegacyEvent, createLiveTurn, finalizeLegacyTurn, messagesToTranscriptRows } from "./transcript-adapter";

describe("agent transcript adapter", () => {
  it("keeps tool activity and final text in one legacy turn", () => {
    let state = createLiveTurn("chat-1", "local-request-1", "查找相关笔记");
    state = applyLegacyEvent(state, { type: "tool_start", toolCallId: "tool-1", toolName: "content_search" });
    state = applyLegacyEvent(state, { type: "tool_end", toolCallId: "tool-1", toolName: "content_search", isError: false });
    state = applyLegacyEvent(state, { type: "text_delta", delta: "找到" });

    const row = finalizeLegacyTurn(state, {
      userMessage: { id: "user-1", content: "查找相关笔记" },
      assistantMessage: { id: "assistant-1", content: "找到两条相关笔记。" },
      proposals: [],
    });

    expect(row.status).toBe("completed");
    expect(row.assistant).toEqual([
      { kind: "tool", toolCallId: "tool-1", display: "已搜索工作区", status: "done" },
      { kind: "text", content: "找到两条相关笔记。" },
    ]);
  });

  it("validates chat and turn identity and settles stable terminal events", () => {
    let state = createLiveTurn("chat-1", "local-request-1", "你好");
    state = applyConversationEvent(state, { type: "turn.started", chatId: "chat-1", turnId: "turn-1", seq: 1 });
    state = applyConversationEvent(state, { type: "assistant.text.delta", chatId: "chat-2", turnId: "turn-1", seq: 2, delta: "错误会话" });
    state = applyConversationEvent(state, { type: "assistant.text.delta", chatId: "chat-1", turnId: "turn-2", seq: 2, delta: "错误 Turn" });
    state = applyConversationEvent(state, { type: "assistant.text.delta", chatId: "chat-1", turnId: "turn-1", seq: 2, delta: "你" });
    state = applyConversationEvent(state, { type: "assistant.text.delta", chatId: "chat-1", turnId: "turn-1", seq: 2, delta: "重复" });
    state = applyConversationEvent(state, {
      type: "turn.completed",
      chatId: "chat-1",
      turnId: "turn-1",
      seq: 4,
      message: { id: "assistant-1", content: "你好。", status: "completed" },
    });

    expect(state.hasSequenceGap).toBe(true);
    expect(state.lastSeq).toBe(4);
    expect(state.terminal).toMatchObject({ turnId: "turn-1", status: "completed", userContent: "你好" });
    expect(state.terminal?.assistant).toEqual([{ kind: "text", content: "你好。" }]);
  });

  it("projects persisted messages using turnId when available", () => {
    expect(messagesToTranscriptRows([
      { id: "user-1", turnId: "turn-1", role: "user", content: "问题" },
      { id: "assistant-1", turnId: "turn-1", role: "assistant", content: "答案" },
    ])).toEqual([expect.objectContaining({ turnId: "turn-1", userContent: "问题", status: "completed" })]);
  });

  it("does not turn a persisted user-only turn into an empty success", () => {
    expect(messagesToTranscriptRows([
      { id: "user-1", turnId: "turn-1", role: "user", content: "问题" },
    ])).toEqual([expect.objectContaining({
      turnId: "turn-1",
      status: "failed",
      error: { message: "这次回复未完成。", retryable: false },
    })]);
  });
});
