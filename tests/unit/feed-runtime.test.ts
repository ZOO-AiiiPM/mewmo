import { describe, expect, it, vi } from "vitest";

import { enqueueFeedFetch } from "../../apps/web/src/lib/feed-queue-service";
import { fetchAndStoreFeed } from "../../apps/web/src/lib/feed-fetch-service";

interface FeedState {
  id: string;
  userId: string;
  url: string;
  lastFetchStatus: string;
  lastFetchStartedAt: Date | null;
  lastFetchError: string | null;
  lastFetchedAt: Date | null;
  lastFetchCount: number;
}

function matchesWhere(state: FeedState, where: Record<string, unknown>): boolean {
  if (where.id && where.id !== state.id) return false;
  const status = where.lastFetchStatus;
  if (typeof status === "string" && status !== state.lastFetchStatus) return false;
  if (status && typeof status === "object") {
    const filter = status as { notIn?: string[] };
    if (filter.notIn?.includes(state.lastFetchStatus)) return false;
  }
  const startedAt = where.lastFetchStartedAt as { lt?: Date } | Date | undefined;
  if (startedAt instanceof Date && state.lastFetchStartedAt?.getTime() !== startedAt.getTime()) return false;
  if (startedAt && !(startedAt instanceof Date) && startedAt.lt && !(state.lastFetchStartedAt && state.lastFetchStartedAt < startedAt.lt)) return false;
  return true;
}

function applyData(state: FeedState, data: Record<string, unknown>) {
  for (const key of ["lastFetchStatus", "lastFetchError", "lastFetchStartedAt", "lastFetchedAt", "lastFetchCount"] as const) {
    if (key in data) state[key] = data[key] as never;
  }
}

function createPrisma(state: FeedState, entries: Array<Record<string, unknown>>) {
  const updateMany = vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    if (!matchesWhere(state, where)) return { count: 0 };
    applyData(state, data);
    return { count: 1 };
  });
  const prisma = {
    feed: {
      findFirst: vi.fn(async () => ({ lastFetchStatus: state.lastFetchStatus, lastFetchStartedAt: state.lastFetchStartedAt })),
      updateMany,
    },
  };
  const entryRepository = {
    upsertByFeedUrl: vi.fn(async (_userId: string, input: Record<string, unknown>) => {
      const entry = { id: `entry-${entries.length + 1}`, ...input };
      entries.push(entry);
      return { created: true, entry };
    }),
  };
  return { prisma, entryRepository, updateMany };
}

describe("feed queue runtime", () => {
  it("preserves active feeds for manual and bulk refresh claims", async () => {
    const state: FeedState = {
      id: "feed-1",
      userId: "user-1",
      url: "https://example.com/feed.xml",
      lastFetchStatus: "fetching",
      lastFetchStartedAt: new Date("2026-07-13T00:00:00.000Z"),
      lastFetchError: null,
      lastFetchedAt: null,
      lastFetchCount: 0,
    };
    const { prisma, updateMany } = createPrisma(state, []);
    const addJob = vi.fn(async () => ({ id: "job-1" }));

    const first = await enqueueFeedFetch(state.id, { prisma, addJob });
    const second = await enqueueFeedFetch(state.id, { prisma, addJob });

    expect(first).toMatchObject({ queued: true, status: "fetching", fallbackRequired: false });
    expect(second).toMatchObject({ queued: true, status: "fetching", fallbackRequired: false });
    expect(addJob).not.toHaveBeenCalled();
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(state.lastFetchStartedAt).toEqual(new Date("2026-07-13T00:00:00.000Z"));
  });

  it("persists a Web fallback after a queue rejection", async () => {
    const state: FeedState = {
      id: "feed-1",
      userId: "user-1",
      url: "https://example.com/feed.xml",
      lastFetchStatus: "idle",
      lastFetchStartedAt: null,
      lastFetchError: null,
      lastFetchedAt: null,
      lastFetchCount: 0,
    };
    const entries: Array<Record<string, unknown>> = [];
    const { prisma, entryRepository } = createPrisma(state, entries);
    const result = await enqueueFeedFetch(state.id, {
      prisma,
      addJob: async () => {
        throw new Error("redis unavailable");
      },
    });

    expect(result).toMatchObject({ queued: false, status: "error", fallbackRequired: true });
    const fallback = await fetchAndStoreFeed("user-1", state.id, {
      prisma: {
        feed: {
          findFirst: vi.fn(async () => ({ id: state.id, userId: state.userId, url: state.url, title: "Example Feed" })),
          update: vi.fn(),
          updateMany: prisma.feed.updateMany,
        },
      },
      entryRepository,
      fetchFeed: async () => new Response("<rss><channel><item><title>Entry</title><link>https://example.com/entry</link><description>Body</description></item></channel></rss>"),
      fetchEntryPage: async () => ({ title: "Entry", content: "<p>Body</p>" }),
    });

    expect(fallback.status).toBe("ok");
    expect(entries).toHaveLength(1);
    expect(state.lastFetchStatus).toBe("success");
  });

  it("does not let delayed queue failure overwrite a newer owner", async () => {
    const state: FeedState = {
      id: "feed-1",
      userId: "user-1",
      url: "https://example.com/feed.xml",
      lastFetchStatus: "idle",
      lastFetchStartedAt: null,
      lastFetchError: null,
      lastFetchedAt: null,
      lastFetchCount: 0,
    };
    const { prisma } = createPrisma(state, []);
    let rejectQueue!: (error: Error) => void;
    const enqueue = enqueueFeedFetch(state.id, {
      prisma,
      addJob: () => new Promise((_, reject) => {
        rejectQueue = reject;
      }),
    });
    await vi.waitFor(() => expect(state.lastFetchStatus).toBe("queued"));
    const newerStartedAt = new Date("2026-07-13T00:01:00.000Z");
    state.lastFetchStatus = "success";
    state.lastFetchStartedAt = newerStartedAt;
    rejectQueue(new Error("late redis failure"));

    await expect(enqueue).resolves.toMatchObject({ queued: false, status: "success", fallbackRequired: false });
    expect(state.lastFetchStatus).toBe("success");
    expect(state.lastFetchStartedAt).toBe(newerStartedAt);
  });
});
