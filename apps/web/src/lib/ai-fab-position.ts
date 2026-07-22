export const AI_FAB_DEFAULT_BOTTOM = 80;
export const AI_FAB_HEIGHT = 52;
export const AI_FAB_EDGE_GAP = 16;

/**
 * Pointer travel (px) beyond which a press on the AI FAB is treated as a drag
 * (reposition) rather than a click (open). Kept generous on purpose: touch and
 * trackpad taps routinely jitter 4–10px between pointerdown and pointerup, and
 * the old 4px value incorrectly classified those as drags and swallowed the
 * click. See ZOO-54.
 */
export const AI_FAB_DRAG_THRESHOLD = 10;

/**
 * Decide whether a FAB gesture has moved far enough to count as a drag.
 * Uses the larger of the horizontal/vertical deltas so jitter on either axis is
 * tolerated up to the threshold. Pure + exported for unit testing.
 */
export function isAiFabDragMoved(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  threshold: number = AI_FAB_DRAG_THRESHOLD,
): boolean {
  return (
    Math.abs(currentX - startX) >= threshold ||
    Math.abs(currentY - startY) >= threshold
  );
}

export function clampAiFabBottom(
  bottom: number,
  viewportHeight: number,
  fabHeight = AI_FAB_HEIGHT,
  edgeGap = AI_FAB_EDGE_GAP,
) {
  const maxBottom = Math.max(edgeGap, viewportHeight - fabHeight - edgeGap);
  return Math.min(Math.max(bottom, edgeGap), maxBottom);
}
