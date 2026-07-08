import { describe, expect, it } from "vitest";

import {
  noteContentDraftKey,
  readNoteContentDraft,
  removeNoteContentDraft,
  resolveInitialNoteContent,
  writeNoteContentDraft,
} from "../../apps/web/src/components/editor/note-draft-store";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("note content draft store", () => {
  it("stores unsynced note content by note id", () => {
    const storage = new MemoryStorage();

    writeNoteContentDraft("note-1", "![image](data:image/png;base64,abc)", storage);

    expect(readNoteContentDraft("note-1", storage)?.content).toBe(
      "![image](data:image/png;base64,abc)",
    );
  });

  it("prefers local draft content over stale server content", () => {
    expect(
      resolveInitialNoteContent("old cloud content", {
        content: "local image draft",
        updatedAt: Date.now(),
      }),
    ).toBe("local image draft");
  });

  it("clears the local draft after cloud save succeeds", () => {
    const storage = new MemoryStorage();
    writeNoteContentDraft("note-1", "draft", storage);

    removeNoteContentDraft("note-1", storage);

    expect(readNoteContentDraft("note-1", storage)).toBeNull();
  });

  it("drops corrupt draft records", () => {
    const storage = new MemoryStorage();
    storage.setItem(noteContentDraftKey("note-1"), JSON.stringify({ content: 1 }));

    expect(readNoteContentDraft("note-1", storage)).toBeNull();
    expect(storage.getItem(noteContentDraftKey("note-1"))).toBeNull();
  });
});
