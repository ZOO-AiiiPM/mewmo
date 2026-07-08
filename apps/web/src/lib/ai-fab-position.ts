export const AI_FAB_DEFAULT_BOTTOM = 80;
export const AI_FAB_HEIGHT = 52;
export const AI_FAB_EDGE_GAP = 16;

export function clampAiFabBottom(
  bottom: number,
  viewportHeight: number,
  fabHeight = AI_FAB_HEIGHT,
  edgeGap = AI_FAB_EDGE_GAP,
) {
  const maxBottom = Math.max(edgeGap, viewportHeight - fabHeight - edgeGap);
  return Math.min(Math.max(bottom, edgeGap), maxBottom);
}
