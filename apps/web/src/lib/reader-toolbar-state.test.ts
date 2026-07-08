import { describe, expect, it } from "vitest";
import { shouldRevealReaderToolbarTitle } from "./reader-toolbar-state";

describe("shouldRevealReaderToolbarTitle", () => {
  it("stays hidden while the source title is still visible inside the reader viewport", () => {
    expect(
      shouldRevealReaderToolbarTitle({
        scrollTop: 120,
        sourceTitleBottom: 58,
        viewportTop: 55,
      }),
    ).toBe(false);
  });

  it("reveals only after the source title has fully scrolled above the reader viewport", () => {
    expect(
      shouldRevealReaderToolbarTitle({
        scrollTop: 120,
        sourceTitleBottom: 55,
        viewportTop: 55,
      }),
    ).toBe(true);
  });

  it("keeps the numeric scrollTop fallback for views without a measurable title", () => {
    expect(shouldRevealReaderToolbarTitle(18)).toBe(false);
    expect(shouldRevealReaderToolbarTitle(19)).toBe(true);
  });
});
