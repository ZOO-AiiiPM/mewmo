import { describe, expect, it } from "vitest";

import { shouldSendOnEnter } from "../../apps/web/src/lib/agent/composer-send-key";

describe("composer send key (#2 IME isolation)", () => {
  it("sends on a plain Enter", () => {
    expect(shouldSendOnEnter({ key: "Enter", shiftKey: false })).toBe(true);
    expect(shouldSendOnEnter({ key: "Enter", shiftKey: false, isComposing: false, keyCode: 13 })).toBe(true);
  });

  it("does not send while an IME composition is active (拼音候选未上屏)", () => {
    expect(shouldSendOnEnter({ key: "Enter", shiftKey: false, isComposing: true })).toBe(false);
  });

  it("does not send the Safari composition-commit Enter (keyCode 229)", () => {
    expect(shouldSendOnEnter({ key: "Enter", shiftKey: false, isComposing: false, keyCode: 229 })).toBe(false);
  });

  it("keeps Shift+Enter as newline", () => {
    expect(shouldSendOnEnter({ key: "Enter", shiftKey: true })).toBe(false);
  });

  it("ignores non-Enter keys", () => {
    expect(shouldSendOnEnter({ key: "a", shiftKey: false })).toBe(false);
    expect(shouldSendOnEnter({ key: "Process", shiftKey: false, keyCode: 229 })).toBe(false);
  });
});
