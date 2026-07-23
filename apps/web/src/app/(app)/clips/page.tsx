"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ClipContentRenderer } from "../../../components/clips/ClipContentRenderer";
import { CardActionMenu } from "../../../components/shell/CardActionMenu";
import { ListColumn } from "../../../components/shell/ListColumn";
import { ListContentSkeleton } from "../../../components/shell/ListContentSkeleton";
import { PrototypeIcon } from "../../../components/shell/PrototypeIcon";
import { ReaderBackToTopButton } from "../../../components/shell/ReaderBackToTopButton";
import { ReaderContentSkeleton } from "../../../components/shell/ReaderContentSkeleton";
import { ReaderToolbar } from "../../../components/shell/ReaderToolbar";
import {
  useReaderToolbarTitleVisibility,
} from "../../../components/shell/useReaderToolbarTitleVisibility";
import { useToast } from "../../../components/ui/ToastProvider";
import { clipPreviewText } from "../../../lib/clip-card";
import {
  currentStableSelectionPath,
  pushStableSelectionUrl,
} from "../../../lib/stable-selection-url";
import { useWorkspaceMemory } from "../../../lib/workspace-memory";
import {
  getCachedWorkspaceDetail,
  getCachedWorkspaceList,
  getCachedWorkspaceSelection,
  isWorkspaceDetailFresh,
  loadWorkspaceResource,
  removeCachedWorkspaceItem,
  setCachedWorkspaceDetail,
  setCachedWorkspaceList,
  setCachedWorkspaceSelection,
} from "../../../lib/workspace-data-cache";
import { workspaceResourceKeys } from "../../../lib/workspace-resource-keys";

