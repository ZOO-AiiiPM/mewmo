import { describe, expect, it } from "vitest";

import {
  buildKnowledgeCardView,
  classifyKnowledgeContentType,
  sortKnowledgeItemsForList,
} from "../../apps/web/src/lib/knowledge-content";

describe("knowledge content mapping", () => {
  it("maps note items to note cards", () => {
    expect(
      buildKnowledgeCardView({
        kind: "note",
        note: {
          id: "note-1",
          slug: "product-position",
          title: "产品定位：一只猫的陪伴感从哪来",
          summary: "不是把 AI 做成助手图标。",
          content: "正文",
          updatedAt: "2026-07-06T09:00:00.000Z",
          createdAt: "2026-07-06T09:00:00.000Z",
        },
      }),
    ).toMatchObject({
      title: "产品定位：一只猫的陪伴感从哪来",
      icon: "note",
      sourceBadge: null,
      href: "/notes/product-position",
    });
  });

  it("cleans markdown control syntax from note card summaries", () => {
    expect(
      buildKnowledgeCardView({
        kind: "note",
        note: {
          id: "note-md",
          slug: "markdown-noise",
          title: "Markdown noise",
          summary: null,
          content: [
            "# 一级标题",
            "![cover](https://example.com/cover.png)",
            "| 字段 | 值 |",
            "| --- | --- |",
            "| 状态 | `done` |",
            "- [x] **完成** 清洗",
          ].join("\n"),
        },
      }).summary,
    ).toBe("完成 清洗");
  });

  it("maps imported media clips to the media icon", () => {
    expect(
      buildKnowledgeCardView({
        kind: "clip",
        clip: {
          id: "clip-1",
          url: "https://sspai.com/post/1",
          title: "把信息管家做成陪伴：可爱的反义词不是严肃",
          summary: "为什么一个有性格的产品反而更容易被长期使用？",
          sourceName: "少数派",
          favicon: null,
          createdAt: "2026-07-06T06:00:00.000Z",
          updatedAt: "2026-07-06T06:00:00.000Z",
        },
      }),
    ).toMatchObject({
      icon: "media",
      sourceBadge: "bookmark",
      sourceText: "少数派",
      href: "/clips/clip-1",
    });
  });

  it("maps imported blog or article clips to the article icon", () => {
    expect(
      buildKnowledgeCardView({
        kind: "clip",
        clip: {
          id: "clip-blog",
          url: "https://example.dev/posts/agent-notes",
          title: "Agent Notes",
          summary: "个人博客文章。",
          sourceName: "example.dev",
          favicon: null,
          createdAt: "2026-07-06T06:00:00.000Z",
          updatedAt: "2026-07-06T06:00:00.000Z",
        },
      }),
    ).toMatchObject({
      icon: "doc",
      sourceBadge: "bookmark",
      sourceText: "example.dev",
    });
  });

  it("maps imported YouTube clips as video content with the clipped source badge", () => {
    expect(
      buildKnowledgeCardView({
        kind: "clip",
        clip: {
          id: "clip-2",
          url: "https://www.youtube.com/watch?v=figma",
          title: "Figma 如何做产品决策（设计负责人访谈）",
          summary: "从先发散再收敛到用原型代替评审文档。",
          sourceName: "YouTube",
          favicon: null,
          createdAt: "2026-07-05T06:00:00.000Z",
          updatedAt: "2026-07-05T06:00:00.000Z",
        },
      }),
    ).toMatchObject({
      icon: "video",
      sourceBadge: "bookmark",
      sourceText: "YouTube",
    });
  });

  it("uses subscription title on feed-entry cards and clip-style source text in readers", () => {
    expect(
      buildKnowledgeCardView({
        kind: "feed_entry",
        feedEntry: {
          id: "feed-entry-1",
          url: "https://www.woshipm.com/pd/1.html",
          title: "一文搞懂 Anthropic 最新论文",
          summary: "J-space 的解释。",
          sourceName: "woshipm.com",
          createdAt: "2026-07-08T01:35:00.000Z",
          feed: {
            title: "人人都是产品经理",
            type: "article",
          },
        },
      }),
    ).toMatchObject({
      sourceBadge: "rss",
      sourceText: "人人都是产品经理",
      readerSourceText: "woshipm.com",
    });
  });

  it("classifies knowledge items by readable content type", () => {
    expect(
      classifyKnowledgeContentType({
        kind: "note",
        note: {
          id: "note-1",
          slug: "note-1",
          title: "Note",
          content: "正文",
        },
      }),
    ).toBe("note");

    expect(
      classifyKnowledgeContentType({
        kind: "feed_entry",
        feedEntry: {
          id: "media-entry",
          url: "https://www.latepost.com/news/1",
          title: "晚点报道",
          sourceName: "晚点 LatePost",
          feed: {
            title: "晚点 LatePost",
            type: "media",
          },
        },
      }),
    ).toBe("media");

    expect(
      buildKnowledgeCardView({
        kind: "feed_entry",
        feedEntry: {
          id: "media-entry",
          url: "https://www.latepost.com/news/1",
          title: "晚点报道",
          sourceName: "latepost.com",
          feed: {
            title: "晚点 LatePost",
            type: "media",
          },
        },
      }),
    ).toMatchObject({
      icon: "media",
      sourceBadge: "rss",
    });

    expect(
      classifyKnowledgeContentType({
        kind: "asset",
        assetType: "ebook",
        title: "About Face",
      }),
    ).toBe("ebook");
  });

  it("maps local PDF and ebook assets to their prototype item icons", () => {
    expect(
      buildKnowledgeCardView({
        kind: "asset",
        assetType: "pdf",
        title: "Design Systems Handbook",
        summary: "设计系统从 0 到 1 的搭建。",
        createdAt: "2026-07-05T06:00:00.000Z",
      }),
    ).toMatchObject({ icon: "pdf", sourceBadge: null, sourceText: "从本地导入" });

    expect(
      buildKnowledgeCardView({
        kind: "asset",
        assetType: "ebook",
        title: "About Face：交互设计精髓",
        summary: "交互设计的目标、行为模型与界面细节。",
        createdAt: "2026-07-04T06:00:00.000Z",
      }),
    ).toMatchObject({ icon: "book", sourceBadge: null, sourceText: "从本地导入" });
  });

  it("sorts mixed knowledge lists by created time by default", () => {
    const sorted = sortKnowledgeItemsForList([
      { id: "position-first", kind: "note", position: 0, createdAt: "2026-07-06T12:01:00.000Z" },
      { id: "created-first", kind: "clip", position: 4, createdAt: "2026-07-06T12:05:00.000Z" },
    ]);

    expect(sorted.map((item) => item.id)).toEqual(["created-first", "position-first"]);
  });

  it("still supports explicit custom position sorting", () => {
    const sorted = sortKnowledgeItemsForList(
      [
        { id: "figma", kind: "clip", position: 2, updatedAt: "2026-07-06T12:03:00.000Z" },
        { id: "ebook", kind: "asset", position: 4, updatedAt: "2026-07-06T12:05:00.000Z" },
        { id: "note", kind: "note", position: 0, updatedAt: "2026-07-06T12:01:00.000Z" },
        { id: "pdf", kind: "asset", position: 3, updatedAt: "2026-07-06T12:04:00.000Z" },
        { id: "article", kind: "clip", position: 1, updatedAt: "2026-07-06T12:02:00.000Z" },
      ],
      "custom",
    );

    expect(sorted.map((item) => item.id)).toEqual(["note", "article", "figma", "pdf", "ebook"]);
  });

  it("still supports explicit updated-time sorting", () => {
    const sorted = sortKnowledgeItemsForList(
      [
        { id: "position-first", kind: "note", position: 0, updatedAt: "2026-07-06T12:01:00.000Z" },
        { id: "updated-first", kind: "clip", position: 4, updatedAt: "2026-07-06T12:05:00.000Z" },
      ],
      "updated",
    );

    expect(sorted.map((item) => item.id)).toEqual(["updated-first", "position-first"]);
  });
});
