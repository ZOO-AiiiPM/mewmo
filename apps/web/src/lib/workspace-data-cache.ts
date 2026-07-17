import { workspaceResourceKeys } from "./workspace-resource-keys";

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

export interface WorkspaceResourceRecord<T> {
  value: T;
  acceptedAt: number;
}

export class WorkspaceScopeChangedError extends Error {
  constructor() {
    super("Workspace account changed while the request was running");
    this.name = "WorkspaceScopeChangedError";
  }
}

const resources = new Map<string, WorkspaceResourceRecord<unknown>>();
const inFlight = new Map<string, { generation: number; promise: Promise<unknown> }>();
let activeAccountId: string | null = null;
let activeGeneration = 0;

function cacheAvailable() {
  return typeof window !== "undefined" || process.env.NODE_ENV === "test";
}

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") return structuredClone(value);
  if (Array.isArray(value)) {
    return value.map((item) =>
      item && typeof item === "object" ? { ...item } : item,
    ) as T;
  }
  return value && typeof value === "object" ? { ...value } : value;
}

function sectionListKey(section: WorkspaceDataSection) {
  return section === "notes"
    ? workspaceResourceKeys.notesList()
    : workspaceResourceKeys.clipsList();
}

function sectionDetailKey(section: WorkspaceDataSection, id: string) {
  return section === "notes"
    ? workspaceResourceKeys.noteDetail(id)
    : workspaceResourceKeys.clipDetail(id);
}

