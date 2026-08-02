import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { clip: { findFirst: vi.fn(), create: vi.fn() }, feed: {}, },
  fetchArticleFromUrl: vi.fn(),
}));

vi.mock("@mewmo/db", () => ({ getPrisma: () => mocks.db, createFeedEntriesRepository: vi.fn() }));
vi.mock("@mewmo/content", () => ({ fetchArticleFromUrl: mocks.fetchArticleFromUrl, fetchFeedDocument: vi.fn(), fetchOutbound: vi.fn() }));

import { createUrlCaptureService } from "./url-capture-service";

const actor = { userId: "user-1", source: "internal-agent" as const, scopes: ["content:write"] };

describe("URL capture service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("scopes duplicate lookup to the current user", async () => {
    mocks.db.clip.findFirst.mockResolvedValue({ title: "Already saved" });
    await expect(createUrlCaptureService().saveClip(actor, "https://example.com/a?utm_source=test")).resolves.toEqual({ action: "clip_saved", status: "existing", title: "Already saved" });
    expect(mocks.db.clip.findFirst).toHaveBeenCalledWith({ where: { userId: "user-1", normalizedUrl: "example.com/a", deletedAt: null } });
    expect(mocks.fetchArticleFromUrl).not.toHaveBeenCalled();
  });

  it("does not write a clip when fetching the public URL fails", async () => {
    mocks.db.clip.findFirst.mockResolvedValue(null);
    mocks.fetchArticleFromUrl.mockRejectedValue(new Error("authentication required"));
    await expect(createUrlCaptureService().saveClip(actor, "https://example.com/private")).rejects.toThrow("authentication required");
    expect(mocks.db.clip.create).not.toHaveBeenCalled();
  });
});
