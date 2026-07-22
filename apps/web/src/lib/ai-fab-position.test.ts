import { describe, expect, it } from "vitest";
import {
  AI_FAB_DEFAULT_BOTTOM,
  AI_FAB_DRAG_THRESHOLD,
  clampAiFabBottom,
  isAiFabDragMoved,
} from "./ai-fab-position";

describe("clampAiFabBottom", () => {
  it("keeps the prototype default bottom position", () => {
    expect(AI_FAB_DEFAULT_BOTTOM).toBe(80);
    expect(clampAiFabBottom(AI_FAB_DEFAULT_BOTTOM, 720)).toBe(80);
  });

  it("keeps the draggable cat inside the viewport", () => {
    expect(clampAiFabBottom(-20, 720)).toBe(16);
    expect(clampAiFabBottom(900, 720)).toBe(652);
  });
});

describe("isAiFabDragMoved (ZOO-54 click-vs-drag discrimination)", () => {
  it("treats a clean tap (no travel) as a click", () => {
    expect(isAiFabDragMoved(100, 100, 100, 100)).toBe(false);
  });

  it("tolerates sub-threshold jitter on either axis (touch/trackpad tap)", () => {
    // Just under the threshold on each axis — must NOT count as a drag.
    const t = AI_FAB_DRAG_THRESHOLD;
    expect(isAiFabDragMoved(100, 100, 100 + (t - 1), 100)).toBe(false);
    expect(isAiFabDragMoved(100, 100, 100, 100 + (t - 1))).toBe(false);
    expect(isAiFabDragMoved(100, 100, 100 - (t - 1), 100 + (t - 1))).toBe(false);
  });

  it("classifies travel at/over the threshold as a drag", () => {
    const t = AI_FAB_DRAG_THRESHOLD;
    expect(isAiFabDragMoved(100, 100, 100, 100 + t)).toBe(true);
    expect(isAiFabDragMoved(100, 100, 100 + t, 100)).toBe(true);
    // Diagonal jitter that exceeds the threshold on the combined move.
    expect(isAiFabDragMoved(100, 100, 100 + t, 100 + t)).toBe(true);
  });

  it("respects a custom threshold", () => {
    expect(isAiFabDragMoved(0, 0, 5, 0, 4)).toBe(true);
    expect(isAiFabDragMoved(0, 0, 3, 0, 4)).toBe(false);
  });
});
