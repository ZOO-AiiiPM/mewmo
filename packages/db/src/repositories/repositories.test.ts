import { describe, expect, it, vi } from "vitest";

import { createAiChatsRepository } from "./ai-chats";
import { createFeedEntriesRepository } from "./feed-entries";
import { createFeedsRepository } from "./feeds";
import {
  KnowledgeFolderDepthError,
  KnowledgeImportDuplicateError,
  KnowledgeImportSourceError,
  KnowledgeImportTargetError,
  createKnowledgeBasesRepository,
} from "./knowledge-bases";
import { createNotesRepository } from "./notes";
import { createTagsRepository } from "./tags";
import { createTrashRepository } from "./trash";

describe("repositories", () => {
  it("scopes note lists to a user and active rows", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repo = createNotesRepository({ note: { findMany } });

    await repo.findByUserId("user-1");

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", deletedAt: null },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    });
  });

  it("soft deletes notes and bumps version", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repo = createNotesRepository({ note: { updateMany } });

    await repo.delete("user-1", "note-1");

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "note-1", userId: "user-1", deletedAt: null },
      data: { deletedAt: expect.any(Date), version: { increment: 1 } },
    });
  });

  it("finds queued, due, retryable, and stale feeds in a bounded batch", async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const repo = createFeedsRepository({ $queryRaw: queryRaw });

    await repo.findDueForRefresh(new Date("2026-06-25T08:00:00.000Z"), 50);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    const query = queryRaw.mock.calls[0]?.[0] as { strings?: string[]; values?: unknown[] };
    const sql = query.strings?.join(" ") ?? "";
    expect(sql).toContain("last_fetch_status = 'queued'");
    expect(sql).toContain("last_fetch_status IN ('idle', 'success')");
    expect(sql).toContain("last_fetch_status IN ('error', 'partial')");
    expect(sql).toContain("last_fetch_status = 'fetching'");
    expect(sql).toContain('user_id AS "userId"');
    expect(sql).toContain('last_fetched_at AS "lastFetchedAt"');
    expect(sql).toContain('last_fetch_status AS "lastFetchStatus"');
    expect(sql).toContain('last_fetch_started_at AS "lastFetchStartedAt"');
    expect(sql).toContain('last_seen_entry_url AS "lastSeenEntryUrl"');
    expect(sql).not.toContain("SELECT *");
    expect(sql).toContain("LIMIT");
    expect(query.values).toContain(50);
  });

  it("lists feeds by type with unread counts", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repo = createFeedsRepository({ feed: { findMany } });

    await repo.findByUserIdWithUnreadCount("user-1", "media");

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", deletedAt: null, type: "media" },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            entries: { where: { deletedAt: null, readAt: null } },
          },
        },
      },
    });
  });

  it("permanently deletes feeds with ownership and active-row guards", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const repo = createFeedsRepository({ feed: { deleteMany } });

    await repo.delete("user-1", "feed-1");

    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: "feed-1", userId: "user-1", deletedAt: null },
    });
  });

  it("purges a legacy soft-deleted duplicate before recreating a feed", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const repo = createFeedsRepository({ feed: { deleteMany } });

    await repo.purgeDeletedDuplicate("user-1", "https://example.com/feed", "article");

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        url: "https://example.com/feed",
        type: "article",
        deletedAt: { not: null },
      },
    });
  });

  it("marks feed entries as read with user and soft-delete guards", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repo = createFeedEntriesRepository({ feedEntry: { updateMany } });
    const readAt = new Date("2026-06-25T08:00:00.000Z");

    await repo.markAsRead("user-1", "entry-1", readAt);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "entry-1", userId: "user-1", deletedAt: null },
      data: { readAt, version: { increment: 1 } },
    });
  });

  it("does not write summary while refreshing feed source fields", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "entry-1", summary: "AI result" });
    const repo = createFeedEntriesRepository({
      feedEntry: {
        findFirst: vi.fn().mockResolvedValue({ id: "entry-1" }),
        upsert,
      },
    });

    await repo.upsertSourceByFeedUrl("user-1", {
      feedId: "feed-1",
      title: "Updated title",
      url: "https://example.com/one",
      content: "Updated body",
      excerpt: "Publisher description",
    });

    const args = upsert.mock.calls[0]?.[0] as { create: Record<string, unknown>; update: Record<string, unknown> };
    expect(args.create.summary).toBeNull();
    expect(args.update).not.toHaveProperty("summary");
  });

  it("lists feed entries across a typed feed collection", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repo = createFeedEntriesRepository({ feedEntry: { findMany } });

    await repo.findByUserFeedType("user-1", "article");

    expect(findMany).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        deletedAt: null,
        feed: { userId: "user-1", deletedAt: null, type: "article" },
      },
      include: { feed: { select: { id: true, title: true, url: true, favicon: true, type: true } } },
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    });
  });

  it("attaches tags only after a user-scoped tag lookup", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "tag-1" });
    const create = vi.fn().mockResolvedValue({ id: "taggable-1" });
    const repo = createTagsRepository({ tag: { findFirst }, taggable: { create } });

    await repo.attachTag("user-1", "tag-1", "note-1", "note");

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "tag-1", userId: "user-1", deletedAt: null },
    });
    expect(create).toHaveBeenCalledWith({
      data: { tagId: "tag-1", taggableId: "note-1", taggableType: "note" },
    });
  });

  it("creates AI chats with user ownership", async () => {
    const create = vi.fn().mockResolvedValue({ id: "chat-1" });
    const repo = createAiChatsRepository({ aiChat: { create } });

    await repo.create("user-1", { title: "Research" });

    expect(create).toHaveBeenCalledWith({
      data: { title: "Research", userId: "user-1" },
    });
  });

  it("finds or creates the default AI chat for a user", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockResolvedValue({ id: "chat-default" });
    const repo = createAiChatsRepository({ aiChat: { findFirst, create } });

    await repo.findOrCreateDefault("user-1");

    expect(findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", deletedAt: null, title: "mewmo" },
      include: {
        sessionEntries: {
          where: { type: "message" },
          orderBy: { entrySeq: "asc" },
          include: { attachments: true },
        },
        turns: {
          where: { status: "succeeded" },
          select: { assistantEntryId: true, output: true },
        },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
          include: { contextAttachments: true },
        },
      },
    });
    expect(create).toHaveBeenCalledWith({
      data: { title: "mewmo", userId: "user-1" },
      include: {
        sessionEntries: {
          where: { type: "message" },
          orderBy: { entrySeq: "asc" },
          include: { attachments: true },
        },
        turns: {
          where: { status: "succeeded" },
          select: { assistantEntryId: true, output: true },
        },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
          include: { contextAttachments: true },
        },
      },
    });
  });

  it("updates AI messages inside a chat with status metadata and version bump", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repo = createAiChatsRepository({ aiMessage: { updateMany } });

    await repo.updateMessage("chat-1", "message-1", {
      content: "Final answer",
      status: "completed",
      metadata: { model: "glm-5.1" },
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "message-1", chatId: "chat-1", deletedAt: null },
      data: {
        content: "Final answer",
        status: "completed",
        metadata: { model: "glm-5.1" },
        version: { increment: 1 },
      },
    });
  });

  it("projects Pi session messages and turn proposals instead of stale legacy messages", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "chat-1",
      title: "mewmo",
      messages: [{ id: "legacy", role: "assistant", content: "legacy" }],
      sessionEntries: [{
        entryId: "entry-1",
        type: "message",
        timestamp: new Date("2026-07-22T00:00:00.000Z"),
        payload: { message: { role: "assistant", content: [{ type: "text", text: "Pi answer" }] } },
        attachments: [],
      }],
      turns: [{ assistantEntryId: "entry-1", output: { response: { proposals: [{ id: "action-1" }] } } }],
    });
    const chat = await createAiChatsRepository({ aiChat: { findFirst } }).findById("user-1", "chat-1") as { messages: Array<{ id: string; content: string; metadata: unknown }> };
    expect(chat.messages).toEqual([{ id: "entry-1", role: "assistant", content: "Pi answer", status: "completed", createdAt: new Date("2026-07-22T00:00:00.000Z"), metadata: { proposals: [{ id: "action-1" }] }, contextAttachments: [] }]);
  });

  it("stores AI context attachments on the triggering user message", async () => {
    const create = vi.fn().mockResolvedValue({ id: "attachment-1" });
    const repo = createAiChatsRepository({ aiContextAttachment: { create } });

    await repo.addContextAttachment("user-1", "message-1", {
      targetType: "clip",
      targetId: "clip-1",
      title: "Saved article",
      sourceUrl: "https://example.com/a",
      summarySnapshot: "Summary",
      contentSnapshot: "Body",
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        messageId: "message-1",
        userId: "user-1",
        targetType: "clip",
        targetId: "clip-1",
        title: "Saved article",
        sourceUrl: "https://example.com/a",
        summarySnapshot: "Summary",
        contentSnapshot: "Body",
      },
    });
  });

  it("lists active knowledge bases in sidebar order", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repo = createKnowledgeBasesRepository({ knowledgeBase: { findMany } });

    await repo.findByUserId("user-1");

    expect(findMany).toHaveBeenCalledWith({
      where: { userId: "user-1", deletedAt: null },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: {
        _count: {
          select: {
            items: { where: { deletedAt: null } },
          },
        },
      },
    });
  });

  it("loads a knowledge base tree with user and soft-delete guards", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const repo = createKnowledgeBasesRepository({ knowledgeBase: { findFirst } });

    await repo.findTree("user-1", "kb-1");

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "kb-1", userId: "user-1", deletedAt: null },
      include: {
        folders: {
          where: { deletedAt: null },
          orderBy: [{ depth: "asc" }, { position: "asc" }, { createdAt: "asc" }],
        },
      },
    });
  });

  it("creates root and child knowledge folders with computed depth", async () => {
    const create = vi.fn().mockResolvedValue({ id: "folder-2" });
    const findFirst = vi.fn().mockResolvedValue({ id: "folder-1", depth: 1 });
    const repo = createKnowledgeBasesRepository({
      knowledgeFolder: { create, findFirst },
    });

    await repo.createFolder("user-1", "kb-1", { name: "海外", parentId: "folder-1" });

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "folder-1", knowledgeBaseId: "kb-1", userId: "user-1", deletedAt: null },
    });
    expect(create).toHaveBeenCalledWith({
      data: {
        name: "海外",
        parentId: "folder-1",
        depth: 2,
        knowledgeBaseId: "kb-1",
        userId: "user-1",
        position: 0,
      },
    });
  });

  it("rejects subfolders below the prototype fourth level", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "folder-3", depth: 3 });
    const create = vi.fn();
    const repo = createKnowledgeBasesRepository({
      knowledgeFolder: { create, findFirst },
    });

    await expect(
      repo.createFolder("user-1", "kb-1", { name: "第五层", parentId: "folder-3" }),
    ).rejects.toBeInstanceOf(KnowledgeFolderDepthError);
    expect(create).not.toHaveBeenCalled();
  });

  it("lists mixed knowledge contents at root or folder scope", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repo = createKnowledgeBasesRepository({ knowledgeItem: { findMany } });

    await repo.findContents("user-1", "kb-1", "folder-1");

    expect(findMany).toHaveBeenCalledWith({
      where: { knowledgeBaseId: "kb-1", folderId: "folder-1", userId: "user-1", deletedAt: null },
      select: {
        id: true,
        kind: true,
        folderId: true,
        position: true,
        title: true,
        summary: true,
        assetType: true,
        sourceName: true,
        sourceUrl: true,
        createdAt: true,
        updatedAt: true,
        note: {
          select: {
            id: true,
            slug: true,
            title: true,
            summary: true,
            version: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        clip: {
          select: {
            id: true,
            url: true,
            title: true,
            summary: true,
            excerpt: true,
            favicon: true,
            coverImage: true,
            sourceName: true,
            author: true,
            publishedAt: true,
            version: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        feedEntry: {
          select: {
            id: true,
            feedId: true,
            url: true,
            title: true,
            summary: true,
            excerpt: true,
            coverImage: true,
            sourceName: true,
            author: true,
            publishedAt: true,
            version: true,
            createdAt: true,
            updatedAt: true,
            feed: {
              select: { id: true, title: true, url: true, favicon: true, type: true },
            },
          },
        },
      },
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    });
  });

  it("imports selected clips into a knowledge folder as user-owned items", async () => {
    const create = vi.fn().mockResolvedValue({ id: "kb-item-1" });
    const folderFindFirst = vi.fn().mockResolvedValue({ id: "folder-1" });
    const clipFindFirst = vi.fn().mockResolvedValue({ id: "clip-1" });
    const itemFindMany = vi.fn().mockResolvedValue([]);
    const repo = createKnowledgeBasesRepository({
      clip: { findFirst: clipFindFirst },
      knowledgeFolder: { findFirst: folderFindFirst },
      knowledgeItem: { create, findMany: itemFindMany },
    });

    await repo.importItems("user-1", "kb-1", {
      folderId: "folder-1",
      items: [{ kind: "clip", clipId: "clip-1" }],
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        kind: "clip",
        clipId: "clip-1",
        folderId: "folder-1",
        knowledgeBaseId: "kb-1",
        position: 0,
        userId: "user-1",
      },
    });
    expect(folderFindFirst).toHaveBeenCalledWith({
      where: { id: "folder-1", knowledgeBaseId: "kb-1", userId: "user-1", deletedAt: null },
      select: { id: true },
    });
    expect(clipFindFirst).toHaveBeenCalledWith({
      where: { id: "clip-1", userId: "user-1", deletedAt: null },
      select: { id: true },
    });
    expect(itemFindMany).toHaveBeenCalledWith({
      where: {
        knowledgeBaseId: "kb-1",
        folderId: "folder-1",
        clipId: "clip-1",
        userId: "user-1",
        deletedAt: null,
      },
      select: { clipId: true },
      take: 1,
    });
  });

  it("rejects imports into a folder outside the target knowledge base", async () => {
    const create = vi.fn();
    const repo = createKnowledgeBasesRepository({
      knowledgeFolder: { findFirst: vi.fn().mockResolvedValue(null) },
      knowledgeItem: { create },
    });

    await expect(
      repo.importItems("user-1", "kb-1", {
        folderId: "other-folder",
        items: [{ kind: "note", noteId: "note-1" }],
      }),
    ).rejects.toBeInstanceOf(KnowledgeImportTargetError);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects importing another user's source content", async () => {
    const create = vi.fn();
    const repo = createKnowledgeBasesRepository({
      note: { findFirst: vi.fn().mockResolvedValue(null) },
      knowledgeItem: { create },
    });

    await expect(
      repo.importItems("user-1", "kb-1", {
        items: [{ kind: "note", noteId: "note-other-user" }],
      }),
    ).rejects.toBeInstanceOf(KnowledgeImportSourceError);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects duplicate content in the same knowledge directory", async () => {
    const create = vi.fn();
    const repo = createKnowledgeBasesRepository({
      feedEntry: { findFirst: vi.fn().mockResolvedValue({ id: "entry-1" }) },
      knowledgeItem: { create, findMany: vi.fn().mockResolvedValue([{ feedEntryId: "entry-1" }]) },
    });

    await expect(
      repo.importItems("user-1", "kb-1", {
        items: [{ kind: "feed_entry", feedEntryId: "entry-1" }],
      }),
    ).rejects.toBeInstanceOf(KnowledgeImportDuplicateError);
    expect(create).not.toHaveBeenCalled();
  });

  it("creates local knowledge assets with prototype list position", async () => {
    const create = vi.fn().mockResolvedValue({ id: "kb-item-asset" });
    const repo = createKnowledgeBasesRepository({ knowledgeItem: { create } });

    await repo.createAsset("user-1", "kb-1", {
      title: "Design Systems Handbook",
      summary: "设计系统从 0 到 1 的搭建。",
      assetType: "pdf",
      sourceName: "从本地导入",
      position: 3,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        kind: "asset",
        assetType: "pdf",
        title: "Design Systems Handbook",
        summary: "设计系统从 0 到 1 的搭建。",
        sourceName: "从本地导入",
        sourceUrl: null,
        folderId: null,
        knowledgeBaseId: "kb-1",
        position: 3,
        userId: "user-1",
      },
    });
  });

  it("lists trash after removing rows older than the retention window", async () => {
    const deletedAt = new Date("2026-07-06T08:00:00.000Z");
    const now = new Date("2026-07-07T08:00:00.000Z");
    const cutoff = new Date("2026-06-23T08:00:00.000Z");
    const noteFindMany = vi.fn().mockResolvedValue([
      { id: "note-1", title: "Note", summary: null, createdAt: deletedAt, updatedAt: deletedAt, deletedAt },
    ]);
    const clipFindMany = vi.fn().mockResolvedValue([]);
    const knowledgeBaseFindMany = vi.fn().mockResolvedValue([]);
    const noteDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const clipDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const knowledgeBaseDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const repo = createTrashRepository({
      note: { findMany: noteFindMany, deleteMany: noteDeleteMany },
      clip: { findMany: clipFindMany, deleteMany: clipDeleteMany },
      knowledgeBase: { findMany: knowledgeBaseFindMany, deleteMany: knowledgeBaseDeleteMany },
    });

    const items = await repo.list("user-1", now);

    for (const deleteMany of [noteDeleteMany, clipDeleteMany, knowledgeBaseDeleteMany]) {
      expect(deleteMany).toHaveBeenCalledWith({
        where: { userId: "user-1", deletedAt: { lte: cutoff } },
      });
    }
    expect(noteFindMany).toHaveBeenCalledWith({
      where: { userId: "user-1", deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: {
        id: true,
        title: true,
        summary: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });
    expect(items).toEqual([
      {
        type: "note",
        id: "note-1",
        title: "Note",
        summary: null,
        createdAt: deletedAt,
        updatedAt: deletedAt,
        deletedAt,
        expiresAt: new Date("2026-07-20T08:00:00.000Z"),
      },
    ]);
  });

  it("keeps lightweight clip preview metadata out of the full detail payload", async () => {
    const deletedAt = new Date("2026-07-06T08:00:00.000Z");
    const clipFindMany = vi.fn().mockResolvedValue([
      {
        id: "clip-1",
        url: "https://example.com/article",
        title: "Saved article",
        summary: "Short summary",
        excerpt: "Readable preview",
        favicon: "https://example.com/favicon.ico",
        coverImage: "https://example.com/cover.jpg",
        sourceName: "Example",
        createdAt: deletedAt,
        updatedAt: deletedAt,
        deletedAt,
      },
    ]);
    const repo = createTrashRepository({ clip: { findMany: clipFindMany } });

    const items = await repo.list("user-1", new Date("2026-07-07T08:00:00.000Z"));

    expect(items).toEqual([
      expect.objectContaining({
        type: "clip",
        id: "clip-1",
        excerpt: "Readable preview",
        favicon: "https://example.com/favicon.ico",
        coverImage: "https://example.com/cover.jpg",
        sourceName: "Example",
      }),
    ]);
    expect(items[0]).not.toHaveProperty("content");
    expect(clipFindMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        excerpt: true,
        favicon: true,
        coverImage: true,
        sourceName: true,
      }),
    }));
  });

  it("loads one trashed item with ownership and deleted guards", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "note-1",
      title: "Deleted note",
      summary: "Summary",
      content: "# Body",
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date("2026-07-02T00:00:00.000Z"),
      deletedAt: new Date("2026-07-03T00:00:00.000Z"),
    });
    const repo = createTrashRepository({ note: { findFirst } });

    await expect(repo.get("user-1", "note", "note-1")).resolves.toMatchObject({
      type: "note",
      id: "note-1",
      content: "# Body",
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "note-1", userId: "user-1", deletedAt: { not: null } },
      select: expect.objectContaining({ content: true, deletedAt: true }),
    });
  });

  it("restores trashed items with user ownership, deleted guards, and version bumps", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repo = createTrashRepository({ clip: { updateMany } });

    await expect(repo.restore("user-1", "clip", "clip-1")).resolves.toBe(true);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "clip-1", userId: "user-1", deletedAt: { not: null } },
      data: { deletedAt: null, version: { increment: 1 } },
    });
  });

  it("permanently deletes only items already in the current user's trash", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const repo = createTrashRepository({ knowledgeBase: { deleteMany } });

    await expect(repo.deletePermanently("user-1", "knowledge_base", "kb-1")).resolves.toBe(true);

    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: "kb-1", userId: "user-1", deletedAt: { not: null } },
    });
  });
});
