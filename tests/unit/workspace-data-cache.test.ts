import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  WorkspaceScopeChangedError,
  clearCachedFeedEntries,
  clearWorkspaceDataCache,
  getWorkspaceResource,
  getCachedFeedEntries,
  getCachedFeedSources,
  getCachedWorkspaceDetail,
  getCachedWorkspaceList,
  getCachedWorkspaceSelection,
  invalidateWorkspaceResource,
  invalidateWorkspaceResourcePrefix,
  isWorkspaceDetailFresh,
  loadWorkspaceResource,
  refreshWorkspaceResource,
  removeCachedWorkspaceItem,
  scopeWorkspaceDataCache,
  setCachedFeedEntries,
  setCachedFeedSources,
  setCachedWorkspaceDetail,
  setCachedWorkspaceList,
  setCachedWorkspaceSelection,
  setWorkspaceResource,
  updateCachedWorkspaceItem,
  updateCachedFeedEntry,
} from "../../apps/web/src/lib/workspace-data-cache";
import { workspaceResourceKeys } from "../../apps/web/src/lib/workspace-resource-keys";

interface TestItem {
  id: string;
  title: string;
  updatedAt: string;
  content?: string;
}

interface TestFeedSource {
  id: string;
  title: string;
}

interface TestFeedEntry {
  id: string;
  feedId: string;
  title: string;
  publishedAt: string | null;
  createdAt: string;
  readAt?: string | null;
}

const first: TestItem = {
  id: "first",
  title: "First",
  updatedAt: "2026-07-10T00:00:00.000Z",
};

beforeEach(() => {
  clearWorkspaceDataCache();
});

