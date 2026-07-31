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
 * Regenerate truncates the chat from this turn and re-runs the prompt, so any
 * completed row with a real server turn id qualifies (optimistic `live-` /
 * `failed-` ids cannot be located server-side). Failed rows keep their
 * dedicated retry path.
 */
export function canRegenerateRow(row: TranscriptRow, hasLiveRow: boolean): boolean {
  return !hasLiveRow
    && row.status === "completed"
    && row.userContent.trim().length > 0
    && !row.turnId.startsWith("live-")
    && !row.turnId.startsWith("failed-");
}
