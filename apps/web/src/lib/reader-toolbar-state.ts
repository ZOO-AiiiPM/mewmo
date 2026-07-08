export interface ReaderToolbarTitleVisibilityState {
  scrollTop: number;
  sourceTitleBottom?: number | null;
  viewportTop?: number | null;
  threshold?: number;
}

export function shouldRevealReaderToolbarTitle(
  state: number | ReaderToolbarTitleVisibilityState,
  threshold = 18,
) {
  if (typeof state === "number") return state > threshold;

  if (
    typeof state.sourceTitleBottom === "number" &&
    Number.isFinite(state.sourceTitleBottom) &&
    typeof state.viewportTop === "number" &&
    Number.isFinite(state.viewportTop)
  ) {
    return state.sourceTitleBottom <= state.viewportTop;
  }

  return state.scrollTop > (state.threshold ?? threshold);
}
