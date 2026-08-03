import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { clip: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() }, feed: { findFirst: vi.fn(), updateMany: vi.fn() }, },
  feeds: { purgeDeletedDuplicate: vi.fn(), create: vi.fn(), delete: vi.fn() },
  fetchArticleFromUrl: vi.fn(),
}));

vi.mock("@mewmo/db", () => ({ getPrisma: () => mocks.db, createFeedEntriesRepository: vi.fn(), createFeedsRepository: () => mocks.feeds }));
vi.mock("@mewmo/content", () => ({ fetchArticleFromUrl: mocks.fetchArticleFromUrl, fetchFeedDocument: vi.fn(), fetchOutbound: vi.fn() }));

import { createFeedSubscriptionCommand, createFeedSubscriptionService, createUrlCaptureService } from "./url-capture-service";

const actor = { userId: "user-1", source: "internal-agent" as const, scopes: ["content:write"] };

describe("URL capture service", () => {
  beforeEach(() => vi.resetAllMocks());

  it("scopes duplicate lookup to the current user", async () => {
    mocks.db.clip.findFirst.mockResolvedValue({ title: "Already saved" });
    await expect(createUrlCaptureService().saveClip(actor, "https://example.com/a?utm_source=test")).resolves.toMatchObject({ action: "clip_saved", status: "existing", title: "Already saved" });
    expect(mocks.db.clip.findFirst).toHaveBeenCalledWith({ where: { userId: "user-1", normalizedUrl: "example.com/a", deletedAt: null } });
    expect(mocks.fetchArticleFromUrl).not.toHaveBeenCalled();
  });

  it("does not write a clip when fetching the public URL fails", async () => {
    mocks.db.clip.findFirst.mockResolvedValue(null);
    mocks.fetchArticleFromUrl.mockRejectedValue(new Error("authentication required"));
    await expect(createUrlCaptureService().saveClip(actor, "https://example.com/private")).rejects.toThrow("authentication required");
    expect(mocks.db.clip.create).not.toHaveBeenCalled();
  });

  it("types fetch failures but leaves persistence failures untouched", async () => {
    mocks.db.clip.findFirst.mockResolvedValue(null);
    const timeout = Object.assign(new Error("fetch timed out"), { name: "TimeoutError" });
    mocks.fetchArticleFromUrl.mockRejectedValueOnce(timeout);
    await expect(createUrlCaptureService().saveClip(actor, "https://example.com/a")).rejects.toMatchObject({
      code: "invalid_state",
      message: "fetch timed out",
      details: { timeout: true },
    });

    const databaseFailure = new Error("database unavailable");
    mocks.fetchArticleFromUrl.mockResolvedValueOnce({ title: "Article", content: "Body" });
    mocks.db.clip.create.mockRejectedValueOnce(databaseFailure);
    await expect(createUrlCaptureService().saveClip(actor, "https://example.com/a")).rejects.toBe(databaseFailure);
  });

  it("returns the existing Web conflict contract when a racing duplicate cannot be read", async () => {
    mocks.db.clip.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mocks.fetchArticleFromUrl.mockResolvedValue({ title: "Article", content: "Body" });
    mocks.db.clip.create.mockRejectedValue({ code: "P2002" });
    await expect(createUrlCaptureService().saveClip(actor, "https://example.com/a")).rejects.toMatchObject({
      code: "already_exists",
      message: "Clip already exists",
    });
  });

  it("preserves the submitted URL and enqueues workflows after creating a clip", async () => {
    const enqueueClip = vi.fn().mockResolvedValue(undefined);
    mocks.db.clip.findFirst.mockResolvedValue(null);
    mocks.fetchArticleFromUrl.mockResolvedValue({ title: "Public article", content: "Body" });
    mocks.db.clip.create.mockResolvedValue({ id: "clip-1", title: "Public article", version: 1 });

    await expect(createUrlCaptureService({ enqueueClip }).saveClip(actor, "  https://example.com/article  ")).resolves.toMatchObject({
      action: "clip_saved",
      status: "created",
      title: "Public article",
    });

    expect(mocks.db.clip.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      userId: "user-1",
      url: "https://example.com/article",
      normalizedUrl: "example.com/article",
    }) });
    expect(enqueueClip).toHaveBeenCalledWith({ id: "clip-1", title: "Public article", version: 1 }, "user-1");
  });

  it("restores an owned deleted duplicate and enqueues its new version", async () => {
    const enqueueClip = vi.fn().mockResolvedValue(undefined);
    mocks.db.clip.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "clip-1", title: "Old", deletedAt: new Date(), version: 4 });
    mocks.fetchArticleFromUrl.mockResolvedValue({ title: "Refetched", content: "New body" });
    mocks.db.clip.create.mockRejectedValue({ code: "P2002" });
    mocks.db.clip.update.mockResolvedValue({ id: "clip-1", title: "Refetched", version: 5 });

    await expect(createUrlCaptureService({ enqueueClip }).saveClip(actor, "https://example.com/article")).resolves.toMatchObject({
      action: "clip_saved",
      status: "existing",
      title: "Refetched",
    });
    expect(mocks.db.clip.update).toHaveBeenCalledWith({
      where: { id: "clip-1" },
      data: expect.objectContaining({ deletedAt: null, version: { increment: 1 } }),
    });
    expect(enqueueClip).toHaveBeenCalledWith({ id: "clip-1", title: "Refetched", version: 5 }, "user-1");
  });

  it("keeps a saved clip when workflow enqueue is temporarily unavailable", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.db.clip.findFirst.mockResolvedValue(null);
    mocks.fetchArticleFromUrl.mockResolvedValue({ title: "Public article", content: "Body" });
    mocks.db.clip.create.mockResolvedValue({ id: "clip-1", title: "Public article", version: 1 });

    await expect(createUrlCaptureService({ enqueueClip: vi.fn().mockRejectedValue(new Error("queue unavailable")) }).saveClip(actor, "https://example.com/article")).resolves.toMatchObject({ status: "created" });
    expect(error).toHaveBeenCalledWith("Failed to enqueue clip AI workflows", expect.any(Error));
  });

  it("uses the current owner for Feed create, initial import, and rollback", async () => {
    const purgeDeletedDuplicate = vi.fn();
    const create = vi.fn().mockResolvedValue({ id: "feed-1" });
    const initialFetch = vi.fn().mockResolvedValue({ status: "error", error: "Feed fetch timed out" });
    const remove = vi.fn().mockResolvedValue({ count: 1 });

    const result = await createFeedSubscriptionCommand(actor, {
      url: "https://example.com/feed.xml", title: "Example", type: "podcast", description: "Feed", favicon: "https://example.com/icon.png", refreshInterval: 3600, initialEntryLimit: 10,
    }, { purgeDeletedDuplicate, create, initialFetch, delete: remove, id: (feed) => feed.id });

    expect(purgeDeletedDuplicate).toHaveBeenCalledWith("user-1", "https://example.com/feed.xml", "podcast");
    expect(create).toHaveBeenCalledWith("user-1", expect.objectContaining({ type: "podcast", description: "Feed", favicon: "https://example.com/icon.png" }));
    expect(initialFetch).toHaveBeenCalledWith("user-1", { id: "feed-1" }, 10);
    expect(remove).toHaveBeenCalledWith("user-1", "feed-1");
    expect(result.initialFetch).toMatchObject({ status: "error", error: "Feed fetch timed out" });
  });

  it("propagates a failed Feed rollback instead of reporting a successful subscription", async () => {
    const remove = vi.fn().mockRejectedValue(new Error("rollback failed"));
    await expect(createFeedSubscriptionCommand(actor, {
      url: "https://example.com/feed.xml", title: "Example", type: "article", refreshInterval: 3600, initialEntryLimit: 10,
    }, {
      purgeDeletedDuplicate: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: "feed-1" }),
      initialFetch: vi.fn().mockResolvedValue({ status: "error", error: "Fetch failed" }),
      delete: remove,
      id: (feed) => feed.id,
    })).rejects.toThrow("rollback failed");
    expect(remove).toHaveBeenCalledOnce();
  });

  it("rejects an initial Feed failure when ownership-safe rollback removes nothing", async () => {
    await expect(createFeedSubscriptionCommand(actor, {
      url: "https://example.com/feed.xml", title: "Example", type: "article", refreshInterval: 3600, initialEntryLimit: 10,
    }, {
      purgeDeletedDuplicate: vi.fn(),
      create: vi.fn().mockResolvedValue({ id: "feed-1" }),
      initialFetch: vi.fn().mockResolvedValue({ status: "error", error: "Fetch failed" }),
      delete: vi.fn().mockResolvedValue({ count: 0 }),
      id: (feed) => feed.id,
    })).rejects.toThrow("rollback did not remove");
  });

  it("returns only the current owner's active Feed duplicate and requeues a failed import", async () => {
    mocks.feeds.purgeDeletedDuplicate.mockResolvedValue({ count: 0 });
    mocks.feeds.create.mockRejectedValue({ code: "P2002" });
    mocks.db.feed.findFirst.mockResolvedValue({ id: "feed-1", title: "Existing", lastFetchStatus: "error", lastFetchStartedAt: new Date() });
    mocks.db.feed.updateMany.mockResolvedValue({ count: 1 });

    await expect(createFeedSubscriptionService().subscribeFeed(actor, {
      url: "https://example.com/feed.xml", title: "Example", type: "article", refreshInterval: 3600, initialEntryLimit: 10,
    })).resolves.toMatchObject({ action: "feed_subscribed", status: "existing", title: "Existing" });
    expect(mocks.db.feed.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-1", url: "https://example.com/feed.xml", type: "article", deletedAt: null },
    });
    expect(mocks.db.feed.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "feed-1", userId: "user-1", deletedAt: null }),
    }));
  });
});
