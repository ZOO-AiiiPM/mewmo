import type { AssistantBlock } from "./types";

export interface AssistantPresentation {
  processBlocks: AssistantBlock[];
  finalBlocks: AssistantBlock[];
  streamingProcessIndex: number;
  streamingFinalIndex: number;
}

export function assistantPresentation(
  blocks: AssistantBlock[],
  isStreaming: boolean,
): AssistantPresentation {
  const processBlocks: AssistantBlock[] = [];
  const finalBlocks: AssistantBlock[] = [];
  let finalTextIndex = -1;

  if (isStreaming) {
    return {
      processBlocks: blocks,
      finalBlocks,
      streamingProcessIndex: blocks.length - 1,
      streamingFinalIndex: -1,
    };
  }

  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    if (blocks[index]?.kind === "text") {
      const onlyConfirmationsFollow = blocks.slice(index + 1).every((block) => block.kind === "confirmation");
      if (onlyConfirmationsFollow) finalTextIndex = index;
      break;
    }
  }

  blocks.forEach((block, index) => {
    if (index === finalTextIndex || block.kind === "confirmation") finalBlocks.push(block);
    else processBlocks.push(block);
  });

  return {
    processBlocks,
    finalBlocks,
    streamingProcessIndex: -1,
    streamingFinalIndex: -1,
  };
}

export function processSummary(row: Pick<import("./types").TranscriptRow, "status" | "stopped" | "startedAt" | "completedAt">) {
  const state = row.stopped ? "已停止" : row.status === "failed" ? "未完成" : row.status === "completed" ? "已完成" : "思考中";
  if (row.status === "streaming") return state;
  const duration = turnDurationSeconds(row.startedAt, row.completedAt);
  return duration === null ? state : `${state} · ${duration} 秒`;
}

export function processInitiallyOpen(row: Pick<import("./types").TranscriptRow, "status" | "stopped">) {
  return row.status === "streaming" || row.status === "failed" || Boolean(row.stopped);
}

export function processOpenAfterTerminal(row: Pick<import("./types").TranscriptRow, "status" | "stopped">) {
  return row.status !== "completed" || Boolean(row.stopped);
}

export function turnDurationSeconds(startedAt?: string, completedAt?: string): string | null {
  if (!startedAt || !completedAt) return null;
  const durationMs = Date.parse(completedAt) - Date.parse(startedAt);
  if (!Number.isFinite(durationMs) || durationMs < 0) return null;
  return (durationMs / 1000).toFixed(1).replace(/\.0$/, "");
}