interface ClipListItem {
  id: string;
  url: string;
  title: string;
  summary: string | null;
  favicon: string | null;
  coverImage?: string | null;
  excerpt?: string | null;
  sourceName?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  content?: string;
  createdAt: string;
  updatedAt: string;
  fetchStatus?: string;
  fetchError?: string | null;
  fetchedAt?: string | null;
  existing?: boolean;
  queued?: boolean;
}

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function normalizeClipUrl(url: string) {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function Favicon({ clip }: { clip: Pick<ClipListItem, "favicon" | "url"> }) {
  const domain = getDomain(clip.url);
  return (
    <span className="mewmo-favicon">
      {clip.favicon ? <img src={clip.favicon} alt="" /> : domain.charAt(0)}
    </span>
  );
}

function formatArticleDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function articleMetaItems(clip: ClipListItem) {
  const sourceName = clip.sourceName || getDomain(clip.url);
  const author = clip.author && clip.author !== sourceName ? clip.author : null;
  const publishedAt = formatArticleDate(clip.publishedAt);
  return [sourceName, author, publishedAt].filter(Boolean) as string[];
}

export default function ClipsPage() {
  const { showToast } = useToast();
  const parentRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cachedClips = getCachedWorkspaceList<ClipListItem>("clips");
  const [clips, setClips] = useState<ClipListItem[]>(cachedClips ?? []);
  const [isLoading, setIsLoading] = useState(!cachedClips);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [listCollapsed, setListCollapsed] = useState(false);
  const cachedSelectedClipId = getCachedWorkspaceSelection("clips");
  const initialSelectedClip = cachedSelectedClipId
    ? getCachedWorkspaceDetail<ClipListItem>("clips", cachedSelectedClipId)
    : null;
  const [selectedClipId, setSelectedClipId] = useState<string | null>(cachedSelectedClipId);
  const [selectedClip, setSelectedClip] = useState<ClipListItem | null>(initialSelectedClip);
  const [loadingClipId, setLoadingClipId] = useState<string | null>(null);

  const selectClip = (clip: ClipListItem | null, mode: "push" | "replace" = "push") => {
    setSelectedClipId(clip?.id ?? null);
    setCachedWorkspaceSelection("clips", clip?.id ?? null);
    setSelectedClip(
      clip
        ? getCachedWorkspaceDetail<ClipListItem>("clips", clip.id) ?? clip
        : null,
    );
    pushStableSelectionUrl(clip ? `/clips/${clip.id}` : "/clips", mode);
  };

  useEffect(() => {
    let cancelled = false;

    async function loadClips() {
      try {
        setError("");
        const data = await loadWorkspaceResource(workspaceResourceKeys.clipsList(), async () => {
          const res = await fetch("/api/clips");
          if (!res.ok) throw new Error("Failed to load clips");
          return (await res.json()) as ClipListItem[];
        });
        setCachedWorkspaceList("clips", data);
        if (!cancelled) setClips(data);
      } catch {
        if (!cancelled && !cachedClips) setError("Could not load clips.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadClips();
    return () => {
      cancelled = true;
    };
  }, []);

  async function createClipFromUrl(url: string) {
    const normalizedUrl = normalizeClipUrl(url);
    const domain = getDomain(normalizedUrl);
    showToast("正在保存剪藏...", "loading");
    try {
      setError("");
      const res = await fetch("/api/clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: normalizedUrl, title: domain }),
      });
      if (!res.ok) throw new Error("Failed to save clip");
      const clip = (await res.json()) as ClipListItem;
      setCachedWorkspaceDetail("clips", clip);
      setClips((current) => {
        const next = [clip, ...current.filter((item) => item.id !== clip.id)];
        setCachedWorkspaceList("clips", next);
        return next;
      });
      selectClip(clip);
      if (clip.existing) showToast("该内容之前已剪藏，已打开已有记录", "success");
      else showToast("已保存剪藏", "success");
    } catch (error) {
      showToast("保存剪藏失败，请重试", "error");
      throw error;
    }
  }

  const visibleClips = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...clips]
      .filter((clip) => {
        if (!normalizedQuery) return true;
        return `${clip.title} ${clip.summary ?? ""} ${clip.url} ${getDomain(clip.url)}`
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [clips, query]);

  const firstClip = visibleClips[0] ?? null;
  const previewClip =
    visibleClips.find((clip) => clip.id === selectedClipId) ?? firstClip;
  const { toolbarTitleVisible } = useReaderToolbarTitleVisibility({
    scrollRef,
  });
  useWorkspaceMemory({
    section: "clips",
    href: previewClip ? `/clips/${previewClip.id}` : "/clips",
    listRef: parentRef,
    readerRef: scrollRef,
    restoreKey: previewClip?.id ?? (isLoading ? "loading" : "ready"),
  });

  useEffect(() => {
    if (!previewClip) {
      setSelectedClip(null);
      return;
    }

    const clipToLoad = previewClip;
    let cancelled = false;
    const cachedDetail = getCachedWorkspaceDetail<ClipListItem>(
      "clips",
      clipToLoad.id,
    );
    const cacheIsFresh =
      !!cachedDetail && isWorkspaceDetailFresh("clips", clipToLoad);
    const cacheHasMeta = !!(cachedDetail?.author && cachedDetail?.publishedAt);
    setSelectedClip(cacheIsFresh && cacheHasMeta ? cachedDetail : clipToLoad);
    if (cacheIsFresh && cacheHasMeta) {
      setLoadingClipId(null);
      return;
    }
    setLoadingClipId(clipToLoad.id);

    async function loadSelectedClip() {
      try {
        const data = await loadWorkspaceResource(workspaceResourceKeys.clipDetail(clipToLoad.id), async () => {
          const res = await fetch(`/api/clips/${clipToLoad.id}`);
          if (res.status === 404) {
            removeCachedWorkspaceItem("clips", clipToLoad.id);
            throw new Error("Clip not found");
          }
          if (!res.ok) throw new Error("Failed to load clip");
          return (await res.json()) as ClipListItem;
        });
        setCachedWorkspaceDetail("clips", data);
        if (!cancelled) setSelectedClip(data);
      } catch {
        if (!cancelled) {
          const stillCached = getCachedWorkspaceDetail<ClipListItem>(
            "clips",
            clipToLoad.id,
          );
          if (stillCached) setSelectedClip(stillCached);
          else {
            setSelectedClipId(null);
            setSelectedClip(null);
          }
        }
      } finally {
        if (!cancelled) setLoadingClipId(null);
      }
    }

    void loadSelectedClip();
    return () => {
      cancelled = true;
    };
  }, [previewClip]);

  useEffect(() => {
    const handlePopState = () => {
      const match = currentStableSelectionPath().match(/^\/clips\/([^/?#]+)/);
      setSelectedClipId(match?.[1] ? decodeURIComponent(match[1]) : null);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const virtualizer = useVirtualizer({
    count: visibleClips.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 196,
    measureElement: (element) => element.getBoundingClientRect().height,
    overscan: 10,
  });

  const deleteClip = async (clip: ClipListItem) => {
    const response = await fetch(`/api/clips/${clip.id}`, { method: "DELETE" });
    if (response.ok) {
      const remaining = visibleClips.filter((item) => item.id !== clip.id);
      const next = remaining[0] ?? null;
      setClips((current) => current.filter((item) => item.id !== clip.id));
      removeCachedWorkspaceItem("clips", clip.id);
      if (clip.id === previewClip?.id) selectClip(next, "replace");
      showToast("已删除剪藏", "success");
    }
  };

  const refreshClip = async (clip: ClipListItem) => {
    showToast("正在检查更新...", "loading");
    try {
      const response = await fetch(`/api/clips/${clip.id}`, { method: "POST" });
      const data = (await response.json().catch(() => null)) as {
        clip?: ClipListItem;
        changed?: boolean;
      } | null;
      if (!response.ok || !data?.clip) throw new Error("Failed to refresh clip");
      const updatedClip = data.clip;
      setCachedWorkspaceDetail("clips", updatedClip);

      setClips((current) => {
        const next = current.map((item) =>
          item.id === updatedClip.id ? updatedClip : item,
        );
        setCachedWorkspaceList("clips", next);
        return next;
      });
      setSelectedClip((current) =>
        current?.id === updatedClip.id ? updatedClip : current,
      );
      showToast(data.changed ? "已拉取最新内容" : "已是最新", "success");
    } catch {
      showToast("检查更新失败", "error");
    }
  };

  const copyClipUrl = async (clip: ClipListItem) => {
    await navigator.clipboard?.writeText(clip.url);
    showToast("已复制链接", "success");
  };

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };
  const isSelectedClipLoading = loadingClipId === previewClip?.id;
  return (
    <div
      className={`mewmo-workspace ${listCollapsed ? "mewmo-workspace--list-collapsed" : ""}`}
    >
      <ListColumn
        title="剪藏"
        bodyRef={parentRef}
        clipUrlInput
        onSearchChange={setQuery}
        onSubmitClipUrl={createClipFromUrl}
      >
        {isLoading ? (
          <ListContentSkeleton active variant="media" label="正在加载剪藏" />
        ) : error ? (
          <div className="mewmo-list-empty">
            <PrototypeIcon name="empty" size={36} />
            <p>{error}</p>
          </div>
        ) : clips.length === 0 ? (
          <div className="mewmo-list-empty">
            <PrototypeIcon name="bookmark" size={38} />
            <p>还没有剪藏</p>
            <button
              type="button"
              className="mewmo-button"
              onClick={() =>
                document
                  .querySelector<HTMLButtonElement>(
                    ".mewmo-list-column__clip-button",
                  )
                  ?.click()
              }
            >
              添加剪藏
            </button>
          </div>
        ) : visibleClips.length === 0 ? (
          <div className="mewmo-list-empty">
            <PrototypeIcon name="search" size={34} />
            <p>没有找到匹配的剪藏</p>
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const clip = visibleClips[virtualRow.index]!;
              const menuOpen = openMenuId === clip.id;
              const cardHovered = hoveredCardId === clip.id || menuOpen;
              return (
                <article
                  key={clip.id}
                  ref={virtualizer.measureElement}
                  data-index={virtualRow.index}
                  className={`mewmo-list-card-wrap mewmo-list-card-wrap--virtual ${cardHovered ? "mewmo-list-card-wrap--hover" : ""} ${menuOpen ? "mewmo-list-card-wrap--menu-open" : ""}`}
                  onMouseEnter={() => setHoveredCardId(clip.id)}
                  onMouseLeave={() =>
                    setHoveredCardId((current) =>
                      current === clip.id ? null : current,
                    )
                  }
                  style={{
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <button
                    type="button"
                    className={`mewmo-list-card mewmo-list-card--button ${previewClip?.id === clip.id ? "mewmo-list-card--selected" : ""}`}
                    onClick={() => selectClip(clip)}
                  >
                    <div className="mewmo-list-card__title">
                      <span>{clip.title}</span>
                      {(clip.fetchStatus === "queued" || clip.fetchStatus === "fetching") && (
                        <small className="mewmo-sync-status">抓取中</small>
                      )}
                      {clip.fetchStatus === "error" && (
                        <small className="mewmo-sync-status mewmo-sync-status--error">抓取失败</small>
                      )}
                    </div>
                    <p>{clipPreviewText(clip)}</p>
                    {clip.coverImage && (
                      <div className="mewmo-list-card__cover" aria-hidden="true">
                        <img src={clip.coverImage} alt="" referrerPolicy="no-referrer" />
                      </div>
                    )}
                    <div className="mewmo-list-card__source mewmo-list-card__source--clip">
                      <Favicon clip={clip} />
                      {articleMetaItems(clip).map((metaItem, index) => (
                        <span key={`${metaItem}-${index}`}>
                          {index > 0 && <b aria-hidden="true">·</b>}
                          {metaItem}
                        </span>
                      ))}
                    </div>
                  </button>
                  <CardActionMenu
                    kind="clips"
                    open={menuOpen}
                    ariaLabel="剪藏操作"
                    onOpenChange={(open) =>
                      setOpenMenuId(open ? clip.id : null)
                    }
                    onDelete={() => void deleteClip(clip)}
                    onRefresh={() => void refreshClip(clip)}
                    onCopyLink={() => void copyClipUrl(clip)}
                    href={clip.url}
                    moveToKnowledgeTarget={{ kind: "clip", clipId: clip.id, title: clip.title }}
                  />
                </article>
              );
            })}
          </div>
        )}
      </ListColumn>

      <section className="mewmo-reader-surface">
        <ReaderToolbar
          title={selectedClip?.title ?? firstClip?.title ?? "剪藏"}
          titleVisible={toolbarTitleVisible}
          onTitleClick={scrollToTop}
          onToggleList={() => setListCollapsed((value) => !value)}
          listCollapsed={listCollapsed}
          menuKind="clips"
          onDelete={selectedClip ? () => void deleteClip(selectedClip) : undefined}
          onRefresh={selectedClip ? () => void refreshClip(selectedClip) : undefined}
          onCopyLink={selectedClip ? () => void copyClipUrl(selectedClip) : undefined}
          href={selectedClip?.url}
          moveToKnowledgeTarget={selectedClip ? { kind: "clip", clipId: selectedClip.id, title: selectedClip.title } : undefined}
        />
        <div ref={scrollRef} className="mewmo-reader-scroll">
          {selectedClip ? (
            <article className="mewmo-document mewmo-document--clip">
              <h1>{selectedClip.title}</h1>
              {(isSelectedClipLoading || selectedClip.fetchStatus === "queued" || selectedClip.fetchStatus === "fetching") &&
              !selectedClip.content ? (
                <ReaderContentSkeleton active showTitle={false} label="正在加载正文" />
              ) : (
                <>
                  <div className="mewmo-doc-meta">
                    {articleMetaItems(selectedClip).map((item, index) => (
                      <span key={`${item}-${index}`}>
                        {index > 0 && <b aria-hidden="true">·</b>}
                        {item}
                      </span>
                    ))}
                    <span>
                      <b aria-hidden="true">·</b>
                      <a
                        className="mewmo-doc-meta__link"
                        href={selectedClip.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        原文
                      </a>
                    </span>
                  </div>
                  <ClipContentRenderer
                    html={selectedClip.content ?? ""}
                    sourceUrl={selectedClip.url}
                    contentKey={selectedClip.id}
                    loading={isSelectedClipLoading || selectedClip.fetchStatus === "queued" || selectedClip.fetchStatus === "fetching"}
                  />
                </>
              )}
            </article>
          ) : isLoading ? (
            <article className="mewmo-document mewmo-document--clip">
              <ReaderContentSkeleton active showTitle label="正在加载剪藏" />
            </article>
          ) : (
            <article className="mewmo-document mewmo-document--empty">
              <h1>选择一条剪藏</h1>
              <p>保存的文章和网页会在这里打开。</p>
            </article>
          )}
        </div>
        <ReaderBackToTopButton scrollRef={scrollRef} visible={toolbarTitleVisible} />
      </section>
    </div>
  );
}
