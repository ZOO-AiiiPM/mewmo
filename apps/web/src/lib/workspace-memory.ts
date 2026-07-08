import { useEffect, useRef, useState, type RefObject } from "react";

export type WorkspaceSection = "today" | "notes" | "clips" | "feeds" | "knowledge-bases";
export type WorkspaceFeedType = "article" | "media" | "video" | "podcast";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

interface SectionMemory {
  href?: string;
  listScrollTop?: number;
  readerScrollTop?: number;
  readerHref?: string;
  selectedKey?: string;
}

interface WorkspaceMemory {
  sections?: Partial<Record<WorkspaceSection, SectionMemory>>;
  feedTypeHrefs?: Partial<Record<WorkspaceFeedType, string>>;
  knowledgeBaseHrefs?: Record<string, string>;
}

interface WorkspaceScrollInput {
  listScrollTop?: number | undefined;
  readerScrollTop?: number | undefined;
}

interface WorkspaceScrollValues {
  listScrollTop: number | undefined;
  readerScrollTop: number | undefined;
}

interface WorkspaceMemoryOptions {
  section: WorkspaceSection;
  href: string;
  listRef?: RefObject<HTMLElement | null> | undefined;
  readerRef?: RefObject<HTMLElement | null> | undefined;
  restoreKey?: string | number | boolean | null | undefined;
}

type ScrollElementForMemory = Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop">;

const WORKSPACE_MEMORY_KEY = "mewmo:workspace-memory:v1";
const WORKSPACE_MEMORY_CHANGE_EVENT = "mewmo:workspace-memory-change";
const BASE_URL = "https://mewmo.local";
const FEED_TYPES = new Set<WorkspaceFeedType>(["article", "media", "video", "podcast"]);
const TRANSIENT_QUERY_KEYS = ["add", "import", "localImport"];
const SCROLL_RESTORE_RETRY_MS = [120, 250, 600, 900];

export function workspaceSectionFromPath(pathname: string): WorkspaceSection | null {
  if (pathname === "/today" || pathname.startsWith("/today/")) return "today";
  if (pathname === "/notes" || pathname.startsWith("/notes/")) return "notes";
  if (pathname === "/clips" || pathname.startsWith("/clips/")) return "clips";
  if (pathname === "/feeds" || pathname.startsWith("/feeds/") || pathname.startsWith("/feed-entries/")) {
    return "feeds";
  }
  if (pathname === "/knowledge-bases" || pathname.startsWith("/knowledge-bases/")) {
    return "knowledge-bases";
  }
  return null;
}

export function rememberWorkspaceRoute(pathname: string, search = "", storage?: StorageLike): void {
  const section = workspaceSectionFromPath(pathname);
  if (!section) return;
  const href = sanitizeWorkspaceHref(`${pathname}${normalizeSearch(search)}`, section);
  if (!href) return;

  updateMemory(storage, (memory) => {
    const sections = { ...(memory.sections ?? {}) };
    sections[section] = { ...(sections[section] ?? {}), href };
    memory.sections = sections;

    if (section === "feeds") {
      const type = feedTypeFromHref(href);
      memory.feedTypeHrefs = { ...(memory.feedTypeHrefs ?? {}), [type]: href };
    }

    if (section === "knowledge-bases") {
      const kbId = searchValueFromHref(href, "kbId");
      if (kbId) {
        memory.knowledgeBaseHrefs = { ...(memory.knowledgeBaseHrefs ?? {}), [kbId]: href };
      }
    }
  }, true);
}

export function getRememberedWorkspaceHref(
  section: WorkspaceSection,
  fallback: string,
  storage?: StorageLike,
): string {
  const href = readMemory(storage).sections?.[section]?.href;
  return href && workspaceSectionFromHref(href) === section ? href : fallback;
}

export function getRememberedFeedTypeHref(
  type: WorkspaceFeedType,
  fallback: string,
  storage?: StorageLike,
): string {
  const href = readMemory(storage).feedTypeHrefs?.[type];
  return href && workspaceSectionFromHref(href) === "feeds" && feedTypeFromHref(href) === type
    ? href
    : fallback;
}

export function getRememberedKnowledgeBaseHref(
  kbId: string,
  fallback: string,
  storage?: StorageLike,
): string {
  const href = readMemory(storage).knowledgeBaseHrefs?.[kbId];
  return href && workspaceSectionFromHref(href) === "knowledge-bases" && searchValueFromHref(href, "kbId") === kbId
    ? href
    : fallback;
}

export function useRememberedWorkspaceHref(
  section: WorkspaceSection,
  fallback: string,
): string {
  const [href, setHref] = useState(fallback);

  useEffect(() => {
    const syncHref = () => setHref(getRememberedWorkspaceHref(section, fallback));
    syncHref();
    window.addEventListener(WORKSPACE_MEMORY_CHANGE_EVENT, syncHref);
    window.addEventListener("storage", syncHref);
    return () => {
      window.removeEventListener(WORKSPACE_MEMORY_CHANGE_EVENT, syncHref);
      window.removeEventListener("storage", syncHref);
    };
  }, [fallback, section]);

  return href;
}

