import { describe, expect, it } from "vitest";

import {
  getInitialTitleSelectionMode,
  normalizeTitleInputText,
  normalizeTitleText,
  titleKeyAction,
} from "../../apps/web/src/components/editor/title-ui";

describe("note editor title UI", () => {
  it("normalizes the title to a single line with an Untitled fallback", () => {
    expect(normalizeTitleText("  First line\nSecond line  ")).toBe("First line Second line");
    expect(normalizeTitleText(" \n\t ")).toBe("Untitled");
  });

  it("preserves trailing and repeated spaces while editing", () => {
    expect(normalizeTitleInputText("Title ")).toBe("Title ");
    expect(normalizeTitleInputText("Title  next")).toBe("Title  next");
    expect(normalizeTitleInputText("Title\u00a0")).toBe("Title\u00a0");
    expect(normalizeTitleInputText("First\nSecond")).toBe("First Second");
  });

  it("selects the whole default title when a new Untitled note opens", () => {
    expect(getInitialTitleSelectionMode("Untitled")).toBe("select-all");
    expect(getInitialTitleSelectionMode("Existing note")).toBe("caret-end");
  });

  it("commits title and moves into the body on a plain Enter", () => {
    expect(titleKeyAction({ key: "Enter" })).toBe("commit-and-focus-body");
    expect(titleKeyAction({ key: "Enter", isComposing: false, keyCode: 13 })).toBe("commit-and-focus-body");
    expect(titleKeyAction({ key: "a" })).toBe("allow");
  });

  it("allows Enter while an IME composition is active (拼音候选未上屏)", () => {
    expect(titleKeyAction({ key: "Enter", isComposing: true })).toBe("allow");
    expect(titleKeyAction({ key: "Enter", isComposing: true, keyCode: 13 })).toBe("allow");
  });

  it("allows the Safari composition-commit Enter (keyCode 229)", () => {
    expect(titleKeyAction({ key: "Enter", isComposing: false, keyCode: 229 })).toBe("allow");
  });

  it("allows Enter on the composition-close boundary even when both flags are set", () => {
    expect(titleKeyAction({ key: "Enter", isComposing: true, keyCode: 229 })).toBe("allow");
  });

  it("commits after the composition has fully ended", () => {
    expect(titleKeyAction({ key: "Enter", isComposing: false, keyCode: 13 })).toBe("commit-and-focus-body");
  });

  it("allows non-Enter keys without committing", () => {
    expect(titleKeyAction({ key: "a" })).toBe("allow");
    expect(titleKeyAction({ key: "Process", isComposing: false, keyCode: 229 })).toBe("allow");
  });
});
