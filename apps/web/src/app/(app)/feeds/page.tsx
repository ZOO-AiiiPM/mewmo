"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { ClipContentRenderer } from "../../../components/clips/ClipContentRenderer";
import { CardActionMenu } from "../../../components/shell/CardActionMenu";
import { ListColumn } from "../../../components/shell/ListColumn";
import { PrototypeIcon, type PrototypeIconName } from "../../../components/shell/PrototypeIcon";
import { useAISidebarContext } from "../../../components/shell/AISidebar";
import { ReaderBackToTopButton } from "../../../components/shell/ReaderBackToTopButton";
import { ReaderToolbar } from "../../../components/shell/ReaderToolbar";
import { ReaderToc } from "../../../components/shell/ReaderToc";
import { useReaderToolbarTitleVisibility } from "../../../components/shell/useReaderToolbarTitleVisibility";
import { FloatingMenuButton, FloatingMenuLink, PopoverMenu } from "../../../components/ui/FloatingMenu";
import { useToast } from "../../../components/ui/ToastProvider";
import { clipPreviewText, formatClipListTime } from "../../../lib/clip-card";
import { submitFeedAddBatch } from "../../../lib/feed-add-batch";
import { selectAllFeedUrls, toggleFeedUrl, type FeedAddOutcomeStatus } from "../../../lib/feed-add-selection";
import { buildFeedCardMeta, buildFeedReaderMeta } from "../../../lib/feed-display";
import { getFeedAddToast, getFeedEmptyState } from "../../../lib/feed-status";
import { proxiedImageUrl } from "../../../lib/image-proxy";
import { buildHtmlToc } from "../../../lib/note-toc";
import {
  clearCachedFeedEntries,
  getCachedFeedEntries,
  getCachedFeedSources,
  loadWorkspaceResource,
  setCachedFeedEntries,
  setCachedFeedSources,
  updateCachedFeedEntry,
} from "../../../lib/workspace-data-cache";
import { useRememberedFeedTypeHref, useWorkspaceMemory } from "../../../lib/workspace-memory";

type FeedType = "article" | "media" | "video" | "podcast";

const feedTypes: Array<{
  type: FeedType;
  label: string;
  icon: PrototypeIconName;
  deferred?: boolean;
}> = [
  { type: "article", label: "文章", icon: "doc" },
  { type: "media", label: "媒体", icon: "media" },
  { type: "video", label: "视频", icon: "video", deferred: true },
  { type: "podcast", label: "播客", icon: "mic", deferred: true },
];

const MODAL_EXIT_MS = 160;
const INITIAL_FEED_LIMITS = [5, 10, 20, 50] as const;
const DEFAULT_INITIAL_FEED_LIMIT = 10;
type InitialFeedLimit = (typeof INITIAL_FEED_LIMITS)[number];

interface FeedSource {
  id: string;
  url: string;
  type: FeedType;
  title: string;
  description: string | null;
  favicon: string | null;
  unreadCount: number;
  lastFetchedAt: string | null;
  lastFetchStatus?: string;
  lastFetchError?: string | null;
  lastFetchCount?: number;
  lastFetchStartedAt?: string | null;
  existing?: boolean;
  initialFetch?: {
    status: "success" | "error";
    fetched: number;
    created: number;
    requested: number;
    error?: string;
  };
}

interface FeedEntry {
  id: string;
  feedId: string;
  title: string;
  url: string;
  content: string;
  summary: string | null;
  coverImage: string | null;
  excerpt: string | null;
  sourceName: string | null;
  author: string | null;
  publishedAt: string | null;
  readAt: string | null;
  createdAt: string;
  isFavorited?: boolean;
  feed: {
    id: string;
    title: string;
    url: string;
    favicon: string | null;
    type: FeedType;
  };
}

interface DiscoverCandidate {
  title: string;
  url: string;
  siteUrl?: string;
  description?: string;
  favicon?: string;
  type?: FeedType;
  sourceKind?: string;
}

