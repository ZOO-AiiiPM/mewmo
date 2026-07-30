/**
 * Message action helpers for transcript rows (copy / regenerate).
 * Pure functions so the hover action bar logic stays unit-testable.
 */

import type { TranscriptRow } from "./types";

/**
 * Plain-text form of an assistant reply for the copy action.
 * Only text blocks are included — tool chrome / confirmations are UI-only.
 */
export function assistantRowCopyText(row: TranscriptRow): string {
  return row.assistant
    .filter((block): block is Extract<TranscriptRow["assistant"][number], { kind: "text" }> => block.kind === "text")
    .map((block) => block.content.trim())
    .filter((content) => content.length > 0)
    .join("\n\n");
}

/**
 * Whether a stable row qualifies for the regenerate action.
 * Only the last completed turn (with an original prompt, no live stream) can
 * be regenerated: the backend has no truncate/regenerate endpoint, so retry
 * re-sends the same prompt as a new turn.
 */
export function canRegenerateRow(row: TranscriptRow, isLastStableRow: boolean, hasLiveRow: boolean): boolean {
  return isLastStableRow
    && !hasLiveRow
    && row.status === "completed"
    && row.userContent.trim().length > 0;
}
