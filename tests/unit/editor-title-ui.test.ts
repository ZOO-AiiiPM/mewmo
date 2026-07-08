import { describe, expect, it } from "vitest";

import {
  getInitialTitleSelectionMode,
  normalizeTitleText,
  titleKeyAction,
} from "../../apps/web/src/components/editor/title-ui";

describe("note editor title UI", () => {
  it("normalizes the title to a single line with an Untitled fallback", () => {
    expect(normalizeTitleText("  First line\nSecond line  ")).toBe("First line Second line");
    expect(normalizeTitleText(" \n\t ")).toBe("Untitled");
  });

  it("selects the whole default title when a new Untitled note opens", () => {
    expect(getInitialTitleSelectionMode("Untitled")).toBe("select-all");
    expect(getInitialTitleSelectionMode("Existing note")).toBe("caret-end");
  });

  it("commits title and moves into the body on Enter", () => {
    expect(titleKeyAction("Enter")).toBe("commit-and-focus-body");
    expect(titleKeyAction("a")).toBe("allow");
  });
});
