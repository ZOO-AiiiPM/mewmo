import { describe, expect, it } from "vitest";

import {
  createClipSchema,
  createFeedEntrySchema,
  createFeedSchema,
  createKnowledgeAssetSchema,
  createKnowledgeBaseSchema,
  createKnowledgeFolderSchema,
  createNoteSchema,
  importKnowledgeItemsSchema,
  syncPullSchema,
  syncPushSchema,
  updateClipSchema,
  updateFeedSchema,
  updateKnowledgeBaseSchema,
  updateKnowledgeFolderSchema,
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
    expect(() => createFeedSchema.parse({ url: "file:///etc/passwd", title: "Bad" })).toThrow();
    expect(() => updateFeedSchema.parse({ url: "ftp://example.com/feed.xml" })).toThrow();
  });

  it("rejects clip and feed fetch URLs containing credentials", () => {
    expect(() => createClipSchema.parse({
      url: "https://user:password@example.com/article",
      title: "Bad",
    })).toThrow();
    expect(() => updateClipSchema.parse({ url: "https://user@example.com/article" })).toThrow();
  });

  it("defaults feeds to article type and accepts media feeds", () => {
    expect(createFeedSchema.parse({ url: "https://example.com/feed.xml", title: "Example" }).type).toBe(
      "article",
    );
    expect(
      updateFeedSchema.parse({ type: "media" }).type,
    ).toBe("media");
    expect(() => createFeedSchema.parse({ url: "https://example.com/feed.xml", title: "Example", type: "book" })).toThrow();
  });

  it("requires update notes to include at least one mutable field", () => {
    expect(() => updateNoteSchema.parse({})).toThrow();
  });

  it("accepts clips with optional metadata", () => {
    const clip = createClipSchema.parse({
      url: "https://example.com/a",
      title: "A",
    });

    expect(clip.url).toContain("https://");
    expect(clip.content).toBe("");
    expect(
      createClipSchema.parse({
        url: "https://example.com/a",
        title: "A",
        coverImage: "https://example.com/cover.jpg",
        excerpt: "Body excerpt",
      }).excerpt,
    ).toBe("Body excerpt");
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

  it("validates knowledge base create and update payloads", () => {
    expect(
      createKnowledgeBaseSchema.parse({
        title: "产品设计",
        icon: "book",
      }),
    ).toEqual({ title: "产品设计", icon: "book" });
    expect(updateKnowledgeBaseSchema.parse({ title: "技术笔记" }).title).toBe("技术笔记");
    expect(() => createKnowledgeBaseSchema.parse({ title: "" })).toThrow();
    expect(() => updateKnowledgeBaseSchema.parse({})).toThrow();
  });

  it("limits knowledge folders to the prototype four-level tree", () => {
    expect(
      createKnowledgeFolderSchema.parse({
        name: "竞品分析",
        parentId: "folder-1",
        depth: 3,
      }).depth,
    ).toBe(3);
    expect(() =>
      createKnowledgeFolderSchema.parse({
        name: "第五层",
        parentId: "folder-4",
        depth: 4,
      }),
    ).toThrow();
    expect(updateKnowledgeFolderSchema.parse({ name: "海外" }).name).toBe("海外");
    expect(() => updateKnowledgeFolderSchema.parse({})).toThrow();
  });

  it("validates knowledge base import selections from notes, clips, and feed entries", () => {
    const payload = importKnowledgeItemsSchema.parse({
      folderId: "folder-1",
      items: [
        { kind: "note", noteId: "note-1" },
        { kind: "clip", clipId: "clip-1" },
        { kind: "feed_entry", feedEntryId: "entry-1" },
      ],
    });

    expect(payload.items.map((item) => item.kind)).toEqual(["note", "clip", "feed_entry"]);
    expect(() =>
      importKnowledgeItemsSchema.parse({
        items: [{ kind: "clip", noteId: "wrong-field" }],
      }),
    ).toThrow();
  });

  it("validates knowledge base local asset placeholders for PDFs and ebooks", () => {
    expect(
      createKnowledgeAssetSchema.parse({
        folderId: null,
        title: "Design Systems Handbook",
        assetType: "pdf",
        summary: "设计系统从 0 到 1 的搭建",
      }).assetType,
    ).toBe("pdf");
    expect(
      createKnowledgeAssetSchema.parse({
        title: "About Face：交互设计精髓",
        assetType: "ebook",
      }).title,
    ).toContain("About Face");
    expect(() =>
      createKnowledgeAssetSchema.parse({
        title: "Audio note",
        assetType: "audio",
      }),
    ).toThrow();
  });
});
