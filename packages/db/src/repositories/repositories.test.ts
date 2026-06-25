import { describe, expect, it, vi } from "vitest";

import { createAiChatsRepository } from "./ai-chats";
import { createFeedEntriesRepository } from "./feed-entries";
import { createFeedsRepository } from "./feeds";
import { createNotesRepository } from "./notes";
import { createTagsRepository } from "./tags";

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
});