export default function FeedsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchString = searchParams.toString();
  const workspaceHref = searchString ? `${pathname}?${searchString}` : pathname;

  const parsedType = parseFeedType(searchParams.get("type"));
  const type = parsedType ?? "article";
  const feedId = searchParams.get("feedId");
  const entryId = searchParams.get("entryId");
  const addOpen = searchParams.get("add") === "1";
  const currentType = feedTypes.find((item) => item.type === type) ?? feedTypes[0]!;
  const isDeferredType = Boolean(currentType.deferred);

  const initialFeeds = getCachedFeedSources<FeedSource>(type);
  const initialFeedId = feedId ?? initialFeeds?.[0]?.id ?? null;
  const initialEntries = initialFeedId ? getCachedFeedEntries<FeedEntry>(initialFeedId) : null;

  const [feeds, setFeeds] = useState<FeedSource[]>(() => initialFeeds ?? []);
  const [entries, setEntries] = useState<FeedEntry[]>(() => initialEntries ?? []);
  const [loading, setLoading] = useState(() => initialEntries === null);
  const [feedsLoaded, setFeedsLoaded] = useState(() => initialFeeds !== null);
  const [error, setError] = useState("");
  const [swapKey, setSwapKey] = useState(`${type}:${feedId ?? "all"}`);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const feedsRequestRef = useRef(0);
  const entriesRequestRef = useRef(0);
  const effectiveFeedId = feedId ?? feeds[0]?.id ?? null;

  const selectedFeed = useMemo(() => feeds.find((feed) => feed.id === effectiveFeedId) ?? null, [effectiveFeedId, feeds]);
  const visibleEntries = useMemo(() => [...entries].sort((left, right) => feedEntryTimestamp(right) - feedEntryTimestamp(left)), [entries]);
  const selectedEntry = useMemo(() => {
    if (entryId) return visibleEntries.find((entry) => entry.id === entryId) ?? null;
    return visibleEntries[0] ?? null;
  }, [entryId, visibleEntries]);
  const rememberedFeedTypeHrefs: Record<FeedType, string> = {
    article: useRememberedFeedTypeHref("article", "/feeds?type=article"),
    media: useRememberedFeedTypeHref("media", "/feeds?type=media"),
    video: useRememberedFeedTypeHref("video", "/feeds?type=video"),
    podcast: useRememberedFeedTypeHref("podcast", "/feeds?type=podcast"),
  };
  const { toolbarTitleVisible } = useReaderToolbarTitleVisibility({
    scrollRef,
  });
  useWorkspaceMemory({
    section: "feeds",
    href: workspaceHref,
    listRef,
    readerRef: scrollRef,
    restoreKey: loading ? "loading" : "ready",
  });
  const selectedEntryToc = useMemo(() => buildHtmlToc(selectedEntry?.content ?? ""), [selectedEntry?.content]);
  const { setContentContext } = useAISidebarContext();
  const emptyState = useMemo(
    () => getFeedEmptyState({ feedId: effectiveFeedId, selectedFeed, feedsLoaded }),
    [effectiveFeedId, feedsLoaded, selectedFeed],
  );

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const closeAddModal = () => updateParams({ add: null });
  const openAddModal = () => updateParams({ add: "1" });

  const loadFeeds = useCallback(async () => {
    const requestId = ++feedsRequestRef.current;
    const cachedFeeds = getCachedFeedSources<FeedSource>(type);
    if (cachedFeeds) {
      setFeeds(cachedFeeds);
      setFeedsLoaded(true);
    } else {
      setFeeds([]);
      setFeedsLoaded(false);
    }
    if (isDeferredType) {
      setFeeds([]);
      setFeedsLoaded(true);
      return;
    }
    try {
      const nextFeeds = await loadWorkspaceResource(`feeds:list:${type}`, async () => {
        const response = await fetch(`/api/feeds?type=${type}`);
        if (!response.ok) throw new Error("feeds");
        return (await response.json()) as FeedSource[];
      });
      if (feedsRequestRef.current !== requestId) return;
      setCachedFeedSources(type, nextFeeds);
      setFeeds(nextFeeds);
    } finally {
      if (feedsRequestRef.current === requestId) setFeedsLoaded(true);
    }
  }, [isDeferredType, type]);

  const loadEntries = useCallback(async () => {
    const requestId = ++entriesRequestRef.current;
    if (isDeferredType) {
      setEntries([]);
      setLoading(false);
      setError("");
      return;
    }
    if (!effectiveFeedId && !feedsLoaded) {
      setLoading(true);
      setError("");
      return;
    }
    const cachedEntries = effectiveFeedId ? getCachedFeedEntries<FeedEntry>(effectiveFeedId) : null;
    if (cachedEntries) {
      setEntries(cachedEntries);
      setLoading(false);
    } else {
      setEntries([]);
      setLoading(true);
    }
    setError("");
    const params = new URLSearchParams({ type });
    if (effectiveFeedId) params.set("feedId", effectiveFeedId);
    try {
      const requestKey = effectiveFeedId ? `feeds:entries:${effectiveFeedId}` : `feeds:entries:all:${type}`;
      const result = await loadWorkspaceResource(requestKey, async () => {
        const response = await fetch(`/api/feed-entries?${params.toString()}`);
        if (!response.ok) {
          return { entries: null, status: response.status } as const;
        }
        return {
          entries: (await response.json()) as FeedEntry[],
          status: response.status,
        };
      });
      if (entriesRequestRef.current !== requestId) return;
      if (!result.entries) {
        if (!cachedEntries) {
          setError(result.status === 404 ? "这个订阅源不存在或已删除。" : "订阅条目加载失败。");
        }
        return;
      }
      const nextEntries = result.entries;
      if (effectiveFeedId) setCachedFeedEntries(effectiveFeedId, nextEntries);
      setEntries(nextEntries);
    } catch {
      if (entriesRequestRef.current === requestId && !cachedEntries) {
        setError("订阅条目加载失败。");
      }
    } finally {
      if (entriesRequestRef.current === requestId) setLoading(false);
    }
  }, [effectiveFeedId, feedsLoaded, isDeferredType, type]);

  useEffect(() => {
    void loadFeeds().catch(() => {
      if (!getCachedFeedSources<FeedSource>(type)) setFeeds([]);
      setFeedsLoaded(true);
    });
  }, [loadFeeds, type]);

  useEffect(() => {
    setSwapKey(`${type}:${effectiveFeedId ?? "none"}:${Date.now()}`);
    void loadEntries();
  }, [effectiveFeedId, loadEntries, type]);

  useEffect(() => {
    const refreshAfterSourceUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ feedId?: string; type?: FeedType }>).detail;
      if (detail?.type !== type) return;
      if (effectiveFeedId && detail.feedId !== effectiveFeedId) return;
      void Promise.all([loadFeeds(), loadEntries()]);
    };

    window.addEventListener("mewmo:feed-refreshed", refreshAfterSourceUpdate);
    return () => window.removeEventListener("mewmo:feed-refreshed", refreshAfterSourceUpdate);
  }, [effectiveFeedId, loadEntries, loadFeeds, type]);

  useEffect(() => {
    if (!selectedEntry) {
      setContentContext(null);
      return;
    }

    setContentContext({
      kind: "feed_entry",
      id: selectedEntry.id,
      title: selectedEntry.title,
      sourceLabel: selectedEntry.feed.title || selectedEntry.sourceName || selectedFeed?.title || "订阅文章",
      summary: selectedEntry.summary,
    });

    return () => setContentContext(null);
  }, [selectedEntry, selectedFeed?.title, setContentContext]);

  useEffect(() => {
    if (!selectedEntry || selectedEntry.readAt) return;
    void fetch(`/api/feed-entries/${selectedEntry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: true }),
    }).then((response) => {
      if (!response.ok) return;
      const readAt = new Date().toISOString();
      setEntries((current) => current.map((entry) => (entry.id === selectedEntry.id ? { ...entry, readAt } : entry)));
      updateCachedFeedEntry<FeedEntry>(selectedEntry.feedId, selectedEntry.id, (entry) => ({
        ...entry,
        readAt,
      }));
    });
  }, [selectedEntry]);

  const selectEntry = (entry: FeedEntry) => {
    updateParams({
      type: entry.feed.type,
      feedId: entry.feedId,
      entryId: entry.id,
    });
  };

  const refreshCurrent = useCallback(async () => {
    if (isDeferredType) return;
    const target = effectiveFeedId ? "该订阅" : "全部订阅";
    showToast(`检查${target}更新...`, "loading");
    try {
      const response = await fetch(effectiveFeedId ? `/api/feeds/${effectiveFeedId}/refresh` : `/api/feeds/refresh?type=${type}`, {
        method: "POST",
      });
      const data = (await response.json().catch(() => null)) as {
        queued?: boolean;
        checked?: number;
      } | null;
      if (!response.ok || (effectiveFeedId && !data?.queued)) throw new Error("refresh");
      showToast("已安排更新，后台定时任务会处理", "success");
      await Promise.all([loadFeeds(), loadEntries()]);
    } catch {
      showToast("检查订阅更新失败", "error");
    }
  }, [effectiveFeedId, isDeferredType, loadEntries, loadFeeds, showToast, type]);

  const favoriteEntry = useCallback(async (entry: FeedEntry) => {
    if (entry.isFavorited) {
      showToast("已收藏", "success");
      return;
    }

    showToast("正在收藏...", "loading");
    try {
      const response = await fetch(`/api/feed-entries/${entry.id}/favorite`, {
        method: "POST",
      });
      const data = (await response.json().catch(() => null)) as {
        isFavorited?: boolean;
        created?: boolean;
        clip?: { id: string };
      } | null;
      if (!response.ok || !data?.isFavorited) throw new Error("favorite");
      setEntries((current) => current.map((item) => (item.id === entry.id ? { ...item, isFavorited: true } : item)));
      updateCachedFeedEntry<FeedEntry>(entry.feedId, entry.id, (cachedEntry) => ({
        ...cachedEntry,
        isFavorited: true,
      }));
      showToast(data.created ? "已保存到剪藏" : "已收藏", "success");
    } catch {
      showToast("收藏失败，请稍后再试", "error");
    }
  }, [showToast]);

  const copyEntryLink = useCallback((entry: FeedEntry) => {
    if (!entry.url) return;
    void navigator.clipboard?.writeText(entry.url);
    showToast("已复制原文链接", "success");
  }, [showToast]);

  const quickSwitch = (
    <>
      {feedTypes
        .filter((item) => item.type !== type)
        .map((item) =>
          item.deferred ? (
            <FloatingMenuButton
              key={item.type}
              icon={item.icon}
              onClick={() => {
                updateParams({ type: item.type, feedId: null, entryId: null });
                showToast(`${item.label}订阅还在路上`, "error");
              }}
            >
              {item.label}
            </FloatingMenuButton>
          ) : (
            <FloatingMenuLink key={item.type} href={rememberedFeedTypeHrefs[item.type]} icon={item.icon} scroll={false}>
              {item.label}
            </FloatingMenuLink>
          ),
        )}
    </>
  );

  const title = selectedFeed?.title ?? currentType.label;
  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="mewmo-workspace">
      <ListColumn
        title={title}
        bodyRef={listRef}
        quickSwitch={quickSwitch}
        searchPlaceholder="搜索订阅条目..."
        action={
          <button type="button" className="mewmo-icon-button" onClick={openAddModal} aria-label="新增订阅">
            <PrototypeIcon name="plus" size={17} />
          </button>
        }
      >
        <div key={swapKey} className="mewmo-list-stack mewmo-feed-list-swap">
          {isDeferredType ? (
            <FeedPlaceholder icon={currentType.icon} title={`${currentType.label}订阅还在路上`} />
          ) : error ? (
            <p className="mewmo-list-card text-coral">{error}</p>
          ) : loading ? (
            <p className="mewmo-list-card">正在检查订阅条目...</p>
          ) : visibleEntries.length === 0 ? (
            <FeedPlaceholder
              icon="rss"
              title={emptyState.title}
              detail={emptyState.detail}
              actionLabel={emptyState.canRefresh ? "检查更新" : undefined}
              onAction={emptyState.canRefresh ? () => void refreshCurrent() : undefined}
            />
          ) : (
            visibleEntries.map((entry) => {
              const entryDate = entry.publishedAt ?? entry.createdAt;
              const meta = buildFeedCardMeta(entry, effectiveFeedId);
              const menuOpen = openMenuId === entry.id;
              return (
                <article
                  key={entry.id}
                  className={`mewmo-list-card-wrap ${menuOpen ? "mewmo-list-card-wrap--menu-open" : ""}`}
                >
                  <button
                    type="button"
                    className={`mewmo-list-card mewmo-list-card--button mewmo-feed-entry-card ${selectedEntry?.id === entry.id ? "mewmo-list-card--selected" : ""}`}
                    onClick={() => selectEntry(entry)}
                  >
                    <div className="mewmo-list-card__title">
                      {!entry.readAt && <i className="mewmo-unread-dot" />}
                      <span>{entry.title}</span>
                    </div>
                    <p>{clipPreviewText(entry) || "这个订阅条目暂时没有摘要。"}</p>
                    {entry.coverImage && (
                      <div className="mewmo-list-card__cover" aria-hidden="true">
                        <img src={proxiedImageUrl(entry.coverImage)} alt="" />
                      </div>
                    )}
                    <div className="mewmo-list-card__source mewmo-list-card__source--clip">
                      {meta.map((item) =>
                        item === entryDate ? (
                          <time key={item} dateTime={item}>
                            {formatClipListTime(item)}
                          </time>
                        ) : (
                          <span key={item}>{item}</span>
                        ),
                      )}
                    </div>
                    {entry.isFavorited && (
                      <span className="mewmo-feed-entry-card__favorite" aria-label="已保存到剪藏">
                        <PrototypeIcon name="bookmark" size={14} dual />
                      </span>
                    )}
                  </button>
                  <CardActionMenu
                    kind="feed"
                    open={menuOpen}
                    ariaLabel="订阅文章操作"
                    favoriteActive={Boolean(entry.isFavorited)}
                    onOpenChange={(open) => setOpenMenuId(open ? entry.id : null)}
                    onFavorite={() => void favoriteEntry(entry)}
                    onCopyLink={() => copyEntryLink(entry)}
                  />
                </article>
              );
            })
          )}
        </div>
      </ListColumn>

      <section className="mewmo-reader-surface">
        <ReaderToolbar
          title={selectedEntry?.title ?? title}
          titleVisible={toolbarTitleVisible}
          onTitleClick={scrollToTop}
          menuKind="feed"
          favoriteActive={Boolean(selectedEntry?.isFavorited)}
          onFavorite={selectedEntry ? () => void favoriteEntry(selectedEntry) : undefined}
          onCopyLink={selectedEntry ? () => copyEntryLink(selectedEntry) : undefined}
        />
        <ReaderToc
          items={selectedEntryToc}
          scrollRef={scrollRef}
          headingSelector=".mewmo-feed-doc .mewmo-clip-prose h1, .mewmo-feed-doc .mewmo-clip-prose h2, .mewmo-feed-doc .mewmo-clip-prose h3"
          ariaLabel="订阅文章目录"
          minItems={3}
        />
        <div ref={scrollRef} className="mewmo-reader-scroll">
          {selectedEntry ? (
            <FeedReader entry={selectedEntry} />
          ) : (
            <article className="mewmo-document mewmo-document--empty">
              <h1>{isDeferredType ? `${currentType.label}订阅待开发` : "选择一篇订阅条目"}</h1>
              <p>{isDeferredType ? "这个分类先保留原型入口，真实抓取稍后接入。" : "从左侧条目流选择内容，阅读器会保持在当前工作台里。"}</p>
            </article>
          )}
        </div>
        <ReaderBackToTopButton scrollRef={scrollRef} visible={toolbarTitleVisible} />
      </section>

      <AddFeedModal
        open={addOpen}
        initialType={isDeferredType ? "article" : type}
        autoDetectType={addOpen && !parsedType}
        onClose={closeAddModal}
        onAdded={(addedFeeds, close) => {
          for (const feed of addedFeeds) {
            const cachedSources = getCachedFeedSources<FeedSource>(feed.type) ?? [];
            setCachedFeedSources(feed.type, [feed, ...cachedSources.filter((source) => source.id !== feed.id)]);
            clearCachedFeedEntries(feed.id);
            window.dispatchEvent(
              new CustomEvent("mewmo:feed-sources-changed", {
                detail: { type: feed.type },
              }),
            );
          }
          void loadFeeds();
          void loadEntries();
          if (!close || addedFeeds.length === 0) return;
          closeAddModal();
          const first = addedFeeds[0]!;
          router.push(`/feeds?type=${first.type}&feedId=${first.id}`, {
            scroll: false,
          });
        }}
      />
    </div>
  );
}

function FeedReader({ entry }: { entry: FeedEntry }) {
  const sourceDate = entry.publishedAt ?? entry.createdAt;
  const meta = buildFeedReaderMeta({ entry }).map((item) => (item === sourceDate ? formatDate(item) : item));

  return (
    <article className="mewmo-document mewmo-feed-reader mewmo-feed-doc">
      <h1>{entry.title}</h1>
      <div className="mewmo-doc-meta">
        {meta.map((item, index) => (
          <span key={`${item}-${index}`}>
            {index > 0 && <b aria-hidden="true">·</b>}
            {item}
          </span>
        ))}
        <span>
          {meta.length > 0 && <b aria-hidden="true">·</b>}
          <a className="mewmo-doc-meta__link" href={entry.url} target="_blank" rel="noreferrer">
            原文
          </a>
        </span>
      </div>
      <ClipContentRenderer html={entry.content} sourceUrl={entry.url} contentKey={entry.id} />
    </article>
  );
}

function feedEntryTimestamp(entry: FeedEntry) {
  const timestamp = Date.parse(entry.publishedAt ?? entry.createdAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function AddFeedModal({
  open,
  initialType,
  autoDetectType,
  onClose,
  onAdded,
}: {
  open: boolean;
  initialType: FeedType;
  autoDetectType: boolean;
  onClose: () => void;
  onAdded: (feeds: FeedSource[], close: boolean) => void;
}) {
  const { showToast } = useToast();
  const [mounted, setMounted] = useState(open);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<FeedType>(initialType);
  const [results, setResults] = useState<DiscoverCandidate[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [addOutcomes, setAddOutcomes] = useState<Record<string, FeedAddOutcomeStatus>>({});
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searched, setSearched] = useState(false);
  const [autoType, setAutoType] = useState(autoDetectType);
  const [categoryMenuOpen, setCategoryMenuOpen] = useState(false);
  const [initialEntryLimit, setInitialEntryLimit] = useState<InitialFeedLimit>(DEFAULT_INITIAL_FEED_LIMIT);
  const [limitMenuOpen, setLimitMenuOpen] = useState(false);
  const categoryButtonRef = useRef<HTMLButtonElement>(null);
  const limitButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }

    const timer = window.setTimeout(() => setMounted(false), MODAL_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setSelectedUrls([]);
    setAddOutcomes({});
    setType(initialType);
    setAutoType(autoDetectType);
    setSearched(false);
    setCategoryMenuOpen(false);
    setInitialEntryLimit(DEFAULT_INITIAL_FEED_LIMIT);
    setLimitMenuOpen(false);
  }, [autoDetectType, initialType, open]);

  if (!mounted) return null;

  const selectedType = feedTypes.find((item) => item.type === type) ?? feedTypes[0]!;

  const search = async () => {
    const value = query.trim();
    if (!value) return;
    setSearching(true);
    setSearched(true);
    setResults([]);
    try {
      const response = await fetch("/api/feeds/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: value }),
      });
      if (!response.ok) {
        showToast(response.status === 503 ? "搜索服务未配置" : "订阅发现失败，请稍后再试", "error");
        return;
      }
      const data = (await response.json()) as { results?: DiscoverCandidate[] };
      const nextResults = data.results ?? [];
      setResults(nextResults);
      setSelectedUrls(nextResults[0] ? [nextResults[0].url] : []);
      setAddOutcomes({});
      if (autoType && nextResults[0]?.type && !feedTypes.find((item) => item.type === nextResults[0]!.type)?.deferred) {
        setType(nextResults[0].type);
      }
      if (nextResults.length === 0) showToast("没有发现可添加的订阅源", "error");
    } catch {
      showToast("订阅发现失败，请稍后再试", "error");
    } finally {
      setSearching(false);
    }
  };

  const add = async () => {
    const candidates = results.filter((candidate) => selectedUrls.includes(candidate.url));
    if (candidates.length === 0 || saving) return;
    setSaving(true);
    showToast(`正在添加 ${candidates.length} 个订阅...`, "loading");

    const batch = await submitFeedAddBatch(candidates, async (candidate) => {
        const response = await fetch("/api/feeds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: candidate.url,
            type,
            title: candidate.title,
            description: candidate.description,
            favicon: candidate.favicon,
            initialEntryLimit,
          }),
        });
        if (!response.ok) throw new Error("add");
        return (await response.json()) as FeedSource;
    });
    const { outcomes, persistedFeeds, savedFeeds, failedUrls: failed } = batch;

    setAddOutcomes(outcomes);
    setSelectedUrls(failed);

    if (candidates.length === 1 && persistedFeeds.length === 1 && failed.length === 0) {
      const feed = persistedFeeds[0]!;
      setSaving(false);
      setSelectedUrls([]);
      onAdded([feed], true);
      const toast = getFeedAddToast(feed);
      showToast(toast.text, toast.type);
      return;
    }

    setSaving(false);
    onAdded(persistedFeeds, failed.length === 0);

    if (failed.length > 0) {
      showToast(`已保存 ${savedFeeds.length} 个，${failed.length} 个添加失败，可重试`, "error");
    } else if (savedFeeds.length === 1) {
      const toast = getFeedAddToast(savedFeeds[0]!);
      showToast(toast.text, toast.type);
    } else {
      const initialFailures = savedFeeds.filter((feed) => feed.initialFetch?.status === "error").length;
      showToast(
        initialFailures > 0
          ? `已保存 ${savedFeeds.length} 个订阅，${initialFailures} 个会在后台自动重试`
          : `已处理 ${savedFeeds.length} 个订阅，后台会继续补全`,
        initialFailures > 0 ? "error" : "success",
      );
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void search();
  };

  return (
    <div className="mewmo-feed-modal" data-state={open ? "open" : "closed"} role="dialog" aria-modal="true" aria-labelledby="mewmo-addfeed-title">
      <button type="button" className="mewmo-feed-modal__scrim" aria-label="关闭新增订阅" onClick={onClose} />
      <div className="mewmo-feed-modal__panel addfeed">
        <div className="addfeed__head">
          <h2 id="mewmo-addfeed-title">新增订阅</h2>
          <button type="button" className="mewmo-icon-button" onClick={onClose} aria-label="关闭">
            <PrototypeIcon name="close" size={19} className="mewmo-icon-close" />
          </button>
        </div>
        <form className="addfeed__inputwrap" onSubmit={submit}>
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="粘贴 RSS / 网站 / 自部署地址，或输入关键词搜索"
          />
          <button type="submit" className="mewmo-icon-button" aria-label="搜索订阅" disabled={searching}>
            {searching ? <span className="mewmo-feed-modal__spinner" /> : <PrototypeIcon name="search" size={17} />}
          </button>
        </form>
        <p className="addfeed__hint">支持 RSS 地址 · 网站自动发现 · 自部署实例 · 关键词搜索</p>

        {results.length > 0 && !searching && (
          <div className="addfeed__selectbar">
            <span>
              已选 {selectedUrls.length} / {results.length}
            </span>
            <button type="button" onClick={() => setSelectedUrls(selectedUrls.length === results.length ? [] : selectAllFeedUrls(results))}>
              {selectedUrls.length === results.length ? "取消全选" : "全选"}
            </button>
            {selectedUrls.length > 0 && selectedUrls.length !== results.length && (
              <button type="button" onClick={() => setSelectedUrls([])}>
                取消全选
              </button>
            )}
          </div>
        )}
        <div className="addfeed__results">
          {searching ? (
            <div className="addfeed__empty">正在发现订阅源...</div>
          ) : results.length > 0 ? (
            results.map((result, index) => {
              const checked = selectedUrls.includes(result.url);
              const outcome = addOutcomes[result.url];
              return (
                <label key={`${result.url}-${index}`} className={`afr-card ${checked ? "afr-card--selected" : ""}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={saving || outcome === "added" || outcome === "existing"}
                    onChange={() => {
                      setSelectedUrls((current) => toggleFeedUrl(current, result.url));
                      setCategoryMenuOpen(false);
                      setLimitMenuOpen(false);
                      if (autoType && result.type && !feedTypes.find((item) => item.type === result.type)?.deferred) {
                        setType(result.type);
                      }
                    }}
                  />
                  <span className="mewmo-favicon">{result.favicon ? <img src={result.favicon} alt="" /> : result.title.charAt(0)}</span>
                  <span className="afr-card__copy">
                    <strong>{result.title}</strong>
                    <small>{result.description || result.siteUrl || result.url}</small>
                  </span>
                  <span className="mewmo-tag-pill">
                    {outcome === "added"
                      ? "已添加"
                      : outcome === "existing"
                        ? "已订阅"
                        : outcome === "failed"
                          ? "失败"
                          : result.sourceKind === "search"
                            ? "搜索"
                            : "RSS"}
                  </span>
                </label>
              );
            })
          ) : searched ? (
            <div className="addfeed__empty">没有发现可添加的订阅源</div>
          ) : (
            <div className="addfeed__empty">输入地址或关键词后搜索</div>
          )}
        </div>

        {selectedUrls.length > 0 && (
          <div className="addfeed__catrow">
            <div className="addfeed__catsetting">
              <span className="addfeed__catlabel">订阅至</span>
              <div className={`afr-catsel ${categoryMenuOpen ? "open" : ""}`} aria-label="订阅分类">
                <button
                  ref={categoryButtonRef}
                  type="button"
                  className="afr-catsel__btn"
                  onClick={() => {
                    setLimitMenuOpen(false);
                    setCategoryMenuOpen((value) => !value);
                  }}
                  aria-expanded={categoryMenuOpen}
                >
                  <PrototypeIcon name={selectedType.icon} size={15} className="afr-catsel__ic" />
                  <span className="afr-catsel__cur">{selectedType.label}</span>
                  <PrototypeIcon name="caret" size={12} />
                </button>
                <PopoverMenu
                  open={categoryMenuOpen}
                  anchorRef={categoryButtonRef}
                  onOpenChange={setCategoryMenuOpen}
                  align="start"
                  className="mewmo-card-menu afr-catsel__menu mewmo-addfeed-category-menu"
                >
                  {feedTypes.map((item) => (
                    <FloatingMenuButton
                      key={item.type}
                      icon={item.icon}
                      checked={type === item.type}
                      disabled={Boolean(item.deferred)}
                      onClick={() => {
                        if (item.deferred) return;
                        setAutoType(false);
                        setType(item.type);
                        setCategoryMenuOpen(false);
                      }}
                    >
                      {item.deferred ? `${item.label} · 待开发` : item.label}
                    </FloatingMenuButton>
                  ))}
                </PopoverMenu>
              </div>
            </div>
            <div className="addfeed__catsetting">
              <span className="addfeed__catlabel">首次导入</span>
              <div className={`afr-catsel ${limitMenuOpen ? "open" : ""}`} aria-label="首次导入数量">
                <button
                  ref={limitButtonRef}
                  type="button"
                  className="afr-catsel__btn afr-catsel__btn--limit"
                  onClick={() => {
                    setCategoryMenuOpen(false);
                    setLimitMenuOpen((value) => !value);
                  }}
                  aria-expanded={limitMenuOpen}
                  aria-label={`首次导入 ${initialEntryLimit} 篇`}
                >
                  <PrototypeIcon name="list" size={15} className="afr-catsel__ic" />
                  <span className="afr-catsel__cur">{initialEntryLimit} 篇</span>
                  <PrototypeIcon name="caret" size={12} />
                </button>
                <PopoverMenu
                  open={limitMenuOpen}
                  anchorRef={limitButtonRef}
                  onOpenChange={setLimitMenuOpen}
                  align="start"
                  className="mewmo-card-menu afr-catsel__menu mewmo-addfeed-limit-menu"
                >
                  {INITIAL_FEED_LIMITS.map((limit) => (
                    <FloatingMenuButton
                      key={limit}
                      icon="list"
                      checked={initialEntryLimit === limit}
                      onClick={() => {
                        setInitialEntryLimit(limit);
                        setLimitMenuOpen(false);
                      }}
                    >
                      {limit} 篇
                    </FloatingMenuButton>
                  ))}
                </PopoverMenu>
              </div>
            </div>
          </div>
        )}

        <div className="addfeed__actions">
          <button type="button" className="mewmo-button mewmo-button--ghost" onClick={onClose}>
            取消
          </button>
          <button type="button" className="mewmo-button mewmo-button--primary" onClick={() => void add()} disabled={selectedUrls.length === 0 || saving}>
            {saving ? "添加中..." : `添加所选订阅${selectedUrls.length > 1 ? ` (${selectedUrls.length})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function FeedPlaceholder({
  icon,
  title,
  detail,
  actionLabel,
  onAction,
}: {
  icon: PrototypeIconName;
  title: string;
  detail?: string | undefined;
  actionLabel?: string | undefined;
  onAction?: (() => void) | undefined;
}) {
  return (
    <div className="mewmo-feed-placeholder">
      <PrototypeIcon name={icon} size={40} />
      <span>{title}</span>
      {detail && <p>{detail}</p>}
      {actionLabel && onAction && (
        <button type="button" className="mewmo-button mewmo-button--ghost" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function parseFeedType(value: string | null): FeedType | null {
  return feedTypes.some((item) => item.type === value) ? (value as FeedType) : null;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "无日期";
  return new Date(value).toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
