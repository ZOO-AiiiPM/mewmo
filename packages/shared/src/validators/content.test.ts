import { describe, expect, it } from "vitest";

import {
  createClipSchema,
  createFeedEntrySchema,
  createFeedSchema,
  createNoteSchema,
  syncPullSchema,
  syncPushSchema,
  updateClipSchema,
  updateFeedSchema,
  updateNoteSchema,
} from "./content";

describe("content validators", () => {
  it("accepts valid note input", () => {
    const note = createNoteSchema.parse({
      slug: "hello",
      title: "Hello",
      content: "Body",
    });

    expect(note.title).toBe("Hello");
  });

  it("requires valid feed urls", () => {
    expect(() => createFeedSchema.parse({ url: "not-a-url", title: "Bad" })).toThrow();
  });

  it("requires update notes to include at least one mutable field", () => {
    expect(() => updateNoteSchema.parse({})).toThrow();
  });

  it("accepts clips with optional metadata", () => {
    const clip = createClipSchema.parse({
      url: "https://example.com/a",
      title: "A",
      content: "",
    });

    expect(clip.url).toContain("https://");
  });

  it("requires update clips to include at least one mutable field", () => {
    expect(() => updateClipSchema.parse({})).toThrow();
    expect(updateClipSchema.parse({ title: "Saved article" }).title).toBe("Saved article");
  });

  it("accepts feed entry creation payloads", () => {
    const entry = createFeedEntrySchema.parse({
      feedId: "feed-1",
      title: "Article",
      url: "https://example.com/a",
      content: "Body",
    });
    expect(entry.feedId).toBe("feed-1");
  });

  it("validates sync pull and push envelopes", () => {
    expect(syncPullSchema.parse({ cursor: "2026-07-03T00:00:00.000Z" }).cursor).toContain(
      "2026",
    );
    expect(
      syncPushSchema.parse({
        mutations: [{ entity: "note", op: "update", id: "note-1", data: { title: "A" } }],
      }).mutations[0]?.entity,
    ).toBe("note");
  });

  it("requires update feeds to include at least one mutable field", () => {
    expect(() => updateFeedSchema.parse({})).toThrow();
    expect(updateFeedSchema.parse({ refreshInterval: 7200 }).refreshInterval).toBe(7200);
  });
});