function feedEntryTimestamp(entry: FeedCacheEntry) {
  const timestamp = Date.parse(entry.publishedAt ?? entry.createdAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function getWorkspaceResource<T>(key: string): WorkspaceResourceRecord<T> | null {
  if (!cacheAvailable()) return null;
  const record = resources.get(key) as WorkspaceResourceRecord<T> | undefined;
  return record
    ? { value: cloneValue(record.value), acceptedAt: record.acceptedAt }
    : null;
}

export function setWorkspaceResource<T>(key: string, value: T, acceptedAt = Date.now()) {
  if (!cacheAvailable()) return;
  resources.set(key, { value: cloneValue(value), acceptedAt });
}

export function invalidateWorkspaceResource(key: string) {
  if (!cacheAvailable()) return;
  resources.delete(key);
}

export function invalidateWorkspaceResourcePrefix(prefix: string) {
  if (!cacheAvailable()) return;
  for (const key of resources.keys()) {
    if (key.startsWith(prefix)) resources.delete(key);
  }
}

export async function refreshWorkspaceResource<T>(key: string, loader: () => Promise<T>) {
  if (!cacheAvailable()) return loader();
  const generation = activeGeneration;
  const active = inFlight.get(key);
  if (active?.generation === generation) return active.promise as Promise<T>;

  const promise = Promise.resolve()
    .then(loader)
    .then((value) => {
      if (generation !== activeGeneration) throw new WorkspaceScopeChangedError();
      setWorkspaceResource(key, value);
      return value;
    })
    .finally(() => {
      if (inFlight.get(key)?.promise === promise) inFlight.delete(key);
    });
  inFlight.set(key, { generation, promise });
  return promise;
}

export function loadWorkspaceResource<T>(key: string, loader: () => Promise<T>) {
  return refreshWorkspaceResource(key, loader);
}

export function getCachedWorkspaceList<T>(section: WorkspaceDataSection): T[] | null {
  return getWorkspaceResource<T[]>(sectionListKey(section))?.value ?? null;
}

export function setCachedWorkspaceList<T extends WorkspaceItem>(
  section: WorkspaceDataSection,
  items: T[],
) {
  setWorkspaceResource(sectionListKey(section), items);
}

export function getCachedWorkspaceDetail<T>(
  section: WorkspaceDataSection,
  id: string,
): T | null {
  return getWorkspaceResource<T>(sectionDetailKey(section, id))?.value ?? null;
}

export function setCachedWorkspaceDetail<T extends WorkspaceItem>(
  section: WorkspaceDataSection,
  item: T,
) {
  setWorkspaceResource(sectionDetailKey(section, item.id), item);
}

export function getCachedWorkspaceSelection(section: WorkspaceDataSection) {
  return getWorkspaceResource<string>(workspaceResourceKeys.selection(section))?.value ?? null;
}

export function setCachedWorkspaceSelection(
  section: WorkspaceDataSection,
  id: string | null,
) {
  const key = workspaceResourceKeys.selection(section);
  if (id) setWorkspaceResource(key, id);
  else invalidateWorkspaceResource(key);
}

export function isWorkspaceDetailFresh<T extends WorkspaceItem>(
  section: WorkspaceDataSection,
  listItem: T,
) {
  const detail = getCachedWorkspaceDetail<WorkspaceItem>(section, listItem.id);
  if (!detail) return false;
  if (!listItem.updatedAt || !detail.updatedAt) return true;
  return detail.updatedAt >= listItem.updatedAt;
}

export function updateCachedWorkspaceItem<T extends WorkspaceItem>(
  section: WorkspaceDataSection,
  id: string,
  update: (item: T) => T,
) {
  const list = getCachedWorkspaceList<T>(section);
  if (list) {
    setCachedWorkspaceList(
      section,
      list.map((item) => (item.id === id ? update(item) : item)),
    );
  }

  const detail = getCachedWorkspaceDetail<T>(section, id);
  if (detail) setCachedWorkspaceDetail(section, update(detail));
}

export function removeCachedWorkspaceItem(section: WorkspaceDataSection, id: string) {
  const list = getCachedWorkspaceList<WorkspaceItem>(section);
  if (list) setCachedWorkspaceList(section, list.filter((item) => item.id !== id));
  invalidateWorkspaceResource(sectionDetailKey(section, id));
  if (getCachedWorkspaceSelection(section) === id) setCachedWorkspaceSelection(section, null);
}

export function getCachedFeedSources<T>(type: FeedCacheType): T[] | null {
  return getWorkspaceResource<T[]>(workspaceResourceKeys.feedSources(type))?.value ?? null;
}

export function setCachedFeedSources<T>(type: FeedCacheType, sources: T[]) {
  setWorkspaceResource(workspaceResourceKeys.feedSources(type), sources);
}

export function getCachedFeedEntries<T>(feedId: string): T[] | null {
  return getWorkspaceResource<T[]>(workspaceResourceKeys.feedEntries(feedId))?.value ?? null;
}

export function setCachedFeedEntries<T extends FeedCacheEntry>(feedId: string, entries: T[]) {
  setWorkspaceResource(
    workspaceResourceKeys.feedEntries(feedId),
    [...entries]
      .sort((left, right) => feedEntryTimestamp(right) - feedEntryTimestamp(left))
      .slice(0, 10),
  );
}

export function updateCachedFeedEntry<T extends FeedCacheEntry>(
  feedId: string,
  entryId: string,
  update: (entry: T) => T,
) {
  const cached = getCachedFeedEntries<T>(feedId);
  if (!cached) return;
  setCachedFeedEntries(
    feedId,
    cached.map((entry) => (entry.id === entryId ? update(entry) : entry)),
  );
}

export function clearCachedFeedEntries(feedId: string) {
  invalidateWorkspaceResource(workspaceResourceKeys.feedEntries(feedId));
}

export function clearWorkspaceDataCache() {
  if (!cacheAvailable()) return;
  activeGeneration += 1;
  resources.clear();
  inFlight.clear();
}

export function scopeWorkspaceDataCache(accountId: string | null | undefined) {
  if (!cacheAvailable()) return;
  const nextAccountId = accountId ?? null;
  if (activeAccountId === nextAccountId) return;
  activeAccountId = nextAccountId;
  clearWorkspaceDataCache();
}
