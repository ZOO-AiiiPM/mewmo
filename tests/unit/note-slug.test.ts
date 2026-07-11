import { describe, expect, it } from "vitest";

import { createNoteSlug, decodeNoteSlug } from "../../apps/web/src/lib/note-slug";

describe("note slug", () => {
  it("tracks English and Chinese note titles instead of falling back to untitled", () => {
    expect(createNoteSlug("Renamed Note")).toBe("renamed-note");
    expect(createNoteSlug("测试一下效果")).toBe("测试一下效果");
    expect(createNoteSlug("  产品 / 设计  ")).toBe("产品-设计");
  });

  it("keeps untitled as the empty-title fallback", () => {
    expect(createNoteSlug("   ")).toBe("untitled");
  });

  it("decodes a URL-encoded Unicode slug before database lookup", () => {
    expect(decodeNoteSlug("codex-%E4%B8%AD%E6%96%87-url")).toBe("codex-中文-url");
  });

  it("leaves malformed path input untouched", () => {
    expect(decodeNoteSlug("broken-%E4")).toBe("broken-%E4");
  });
});
