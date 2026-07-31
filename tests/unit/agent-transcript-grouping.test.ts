import { describe, expect, it } from "vitest";

import { groupBlocks } from "../../apps/web/src/lib/agent/transcript-grouping";
import type { AssistantBlock } from "../../apps/web/src/lib/agent/types";

const text = (content: string): AssistantBlock => ({ kind: "text", content });

const tool = (
  id: string,
  status: "running" | "done" | "error" = "done",
): AssistantBlock => ({ kind: "tool", toolCallId: id, display: `工具 ${id}`, status });

describe("groupBlocks", () => {
  it("returns an empty list for no blocks", () => {
    expect(groupBlocks([])).toEqual([]);
  });

  it("keeps non-tool blocks as single groups with their original index", () => {
    const blocks = [text("a"), { kind: "thinking", content: "t" } as AssistantBlock, text("b")];
    expect(groupBlocks(blocks)).toEqual([
      { kind: "single", block: blocks[0], index: 0 },
      { kind: "single", block: blocks[1], index: 1 },
      { kind: "single", block: blocks[2], index: 2 },
    ]);
  });

  it("keeps a lone tool block as a single group (no collapsing shell)", () => {
    const blocks = [text("a"), tool("t1"), text("b")];
    const groups = groupBlocks(blocks);
    expect(groups).toEqual([
      { kind: "single", block: blocks[0], index: 0 },
      { kind: "single", block: blocks[1], index: 1 },
      { kind: "single", block: blocks[2], index: 2 },
    ]);
  });

  it("folds runs of ≥2 consecutive tool blocks into one tools group", () => {
    const blocks = [text("intro"), tool("t1"), tool("t2"), tool("t3"), text("outro")];
    const groups = groupBlocks(blocks);
    expect(groups).toHaveLength(3);
    expect(groups[1]).toEqual({
      kind: "tools",
      blocks: [blocks[1], blocks[2], blocks[3]],
      startIndex: 1,
      hasRunning: false,
    });
  });

  it("flags hasRunning when any step of the run is still running", () => {
    const blocks = [tool("t1", "done"), tool("t2", "running")];
    const groups = groupBlocks(blocks);
    expect(groups).toEqual([
      { kind: "tools", blocks: [blocks[0], blocks[1]], startIndex: 0, hasRunning: true },
    ]);
  });

  it("splits tool runs separated by text into distinct groups", () => {
    const blocks = [tool("t1"), tool("t2"), text("mid"), tool("t3"), tool("t4", "error")];
    const groups = groupBlocks(blocks);
    expect(groups.map((group) => group.kind)).toEqual(["tools", "single", "tools"]);
    const last = groups[2];
    if (last?.kind !== "tools") throw new Error("expected tools group");
    expect(last.startIndex).toBe(3);
    expect(last.hasRunning).toBe(false);
  });
});
