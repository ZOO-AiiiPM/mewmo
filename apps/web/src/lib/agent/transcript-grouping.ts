/**
 * Pure render-layer grouping for assistant blocks: consecutive tool blocks
 * fold into one group so the transcript can collapse finished tool runs.
 * Does not change the AssistantBlock data structure.
 */

import type { AssistantBlock } from "./types";

export type ToolAssistantBlock = Extract<AssistantBlock, { kind: "tool" }>;

export type AssistantBlockGroup =
  | { kind: "single"; block: AssistantBlock; index: number }
  | { kind: "tools"; blocks: ToolAssistantBlock[]; startIndex: number; hasRunning: boolean };

export function groupBlocks(blocks: AssistantBlock[]): AssistantBlockGroup[] {
  const groups: AssistantBlockGroup[] = [];
  let index = 0;

  while (index < blocks.length) {
    const block = blocks[index];
    if (!block) break;

    if (block.kind !== "tool") {
      groups.push({ kind: "single", block, index });
      index += 1;
      continue;
    }

    const startIndex = index;
    const run: ToolAssistantBlock[] = [];
    while (index < blocks.length) {
      const candidate = blocks[index];
      if (!candidate || candidate.kind !== "tool") break;
      run.push(candidate);
      index += 1;
    }

    const first = run[0];
    if (run.length === 1 && first) {
      // A lone tool renders as a plain status line — no collapsing shell.
      groups.push({ kind: "single", block: first, index: startIndex });
      continue;
    }

    groups.push({
      kind: "tools",
      blocks: run,
      startIndex,
      hasRunning: run.some((item) => item.status === "running"),
    });
  }

  return groups;
}
