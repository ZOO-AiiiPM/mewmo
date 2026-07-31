import { describe, expect, it } from "vitest";

import { assistantRowCopyText, canRegenerateRow } from "./row-actions";
import type { TranscriptRow } from "./types";

const baseRow = (overrides: Partial<TranscriptRow> = {}): TranscriptRow => ({
  turnId: "turn-1",
  userContent: "问题",
  assistant: [],
  status: "completed",
  proposals: [],
  ...overrides,
});

describe("assistantRowCopyText", () => {
  it("joins text blocks and skips tool/thinking/confirmation chrome", () => {
    const row = baseRow({
      assistant: [
        { kind: "text", content: "第一段" },
        { kind: "tool", toolCallId: "t1", display: "搜索笔记", status: "done" },
        { kind: "thinking", content: "内部推理" },
        { kind: "text", content: "第二段" },
      ],
    });
    expect(assistantRowCopyText(row)).toBe("第一段\n\n第二段");
  });

  it("returns an empty string when there is no copyable text", () => {
    const row = baseRow({
      assistant: [{ kind: "tool", toolCallId: "t1", display: "搜索笔记", status: "done" }],
    });
    expect(assistantRowCopyText(row)).toBe("");
  });

  it("drops whitespace-only text blocks", () => {
    const row = baseRow({ assistant: [{ kind: "text", content: "  " }, { kind: "text", content: "有效内容" }] });
    expect(assistantRowCopyText(row)).toBe("有效内容");
  });
});

describe("canRegenerateRow", () => {
  it("allows any completed row with a prompt", () => {
    expect(canRegenerateRow(baseRow(), false)).toBe(true);
  });

  it("rejects optimistic rows without a server turn id", () => {
    expect(canRegenerateRow(baseRow({ turnId: "live-3" }), false)).toBe(false);
    expect(canRegenerateRow(baseRow({ turnId: "failed-2" }), false)).toBe(false);
  });

  it("rejects while a live row is streaming", () => {
    expect(canRegenerateRow(baseRow(), true)).toBe(false);
  });

  it("rejects failed rows (they use the dedicated retry path)", () => {
    expect(canRegenerateRow(baseRow({ status: "failed" }), false)).toBe(false);
  });

  it("rejects rows without an original prompt", () => {
    expect(canRegenerateRow(baseRow({ userContent: " " }), false)).toBe(false);
  });
});
