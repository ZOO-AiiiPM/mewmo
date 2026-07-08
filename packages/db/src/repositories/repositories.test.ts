import { describe, expect, it, vi } from "vitest";

import { createAiChatsRepository } from "./ai-chats";
import { createFeedEntriesRepository } from "./feed-entries";
import { createFeedsRepository } from "./feeds";
import {
  KnowledgeFolderDepthError,
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

  it("finds feeds due for refresh through a user-safe query", async () => {
    const queryRaw = vi.fn().mockResolvedValue([]);
    const repo = createFeedsRepository({ $queryRaw: queryRaw });

    await repo.findDueForRefresh(new Date("2026-06-25T08:00:00.000Z"));

    expect(queryRaw).toHaveBeenCalledTimes(1);
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
      include: {
        note: true,
        clip: true,
        feedEntry: { include: { feed: { select: { id: true, title: true, url: true, favicon: true, type: true } } } },
      },
      orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    });
  });

  it("imports selected clips into a knowledge folder as user-owned items", async () => {
    const create = vi.fn().mockResolvedValue({ id: "kb-item-1" });
    const repo = createKnowledgeBasesRepository({ knowledgeItem: { create } });

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
    const feedFindMany = vi.fn().mockResolvedValue([]);
    const knowledgeBaseFindMany = vi.fn().mockResolvedValue([]);
    const noteDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const clipDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const feedDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const knowledgeBaseDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const repo = createTrashRepository({
      note: { findMany: noteFindMany, deleteMany: noteDeleteMany },
      clip: { findMany: clipFindMany, deleteMany: clipDeleteMany },
      feed: { findMany: feedFindMany, deleteMany: feedDeleteMany },
      knowledgeBase: { findMany: knowledgeBaseFindMany, deleteMany: knowledgeBaseDeleteMany },
    });

    const items = await repo.list("user-1", now);

    for (const deleteMany of [noteDeleteMany, clipDeleteMany, feedDeleteMany, knowledgeBaseDeleteMany]) {
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