describe("workspace data cache", () => {
  it("stores arbitrary resources with an accepted timestamp without leaking references", () => {
    scopeWorkspaceDataCache("resource-user");
    const value = [{ id: "today-1", nested: { title: "Today" } }];

    setWorkspaceResource(workspaceResourceKeys.todayList(), value, 123);
    value[0]!.nested.title = "Changed outside";

    const cached = getWorkspaceResource<typeof value>(workspaceResourceKeys.todayList());
    expect(cached).toEqual({
      value: [{ id: "today-1", nested: { title: "Today" } }],
      acceptedAt: 123,
    });

    cached!.value[0]!.nested.title = "Changed after read";
    expect(getWorkspaceResource<typeof value>(workspaceResourceKeys.todayList())?.value[0]?.nested.title)
      .toBe("Today");
  });

  it("invalidates exact resources and resource families", () => {
    scopeWorkspaceDataCache("invalidate-user");
    setWorkspaceResource(workspaceResourceKeys.todayList(), [{ id: "today-1" }]);
    setWorkspaceResource(workspaceResourceKeys.knowledgeTree("kb-1"), { id: "kb-1" });
    setWorkspaceResource(workspaceResourceKeys.knowledgeTree("kb-2"), { id: "kb-2" });

    invalidateWorkspaceResource(workspaceResourceKeys.todayList());
    invalidateWorkspaceResourcePrefix("knowledge:tree:");

    expect(getWorkspaceResource(workspaceResourceKeys.todayList())).toBeNull();
    expect(getWorkspaceResource(workspaceResourceKeys.knowledgeTree("kb-1"))).toBeNull();
    expect(getWorkspaceResource(workspaceResourceKeys.knowledgeTree("kb-2"))).toBeNull();
  });

  it("rejects a response that resolves after the account generation changes", async () => {
    scopeWorkspaceDataCache("delayed-user-1");
    let resolve!: (value: string[]) => void;
    const pending = refreshWorkspaceResource(
      workspaceResourceKeys.notesList(),
      () => new Promise<string[]>((done) => {
        resolve = done;
      }),
    );
    await Promise.resolve();

    scopeWorkspaceDataCache("delayed-user-2");
    resolve(["private-user-1"]);

    await expect(pending).rejects.toBeInstanceOf(WorkspaceScopeChangedError);
    expect(getWorkspaceResource(workspaceResourceKeys.notesList())).toBeNull();
  });

  it("deduplicates generic refreshes and stores the accepted response", async () => {
    scopeWorkspaceDataCache("dedupe-user");
    const loader = vi.fn(async () => [{ id: "clip-1" }]);
    const key = workspaceResourceKeys.clipsList();

    const [left, right] = await Promise.all([
      refreshWorkspaceResource(key, loader),
      refreshWorkspaceResource(key, loader),
    ]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(left).toEqual([{ id: "clip-1" }]);
    expect(right).toEqual([{ id: "clip-1" }]);
    expect(getWorkspaceResource(key)?.value).toEqual([{ id: "clip-1" }]);
  });

  it("stores lists and details synchronously without leaking mutable references", () => {
    setCachedWorkspaceList("notes", [first]);
    setCachedWorkspaceDetail("notes", { ...first, content: "body" });

    const list = getCachedWorkspaceList<TestItem>("notes");
    const detail = getCachedWorkspaceDetail<TestItem>("notes", first.id);

    expect(list).toEqual([first]);
    expect(detail).toEqual({ ...first, content: "body" });

    list?.push({ ...first, id: "second" });
    expect(getCachedWorkspaceList<TestItem>("notes")).toEqual([first]);
  });

  it("treats a detail as stale when list metadata reports a newer version", () => {
    setCachedWorkspaceDetail("clips", { ...first, content: "old" });

    expect(isWorkspaceDetailFresh("clips", first)).toBe(true);
    expect(
      isWorkspaceDetailFresh("clips", {
        ...first,
        updatedAt: "2026-07-10T00:00:01.000Z",
      }),
    ).toBe(false);
  });

  it("updates and removes list and detail entries together", () => {
    setCachedWorkspaceList("notes", [first]);
    setCachedWorkspaceDetail("notes", { ...first, content: "body" });

    updateCachedWorkspaceItem<TestItem>("notes", first.id, (item) => ({
      ...item,
      title: "Renamed",
    }));

    expect(getCachedWorkspaceList<TestItem>("notes")?.[0]?.title).toBe("Renamed");
    expect(getCachedWorkspaceDetail<TestItem>("notes", first.id)?.title).toBe("Renamed");

    removeCachedWorkspaceItem("notes", first.id);
    expect(getCachedWorkspaceList<TestItem>("notes")).toEqual([]);
    expect(getCachedWorkspaceDetail<TestItem>("notes", first.id)).toBeNull();
  });

  it("remembers the selected item for lightweight section entry routes", () => {
    expect(getCachedWorkspaceSelection("clips")).toBeNull();

    setCachedWorkspaceSelection("clips", "first");
    expect(getCachedWorkspaceSelection("clips")).toBe("first");

    removeCachedWorkspaceItem("clips", "first");
    expect(getCachedWorkspaceSelection("clips")).toBeNull();
  });

  it("deduplicates concurrent loads and clears the in-flight entry after completion", async () => {
    const loader = vi.fn(async () => ({ value: "loaded" }));

    const [left, right] = await Promise.all([
      loadWorkspaceResource("clips:list", loader),
      loadWorkspaceResource("clips:list", loader),
    ]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(left).toEqual({ value: "loaded" });
    expect(right).toEqual({ value: "loaded" });

    await loadWorkspaceResource("clips:list", loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("clears private content when the active account changes", () => {
    scopeWorkspaceDataCache("first@example.com");
    setCachedWorkspaceList("notes", [first]);

    scopeWorkspaceDataCache("second@example.com");

    expect(getCachedWorkspaceList("notes")).toBeNull();
  });

  it("keeps feed source lists independent by feed type", () => {
    setCachedFeedSources<TestFeedSource>("article", [
      { id: "article-feed", title: "Articles" },
    ]);
    setCachedFeedSources<TestFeedSource>("media", [
      { id: "media-feed", title: "Media" },
    ]);

    expect(getCachedFeedSources<TestFeedSource>("article")).toEqual([
      { id: "article-feed", title: "Articles" },
    ]);
    expect(getCachedFeedSources<TestFeedSource>("media")).toEqual([
      { id: "media-feed", title: "Media" },
    ]);
  });

  it("keeps only the newest ten complete entries for each feed", () => {
    const entries: TestFeedEntry[] = Array.from({ length: 12 }, (_, index) => ({
      id: `entry-${index}`,
      feedId: "feed-1",
      title: `Entry ${index}`,
      publishedAt: index === 11 ? null : `2026-07-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
      createdAt:
        index === 11
          ? "2026-07-12T00:00:00.000Z"
          : `2026-06-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    }));

    setCachedFeedEntries("feed-1", entries);

    expect(getCachedFeedEntries<TestFeedEntry>("feed-1")?.map((entry) => entry.id)).toEqual([
      "entry-11",
      "entry-10",
      "entry-9",
      "entry-8",
      "entry-7",
      "entry-6",
      "entry-5",
      "entry-4",
      "entry-3",
      "entry-2",
    ]);
  });

  it("updates and invalidates entries for only the selected feed", () => {
    const entry: TestFeedEntry = {
      id: "entry-1",
      feedId: "feed-1",
      title: "Unread",
      publishedAt: null,
      createdAt: "2026-07-10T00:00:00.000Z",
      readAt: null,
    };
    setCachedFeedEntries("feed-1", [entry]);
    setCachedFeedEntries("feed-2", [{ ...entry, id: "entry-2", feedId: "feed-2" }]);

    updateCachedFeedEntry<TestFeedEntry>("feed-1", "entry-1", (current) => ({
      ...current,
      readAt: "2026-07-10T01:00:00.000Z",
    }));
    expect(getCachedFeedEntries<TestFeedEntry>("feed-1")?.[0]?.readAt).toBe(
      "2026-07-10T01:00:00.000Z",
    );

    clearCachedFeedEntries("feed-1");
    expect(getCachedFeedEntries("feed-1")).toBeNull();
    expect(getCachedFeedEntries<TestFeedEntry>("feed-2")?.[0]?.id).toBe("entry-2");
  });

  it("clears feed caches when the active account changes", () => {
    scopeWorkspaceDataCache("feeds-first@example.com");
    setCachedFeedSources<TestFeedSource>("article", [
      { id: "feed-1", title: "Private source" },
    ]);
    setCachedFeedEntries<TestFeedEntry>("feed-1", [
      {
        id: "entry-1",
        feedId: "feed-1",
        title: "Private entry",
        publishedAt: null,
        createdAt: "2026-07-10T00:00:00.000Z",
      },
    ]);

    scopeWorkspaceDataCache("feeds-second@example.com");

    expect(getCachedFeedSources("article")).toBeNull();
    expect(getCachedFeedEntries("feed-1")).toBeNull();
  });
});
