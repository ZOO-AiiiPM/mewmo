import { describe, expect, it } from "vitest";

import { agentConversationEventSchema } from "./agent-events";

describe("agentConversationEventSchema", () => {
  it("accepts stable turn events with an ordered identity", () => {
    expect(agentConversationEventSchema.parse({
      type: "assistant.text.delta",
      chatId: "chat-1",
      turnId: "turn-1",
      seq: 2,
      delta: "hello",
    })).toMatchObject({ type: "assistant.text.delta", seq: 2 });
  });

  it("rejects events without a positive sequence", () => {
    expect(() => agentConversationEventSchema.parse({
      type: "turn.started",
      chatId: "chat-1",
      turnId: "turn-1",
      seq: 0,
    })).toThrow();
  });

  it("does not allow raw tool arguments or results in public events", () => {
    const parsed = agentConversationEventSchema.parse({
      type: "tool.completed",
      chatId: "chat-1",
      turnId: "turn-1",
      seq: 3,
      toolCallId: "tool-1",
      arguments: { noteId: "secret" },
      result: { content: "private note" },
      display: { label: "已读取当前笔记", details: ["目标：当前笔记", "结果：读取成功"] },
    });

    expect(parsed).not.toHaveProperty("arguments");
    expect(parsed).not.toHaveProperty("result");
    expect(parsed.display.details).toEqual(["目标：当前笔记", "结果：读取成功"]);
  });
});