export function useRememberedFeedTypeHref(
  type: WorkspaceFeedType,
  fallback: string,
): string {
  const [href, setHref] = useState(fallback);

  useEffect(() => {
    const syncHref = () => setHref(getRememberedFeedTypeHref(type, fallback));
    syncHref();
    window.addEventListener(WORKSPACE_MEMORY_CHANGE_EVENT, syncHref);
    window.addEventListener("storage", syncHref);
    return () => {
      window.removeEventListener(WORKSPACE_MEMORY_CHANGE_EVENT, syncHref);
      window.removeEventListener("storage", syncHref);
    };
  }, [fallback, type]);

  return href;
}

export function rememberWorkspaceScroll(
  section: WorkspaceSection,
  href: string,
  scroll: WorkspaceScrollInput,
  storage?: StorageLike,
): void {
  const cleanHref = sanitizeWorkspaceHref(href, section);
  if (!cleanHref) return;

  updateMemory(storage, (memory) => {
    const sections = { ...(memory.sections ?? {}) };
    const current = { ...(sections[section] ?? {}) };
    if (typeof scroll.listScrollTop === "number" && Number.isFinite(scroll.listScrollTop)) {
      current.listScrollTop = scroll.listScrollTop;
    }
    if (typeof scroll.readerScrollTop === "number" && Number.isFinite(scroll.readerScrollTop)) {
      current.readerScrollTop = scroll.readerScrollTop;
      current.readerHref = cleanHref;
    }
    sections[section] = current;
    memory.sections = sections;
  });
}

export function getWorkspaceScroll(
  section: WorkspaceSection,
  href: string,
  storage?: StorageLike,
): WorkspaceScrollValues {
  const current = readMemory(storage).sections?.[section];
  const cleanHref = sanitizeWorkspaceHref(href, section);
  return {
    listScrollTop: current?.listScrollTop,
    readerScrollTop: current?.readerHref && current.readerHref === cleanHref ? current.readerScrollTop : undefined,
  };
}

export function shouldRestoreWorkspaceListScroll({
  previousHref,
  href,
}: {
  previousHref: string | null;
  href: string;
}): boolean {
  if (!previousHref) return true;
  return previousHref === href;
}

export function scrollTopForWorkspaceMemory(
  element: ScrollElementForMemory | null | undefined,
): number | undefined {
  if (!element || !Number.isFinite(element.scrollTop)) return undefined;
  if (element.scrollTop === 0 && element.scrollHeight <= element.clientHeight) {
    return undefined;
  }
  return element.scrollTop;
}

export function rememberWorkspaceSelection(
  section: WorkspaceSection,
  selectedKey: string | null,
  storage?: StorageLike,
): void {
  updateMemory(storage, (memory) => {
    const sections = { ...(memory.sections ?? {}) };
    const current = { ...(sections[section] ?? {}) };
    if (selectedKey) current.selectedKey = selectedKey;
    else delete current.selectedKey;
    sections[section] = current;
    memory.sections = sections;
  });
}

export function getRememberedWorkspaceSelection(
  section: WorkspaceSection,
  storage?: StorageLike,
): string | null {
  return readMemory(storage).sections?.[section]?.selectedKey ?? null;
}

