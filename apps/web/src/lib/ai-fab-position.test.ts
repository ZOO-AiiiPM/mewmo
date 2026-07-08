import { describe, expect, it } from "vitest";
import {
  AI_FAB_DEFAULT_BOTTOM,
  clampAiFabBottom,
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
