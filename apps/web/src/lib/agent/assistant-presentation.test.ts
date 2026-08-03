import { describe, expect, it } from "vitest";

import { assistantPresentation, processInitiallyOpen, processOpenAfterTerminal, processSummary } from "./assistant-presentation";

describe("assistant ordered process presentation", () => {
  it("separates the ordered process from the final answer", () => {
    const presentation = assistantPresentation([
      { kind: "thinking", content: "先核对事实" },
      { kind: "text", content: "我先搜索工作区" },
      { kind: "tool", toolCallId: "tool-1", display: "搜索工作区", status: "done" },
      { kind: "thinking", content: "结合搜索结果" },
      { kind: "text", content: "最终回答" },
    ], true);

    expect(presentation.processBlocks).toEqual([
      { kind: "thinking", content: "先核对事实" },
      { kind: "text", content: "我先搜索工作区" },
      { kind: "tool", toolCallId: "tool-1", display: "搜索工作区", status: "done" },
      { kind: "thinking", content: "结合搜索结果" },
    ]);
    expect(presentation.finalBlocks).toEqual([{ kind: "text", content: "最终回答" }]);
  });

  it("keeps live generations exposed in event order and folds only reasoning and tools", () => {
    const presentation = assistantPresentation([
      { kind: "thinking", content: "第一步" },
      { kind: "text", content: "已有回答" },
      { kind: "thinking", content: "继续分析" },
    ], false);

    expect(presentation.orderedBlocks).toEqual([
      { kind: "thinking", content: "第一步" },
      { kind: "text", content: "已有回答" },
      { kind: "thinking", content: "继续分析" },
    ]);
    expect(presentation.processBlocks).toEqual([
      { kind: "thinking", content: "第一步" },
      { kind: "thinking", content: "继续分析" },
    ]);
    expect(presentation.finalBlocks).toEqual([{ kind: "text", content: "已有回答" }]);
    expect(presentation.streamingProcessIndex).toBe(2);
    expect(presentation.streamingFinalIndex).toBe(-1);
  });

  it("keeps a live text generation outside the folded process", () => {
    const presentation = assistantPresentation([
      { kind: "thinking", content: "分析完成" },
      { kind: "text", content: "答案流" },
    ], false);

    expect(presentation.processBlocks).toEqual([{ kind: "thinking", content: "分析完成" }]);
    expect(presentation.finalBlocks).toEqual([{ kind: "text", content: "答案流" }]);
    expect(presentation.orderedBlocks).toEqual([
      { kind: "thinking", content: "分析完成" },
      { kind: "text", content: "答案流" },
    ]);
    expect(presentation.streamingProcessIndex).toBe(1);
  });

  it("does not create thinking content when no thinking event arrived", () => {
    const presentation = assistantPresentation([
      { kind: "text", content: "直接回答" },
    ], false);

    expect(presentation.processBlocks).toEqual([]);
    expect(presentation.finalBlocks).toEqual([{ kind: "text", content: "直接回答" }]);
    expect(presentation.orderedBlocks).toEqual([{ kind: "text", content: "直接回答" }]);
    expect(presentation.streamingProcessIndex).toBe(0);
  });

  it("does not reconcile failed or stopped generations into a success disclosure", () => {
    const blocks = [
      { kind: "text", content: "阶段回答" } as const,
      { kind: "thinking", content: "继续分析" } as const,
      { kind: "text", content: "中断前回答" } as const,
    ];

    const presentation = assistantPresentation(blocks, false);

    expect(presentation.orderedBlocks).toEqual(blocks);
    expect(presentation.finalBlocks).toEqual([
      { kind: "text", content: "阶段回答" },
      { kind: "text", content: "中断前回答" },
    ]);
  });

  it("labels all terminal states with whole-turn duration only when both bounds exist", () => {
    const timing = { startedAt: "2026-08-03T00:00:00.000Z", completedAt: "2026-08-03T00:00:02.400Z" };
    expect(processSummary({ status: "streaming" })).toBe("思考中");
    expect(processSummary({ status: "completed", ...timing })).toBe("已完成 · 2.4 秒");
    expect(processSummary({ status: "failed", ...timing })).toBe("未完成 · 2.4 秒");
    expect(processSummary({ status: "completed", stopped: true, ...timing })).toBe("已停止 · 2.4 秒");
    expect(processSummary({ status: "completed" })).toBe("已完成");
  });

  it("opens streaming, failed, and stopped process while completed history starts folded", () => {
    expect(processInitiallyOpen({ status: "streaming" })).toBe(true);
    expect(processInitiallyOpen({ status: "completed" })).toBe(false);
    expect(processOpenAfterTerminal({ status: "failed" })).toBe(true);
    expect(processOpenAfterTerminal({ status: "completed", stopped: true })).toBe(true);
    expect(processOpenAfterTerminal({ status: "completed" })).toBe(false);
  });
});