export function useWorkspaceMemory({
  section,
  href,
  listRef,
  readerRef,
  restoreKey,
}: WorkspaceMemoryOptions): void {
  const previousRestoreHrefRef = useRef<string | null>(null);
  const latestListScrollRef = useRef<number | undefined>(undefined);
  const latestReaderScrollRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    const parsed = parseHref(href);
    if (!parsed) return;
    rememberWorkspaceRoute(parsed.pathname, parsed.search);
  }, [href]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let frameOne = 0;
    let frameTwo = 0;
    const restoreTimers: number[] = [];
    const restoreListScroll = shouldRestoreWorkspaceListScroll({
      previousHref: previousRestoreHrefRef.current,
      href,
    });
    const restore = () => {
      const scroll = getWorkspaceScroll(section, href);
      if (restoreListScroll && listRef?.current && Number.isFinite(scroll.listScrollTop)) {
        listRef.current.scrollTop = scroll.listScrollTop ?? 0;
      }
      if (readerRef?.current && Number.isFinite(scroll.readerScrollTop)) {
        readerRef.current.scrollTop = scroll.readerScrollTop ?? 0;
      }
    };

    previousRestoreHrefRef.current = href;
    frameOne = window.requestAnimationFrame(() => {
      restore();
      frameTwo = window.requestAnimationFrame(restore);
      for (const delay of SCROLL_RESTORE_RETRY_MS) {
        restoreTimers.push(window.setTimeout(restore, delay));
      }
    });

    return () => {
      window.cancelAnimationFrame(frameOne);
      window.cancelAnimationFrame(frameTwo);
      for (const timer of restoreTimers) window.clearTimeout(timer);
    };
  }, [href, listRef, readerRef, restoreKey, section]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const list = listRef?.current ?? null;
    const reader = readerRef?.current ?? null;
    if (!list && !reader) return;

    let timer = 0;
    const recordListScroll = () => {
      const scrollTop = scrollTopForWorkspaceMemory(list);
      if (typeof scrollTop === "number") latestListScrollRef.current = scrollTop;
    };
    const recordReaderScroll = () => {
      const scrollTop = scrollTopForWorkspaceMemory(reader);
      if (typeof scrollTop === "number") latestReaderScrollRef.current = scrollTop;
    };
    const save = () => {
      if (timer) {
        window.clearTimeout(timer);
        timer = 0;
      }
      rememberWorkspaceScroll(section, href, {
        listScrollTop: latestListScrollRef.current,
        readerScrollTop: latestReaderScrollRef.current,
      });
    };
    const scheduleSave = () => {
      if (timer) return;
      timer = window.setTimeout(save, 120);
    };
    const recordAndScheduleListSave = () => {
      recordListScroll();
      scheduleSave();
    };
    const recordAndScheduleReaderSave = () => {
      recordReaderScroll();
      scheduleSave();
    };
    const recordAndSave = () => {
      recordListScroll();
      recordReaderScroll();
      save();
    };
    const saveBeforeKeyboardNavigation = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") recordAndSave();
    };

    list?.addEventListener("scroll", recordAndScheduleListSave, { passive: true });
    list?.addEventListener("pointerdown", recordAndSave, { passive: true });
    list?.addEventListener("keydown", saveBeforeKeyboardNavigation);
    reader?.addEventListener("scroll", recordAndScheduleReaderSave, { passive: true });
    window.addEventListener("pagehide", recordAndSave);

    return () => {
      save();
      list?.removeEventListener("scroll", recordAndScheduleListSave);
      list?.removeEventListener("pointerdown", recordAndSave);
      list?.removeEventListener("keydown", saveBeforeKeyboardNavigation);
      reader?.removeEventListener("scroll", recordAndScheduleReaderSave);
      window.removeEventListener("pagehide", recordAndSave);
    };
  }, [href, listRef, readerRef, section]);
}

function normalizeSearch(search: string) {
  if (!search) return "";
  return search.startsWith("?") ? search : `?${search}`;
}

function workspaceSectionFromHref(href: string): WorkspaceSection | null {
  return workspaceSectionFromPath(parseHref(href)?.pathname ?? "");
}

function sanitizeWorkspaceHref(href: string, section: WorkspaceSection): string | null {
  const parsed = parseHref(href);
  if (!parsed || workspaceSectionFromPath(parsed.pathname) !== section) return null;
  for (const key of TRANSIENT_QUERY_KEYS) parsed.searchParams.delete(key);
  const query = parsed.searchParams.toString();
  return query ? `${parsed.pathname}?${query}` : parsed.pathname;
}

function feedTypeFromHref(href: string): WorkspaceFeedType {
  const value = searchValueFromHref(href, "type");
  return FEED_TYPES.has(value as WorkspaceFeedType) ? (value as WorkspaceFeedType) : "article";
}

function searchValueFromHref(href: string, key: string): string | null {
  return parseHref(href)?.searchParams.get(key) ?? null;
}

function parseHref(href: string):
  | {
      pathname: string;
      search: string;
      searchParams: URLSearchParams;
    }
  | null {
  if (!href.startsWith("/")) return null;
  try {
    const url = new URL(href, BASE_URL);
    return {
      pathname: url.pathname,
      search: url.search,
      searchParams: url.searchParams,
    };
  } catch {
    return null;
  }
}

function readMemory(storage?: StorageLike): WorkspaceMemory {
  const store = getStorage(storage);
  if (!store) return {};
  try {
    const raw = store.getItem(WORKSPACE_MEMORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as WorkspaceMemory;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeMemory(memory: WorkspaceMemory, storage?: StorageLike, notify = false) {
  const store = getStorage(storage);
  if (!store) return;
  try {
    store.setItem(WORKSPACE_MEMORY_KEY, JSON.stringify(memory));
    if (notify) notifyWorkspaceMemoryChange();
  } catch {
    // Storage can be unavailable in private browsing or quota failures.
  }
}

function updateMemory(
  storage: StorageLike | undefined,
  update: (memory: WorkspaceMemory) => void,
  notify = false,
) {
  const memory = readMemory(storage);
  update(memory);
  writeMemory(memory, storage, notify);
}

function notifyWorkspaceMemoryChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(WORKSPACE_MEMORY_CHANGE_EVENT));
}

function getStorage(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
