import { describe, expect, it } from "vitest";

import { applyConversationEvent, applyLegacyEvent, createLiveTurn, finalizeLegacyTurn, mergeResultIntoTerminal, messagesToTranscriptRows } from "./transcript-adapter";
import type { AgentActionProposal } from "../agent-contract";

const proposal = (id: string): AgentActionProposal => ({
  id,
  toolName: "note_create",
  preview: { title: "创建笔记" },
  riskLevel: "low",
  status: "proposed",
  executionMode: "server",
});

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

  it("marks a missing initial stable event as a sequence gap", () => {
    const state = applyConversationEvent(
      createLiveTurn("chat-1", "local-request-1", "你好"),
      { type: "turn.started", chatId: "chat-1", turnId: "turn-1", seq: 2 },
    );

    expect(state.hasSequenceGap).toBe(true);
  });

  it("projects persisted messages using turnId when available", () => {
    expect(messagesToTranscriptRows([
      { id: "user-1", turnId: "turn-1", role: "user", content: "问题" },
      { id: "assistant-1", turnId: "turn-1", role: "assistant", content: "答案" },
    ])).toEqual([expect.objectContaining({ turnId: "turn-1", userContent: "问题", status: "completed" })]);
  });

  it("ignores duplicated legacy content events once the stable protocol claims the turn", () => {
    let state = createLiveTurn("chat-1", "local-request-1", "你好");
    state = applyConversationEvent(state, { type: "turn.started", chatId: "chat-1", turnId: "turn-1", seq: 1 });
    state = applyConversationEvent(state, { type: "assistant.text.delta", chatId: "chat-1", turnId: "turn-1", seq: 2, delta: "复" });
    state = applyLegacyEvent(state, { type: "text_delta", delta: "复" });
    state = applyLegacyEvent(state, { type: "tool_start", toolCallId: "tool-1", toolName: "content_search" });

    expect(state.blocks).toEqual([{ kind: "text", content: "复" }]);
  });

  it("renders a stable tool failure as an error until the protocol exposes isError", () => {
    let state = createLiveTurn("chat-1", "local-request-1", "搜索");
    state = applyConversationEvent(state, { type: "turn.started", chatId: "chat-1", turnId: "turn-1", seq: 1 });
    state = applyConversationEvent(state, { type: "tool.started", chatId: "chat-1", turnId: "turn-1", seq: 2, toolCallId: "tool-1", tool: "content_search" });
    state = applyConversationEvent(state, { type: "tool.completed", chatId: "chat-1", turnId: "turn-1", seq: 3, toolCallId: "tool-1", display: { label: "搜索知识库失败" } });

    expect(state.blocks).toEqual([{ kind: "tool", toolCallId: "tool-1", display: "搜索知识库失败", status: "error" }]);
  });

  it("replaces raw internal error payloads with product error copy", () => {
    let state = createLiveTurn("chat-1", "local-request-1", "你好");
    state = applyConversationEvent(state, { type: "turn.started", chatId: "chat-1", turnId: "turn-1", seq: 1 });
    state = applyConversationEvent(state, {
      type: "turn.failed",
      chatId: "chat-1",
      turnId: "turn-1",
      seq: 2,
      error: { code: "provider_unavailable", message: 'got status: UNAVAILABLE. {"error":{"code":503}}', retryable: true },
      retryable: true,
    });

    expect(state.terminal?.error).toEqual({ message: "Agent 暂时遇到问题，请重试。", retryable: true });

    const persisted = messagesToTranscriptRows([
      { id: "user-1", turnId: "turn-1", role: "user", content: "问题", status: "failed", error: { message: "Agent worker lease expired", retryable: true } },
    ]);
    expect(persisted[0]?.error?.message).toBe("Agent 暂时遇到问题，请重试。");

    const friendly = finalizeLegacyTurn(createLiveTurn("chat-1", "t", "你好"), { error: { code: "chat_not_found", message: "raw internal detail", retryable: false } });
    expect(friendly.error).toEqual({ message: "会话不存在。", retryable: false });
  });

  it("keeps a failed turn's user row from stealing the next turn's assistant", () => {
    const rows = messagesToTranscriptRows([
      { id: "user-1", turnId: "turn-1", role: "user", content: "失败的问题", status: "failed", error: { message: "服务中断", retryable: true } },
      { id: "user-2", turnId: "turn-2", role: "user", content: "第二个问题" },
      { id: "assistant-2", turnId: "turn-2", role: "assistant", content: "第二个答案" },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({ turnId: "turn-1", status: "failed", error: { message: "Agent 暂时遇到问题，请重试。", retryable: true } }),
      expect.objectContaining({ turnId: "turn-2", userContent: "第二个问题", status: "completed" }),
    ]);
    expect(rows[1]?.assistant).toEqual([{ kind: "text", content: "第二个答案" }]);
  });

  it("adopts legacy result proposals into a stable terminal row exactly once", () => {
    let state = createLiveTurn("chat-1", "local-request-1", "创建一条笔记");
    state = applyConversationEvent(state, { type: "turn.started", chatId: "chat-1", turnId: "turn-1", seq: 1 });
    state = applyConversationEvent(state, {
      type: "turn.completed",
      chatId: "chat-1",
      turnId: "turn-1",
      seq: 2,
      message: { id: "assistant-1", content: "准备好了。", status: "completed" },
    });

    const merged = mergeResultIntoTerminal(state.terminal!, {
      assistantMessage: { id: "assistant-1", content: "准备好了。" },
      proposals: [proposal("action-1")],
    });

    expect(merged.proposals).toEqual([proposal("action-1")]);
    expect(merged.assistant).toEqual([
      { kind: "text", content: "准备好了。" },
      { kind: "confirmation", proposal: proposal("action-1") },
    ]);
    expect(mergeResultIntoTerminal(merged, { proposals: [proposal("action-2")] })).toBe(merged);
    expect(mergeResultIntoTerminal(state.terminal!, null)).toBe(state.terminal);
  });

  it("folds a failed turn's orphan partial assistant entry into the failed row", () => {
    const rows = messagesToTranscriptRows([
      { id: "user-1", turnId: "turn-1", role: "user", content: "问题", status: "failed", error: { message: "服务中断", retryable: true } },
      { id: "assistant-partial", role: "assistant", content: "复" },
    ]);

    expect(rows).toEqual([expect.objectContaining({
      turnId: "turn-1",
      status: "failed",
      assistant: [{ kind: "text", content: "复" }],
      error: { message: "Agent 暂时遇到问题，请重试。", retryable: true },
    })]);
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
