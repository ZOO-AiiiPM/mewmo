export type WorkspaceDataSection = "notes" | "clips";
export type FeedCacheType = "article" | "media" | "video" | "podcast";

interface WorkspaceItem {
  id: string;
  updatedAt?: string;
}

interface FeedCacheEntry extends WorkspaceItem {
  feedId: string;
  publishedAt?: string | null;
  createdAt: string;
}

const lists = new Map<WorkspaceDataSection, WorkspaceItem[]>();
const details = new Map<WorkspaceDataSection, Map<string, WorkspaceItem>>();
const selections = new Map<WorkspaceDataSection, string>();
const feedSources = new Map<FeedCacheType, unknown[]>();
const feedEntries = new Map<string, FeedCacheEntry[]>();
const inFlight = new Map<string, Promise<unknown>>();
let activeAccountKey: string | null = null;

function cacheAvailable() {
  return typeof window !== "undefined" || process.env.NODE_ENV === "test";
}

function cloneItem<T>(item: T): T {
  return { ...item };
}

function feedEntryTimestamp(entry: FeedCacheEntry) {
  const timestamp = Date.parse(entry.publishedAt ?? entry.createdAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function sectionDetails(section: WorkspaceDataSection) {
  let cache = details.get(section);
  if (!cache) {
    cache = new Map<string, WorkspaceItem>();
    details.set(section, cache);
  }
  return cache;
}

export function getCachedWorkspaceList<T>(section: WorkspaceDataSection): T[] | null {
  if (!cacheAvailable()) return null;
  const cached = lists.get(section);
  return cached ? cached.map((item) => cloneItem(item as T)) : null;
}

export function setCachedWorkspaceList<T extends WorkspaceItem>(
  section: WorkspaceDataSection,
  items: T[],
) {
  if (!cacheAvailable()) return;
  lists.set(section, items.map((item) => cloneItem(item)));
}

export function getCachedWorkspaceDetail<T>(
  section: WorkspaceDataSection,
  id: string,
): T | null {
  if (!cacheAvailable()) return null;
  const cached = details.get(section)?.get(id);
  return cached ? cloneItem(cached as T) : null;
}

export function setCachedWorkspaceDetail<T extends WorkspaceItem>(
  section: WorkspaceDataSection,
  item: T,
) {
  if (!cacheAvailable()) return;
  sectionDetails(section).set(item.id, cloneItem(item));
}

export function getCachedWorkspaceSelection(section: WorkspaceDataSection) {
  if (!cacheAvailable()) return null;
  return selections.get(section) ?? null;
}

export function setCachedWorkspaceSelection(
  section: WorkspaceDataSection,
  id: string | null,
) {
  if (!cacheAvailable()) return;
  if (id) selections.set(section, id);
  else selections.delete(section);
}

export function isWorkspaceDetailFresh<T extends WorkspaceItem>(
  section: WorkspaceDataSection,
  listItem: T,
) {
  if (!cacheAvailable()) return false;
  const detail = details.get(section)?.get(listItem.id);
  if (!detail) return false;
  if (!listItem.updatedAt || !detail.updatedAt) return true;
  return detail.updatedAt >= listItem.updatedAt;
}

export function updateCachedWorkspaceItem<T extends WorkspaceItem>(
  section: WorkspaceDataSection,
  id: string,
  update: (item: T) => T,
) {
  if (!cacheAvailable()) return;
  const list = lists.get(section);
  if (list) {
    lists.set(
      section,
      list.map((item) => (item.id === id ? cloneItem(update(item as T)) : item)),
    );
  }

  const detailCache = details.get(section);
  const detail = detailCache?.get(id);
  if (detail && detailCache) {
    detailCache.set(id, cloneItem(update(detail as T)));
  }
}

export function removeCachedWorkspaceItem(section: WorkspaceDataSection, id: string) {
  if (!cacheAvailable()) return;
  const list = lists.get(section);
  if (list) lists.set(section, list.filter((item) => item.id !== id));
  details.get(section)?.delete(id);
  if (selections.get(section) === id) selections.delete(section);
}

export function getCachedFeedSources<T>(type: FeedCacheType): T[] | null {
  if (!cacheAvailable()) return null;
  const cached = feedSources.get(type);
  return cached ? cached.map((source) => cloneItem(source as T)) : null;
}

export function setCachedFeedSources<T>(type: FeedCacheType, sources: T[]) {
  if (!cacheAvailable()) return;
  feedSources.set(type, sources.map((source) => cloneItem(source)));
}

export function getCachedFeedEntries<T>(feedId: string): T[] | null {
  if (!cacheAvailable()) return null;
  const cached = feedEntries.get(feedId);
  return cached ? cached.map((entry) => cloneItem(entry as T)) : null;
}

export function setCachedFeedEntries<T extends FeedCacheEntry>(feedId: string, entries: T[]) {
  if (!cacheAvailable()) return;
  feedEntries.set(
    feedId,
    [...entries]
      .sort((left, right) => feedEntryTimestamp(right) - feedEntryTimestamp(left))
      .slice(0, 10)
      .map((entry) => cloneItem(entry)),
  );
}

export function updateCachedFeedEntry<T extends FeedCacheEntry>(
  feedId: string,
  entryId: string,
  update: (entry: T) => T,
) {
  if (!cacheAvailable()) return;
  const cached = feedEntries.get(feedId);
  if (!cached) return;
  feedEntries.set(
    feedId,
    cached.map((entry) =>
      entry.id === entryId ? cloneItem(update(entry as T)) : entry,
    ),
  );
}

export function clearCachedFeedEntries(feedId: string) {
  if (!cacheAvailable()) return;
  feedEntries.delete(feedId);
}

export function clearWorkspaceDataCache() {
  lists.clear();
  details.clear();
  selections.clear();
  feedSources.clear();
  feedEntries.clear();
  inFlight.clear();
}

export function scopeWorkspaceDataCache(accountKey: string | null | undefined) {
  if (!cacheAvailable()) return;
  const nextKey = accountKey ?? null;
  if (activeAccountKey === nextKey) return;
  clearWorkspaceDataCache();
  activeAccountKey = nextKey;
}

export function loadWorkspaceResource<T>(key: string, loader: () => Promise<T>): Promise<T> {
  if (!cacheAvailable()) return loader();
  const active = inFlight.get(key) as Promise<T> | undefined;
  if (active) return active;

  const request = loader().finally(() => {
    if (inFlight.get(key) === request) inFlight.delete(key);
  });
  inFlight.set(key, request);
  return request;
}
