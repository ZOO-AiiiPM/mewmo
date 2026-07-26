import type { SessionTreeEntry } from "@earendil-works/pi-agent-core";
import { describe, expect, it } from "vitest";

import { findLatestCompletedAssistantEntry } from "./session-storage";

describe("findLatestCompletedAssistantEntry", () => {
  it("selects the final assistant response after a tool call", () => {
    const entries = [
      messageEntry("user-1", "user", "总结当前笔记"),
      messageEntry("assistant-tool", "assistant", ""),
      { type: "tool_result", id: "tool-result", parentId: "assistant-tool", timestamp: new Date().toISOString() },
      messageEntry("assistant-final", "assistant", "最终总结"),
    ] as SessionTreeEntry[];

    expect(findLatestCompletedAssistantEntry(entries)?.id).toBe("assistant-final");
  });

  it("does not treat an intermediate tool-use message as the final response", () => {
    const entries = [
      messageEntry("user-1", "user", "总结当前笔记"),
      messageEntry("assistant-tool", "assistant", ""),
    ] as SessionTreeEntry[];

    expect(findLatestCompletedAssistantEntry(entries)).toBeUndefined();
  });
});

function messageEntry(id: string, role: "user" | "assistant", text: string) {
  return {
    type: "message",
    id,
    parentId: null,
    timestamp: new Date().toISOString(),
    message: role === "user"
      ? { role, content: [{ type: "text", text }], timestamp: Date.now() }
      : {
          role,
          content: text ? [{ type: "text", text }] : [{ type: "toolCall", id: "tool-1", name: "read_current_context", arguments: {} }],
          api: "google-generative-ai",
          provider: "google",
          model: "gemini-flash-latest",
          stopReason: text ? "stop" : "toolUse",
          timestamp: Date.now(),
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        },
  };
}
