import { describe, expect, it } from "vitest";

import {
  noteDraftKey,
  readNoteDraft,
  removeNoteDraft,
  writeNoteDraft,
} from "../../apps/web/src/components/editor/note-draft-store";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

describe("note draft store", () => {
  it("stores full drafts by account and note", () => {
    const storage = new MemoryStorage();
    const draft = {
      userId: "user-1",
      noteId: "note-1",
      title: "Offline title",
      content: "Offline body",
      serverVersion: 4,
      updatedAt: 123,
    };

    expect(writeNoteDraft(draft, storage)).toEqual({ ok: true });
    expect(readNoteDraft("user-1", "note-1", storage)).toEqual(draft);
    expect(readNoteDraft("user-2", "note-1", storage)).toBeNull();
  });

  it("only clears the submitted draft revision", () => {
    const storage = new MemoryStorage();
    writeNoteDraft({ userId: "u", noteId: "n", title: "new", content: "body", serverVersion: 2, updatedAt: 2 }, storage);
    removeNoteDraft("u", "n", 1, storage);
    expect(readNoteDraft("u", "n", storage)?.updatedAt).toBe(2);
    removeNoteDraft("u", "n", 2, storage);
    expect(readNoteDraft("u", "n", storage)).toBeNull();
  });

  it("drops corrupt records", () => {
    const storage = new MemoryStorage();
    storage.setItem(noteDraftKey("u", "n"), JSON.stringify({ content: 1 }));
    expect(readNoteDraft("u", "n", storage)).toBeNull();
  });
});
