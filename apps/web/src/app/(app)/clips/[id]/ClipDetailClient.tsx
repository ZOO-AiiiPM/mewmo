"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ClipContentRenderer } from "../../../../components/clips/ClipContentRenderer";
import { CardActionMenu } from "../../../../components/shell/CardActionMenu";
import { ListColumn } from "../../../../components/shell/ListColumn";
import { ReaderBackToTopButton } from "../../../../components/shell/ReaderBackToTopButton";
import { ReaderToolbar } from "../../../../components/shell/ReaderToolbar";
import { ReaderToc } from "../../../../components/shell/ReaderToc";
import {
  useReaderToolbarTitleVisibility,
} from "../../../../components/shell/useReaderToolbarTitleVisibility";
import { useAISidebarContext } from "../../../../components/shell/AISidebar";
import { useToast } from "../../../../components/ui/ToastProvider";
import { clipPreviewText, formatClipListTime } from "../../../../lib/clip-card";
import { buildHtmlToc } from "../../../../lib/note-toc";
import {
  currentStableSelectionPath,
  pushStableSelectionUrl,
} from "../../../../lib/stable-selection-url";
import { useWorkspaceMemory } from "../../../../lib/workspace-memory";
import {
  getCachedWorkspaceDetail,
  isWorkspaceDetailFresh,
  loadWorkspaceResource,
  removeCachedWorkspaceItem,
  setCachedWorkspaceDetail,
  setCachedWorkspaceList,
  setCachedWorkspaceSelection,
} from "../../../../lib/workspace-data-cache";

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
}

interface ClipDetailClientProps {
  clip: ClipListItem;
  clips: ClipListItem[];
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

export function ClipDetailClient({
  clip,
  clips: initialClips,
}: ClipDetailClientProps) {
  const { showToast } = useToast();
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [clips, setClips] = useState(initialClips);
  const [query, setQuery] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [selectedClip, setSelectedClip] = useState<ClipListItem | null>(clip);
  const [loadingClipId, setLoadingClipId] = useState<string | null>(null);

  useEffect(() => {
    setCachedWorkspaceList("clips", initialClips);
    setCachedWorkspaceDetail("clips", clip);
    setCachedWorkspaceSelection("clips", clip.id);
  }, [clip, initialClips]);

  const { setContentContext } = useAISidebarContext();

  useEffect(() => {
    if (!selectedClip) {
      setContentContext(null);
      return;
    }

    setContentContext({
      kind: "clip",
      id: selectedClip.id,
      title: selectedClip.title,
      sourceLabel: selectedClip.sourceName || getDomain(selectedClip.url),
      summary: selectedClip.summary,
    });

    return () => setContentContext(null);
  }, [
    selectedClip?.id,
    selectedClip?.sourceName,
    selectedClip?.summary,
    selectedClip?.title,
    selectedClip?.url,
    setContentContext,
  ]);

  const visibleClips = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...clips]
      .filter((item) => {
        if (!normalizedQuery) return true;
        return `${item.title} ${item.summary ?? ""} ${item.url} ${getDomain(item.url)}`
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [clips, query]);
  const selectClip = (item: ClipListItem | null, mode: "push" | "replace" = "push") => {
    if (!item) {
      setSelectedClip(null);
      setCachedWorkspaceSelection("clips", null);
      pushStableSelectionUrl("/clips", mode);
      return;
    }
    setCachedWorkspaceSelection("clips", item.id);
    const cachedDetail = getCachedWorkspaceDetail<ClipListItem>("clips", item.id);
    setSelectedClip(cachedDetail ?? item);
    pushStableSelectionUrl(`/clips/${item.id}`, mode);
    if (cachedDetail && isWorkspaceDetailFresh("clips", item)) return;

    setLoadingClipId(item.id);
    void loadWorkspaceResource(`clips:detail:${item.id}`, async () => {
      const response = await fetch(`/api/clips/${item.id}`);
      if (response.status === 404) {
        removeCachedWorkspaceItem("clips", item.id);
        throw new Error("Clip not found");
      }
      if (!response.ok) throw new Error("Failed to load clip");
      return (await response.json()) as ClipListItem;
    })
      .then((data) => {
        setCachedWorkspaceDetail("clips", data);
        setSelectedClip((current) => (current?.id === data.id ? data : current));
      })
      .catch(() => {
        if (!getCachedWorkspaceDetail("clips", item.id)) {
          setSelectedClip(null);
        }
      })
      .finally(() => setLoadingClipId((current) => (current === item.id ? null : current)));
  };
  const toc = useMemo(() => buildHtmlToc(selectedClip?.content ?? ""), [selectedClip?.content]);
  const { toolbarTitleVisible } = useReaderToolbarTitleVisibility({
    scrollRef,
  });
  useWorkspaceMemory({
    section: "clips",
    href: selectedClip ? `/clips/${selectedClip.id}` : "/clips",
    listRef,
    readerRef: scrollRef,
    restoreKey: selectedClip?.id ?? "empty",
  });

  useEffect(() => {
    const handlePopState = () => {
      const match = currentStableSelectionPath().match(/^\/clips\/([^/?#]+)/);
      const clipId = match?.[1];
      const next = clipId
        ? clips.find((item) => item.id === decodeURIComponent(clipId))
        : visibleClips[0];
      if (next) setSelectedClip(next);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [clips, visibleClips]);

  async function createClipFromUrl(url: string) {
    const normalizedUrl = normalizeClipUrl(url);
    const domain = getDomain(normalizedUrl);
    const res = await fetch("/api/clips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: normalizedUrl,
        title: domain,
      }),
    });
    if (res.ok) {
      const created = (await res.json()) as ClipListItem;
      setClips((current) => [created, ...current.filter((entry) => entry.id !== created.id)]);
      selectClip(created);
    }
  }

  const deleteClip = async (item: ClipListItem) => {
    const response = await fetch(`/api/clips/${item.id}`, { method: "DELETE" });
    if (response.ok) {
      showToast("已删除剪藏", "success");
      const remaining = visibleClips.filter((entry) => entry.id !== item.id);
      const next = remaining[0] ?? null;
      setClips((current) => current.filter((entry) => entry.id !== item.id));
      removeCachedWorkspaceItem("clips", item.id);
      if (item.id === selectedClip?.id) selectClip(next, "replace");
    }
  };

  const refreshClip = async (item: ClipListItem) => {
    showToast("正在检查更新...", "loading");
    try {
      const response = await fetch(`/api/clips/${item.id}`, { method: "POST" });
      const data = (await response.json().catch(() => null)) as {
        clip?: ClipListItem;
        changed?: boolean;
      } | null;
      if (!response.ok || !data?.clip) throw new Error("Failed to refresh clip");
      const updatedClip = data.clip;
      setCachedWorkspaceDetail("clips", updatedClip);

      setClips((current) =>
        current.map((entry) => (entry.id === updatedClip.id ? updatedClip : entry)),
      );
      setSelectedClip((current) =>
        current?.id === updatedClip.id ? updatedClip : current,
      );
      showToast(data.changed ? "已拉取最新内容" : "已是最新", "success");
    } catch {
      showToast("检查更新失败", "error");
    }
  };

  const copyClipUrl = async (item: ClipListItem) => {
    await navigator.clipboard?.writeText(item.url);
    showToast("已复制链接", "success");
  };

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };
  const isSelectedClipLoading = loadingClipId === selectedClip?.id;

  return (
    <div
      className={`mewmo-workspace ${listCollapsed ? "mewmo-workspace--list-collapsed" : ""}`}
    >
      <ListColumn
        title="剪藏"
        bodyRef={listRef}
        clipUrlInput
        onSearchChange={setQuery}
        onSubmitClipUrl={(url) => void createClipFromUrl(url)}
      >
        <div className="mewmo-list-stack">
          {visibleClips.map((item) => {
            const domain = getDomain(item.url);
            const menuOpen = openMenuId === item.id;
            const cardHovered = hoveredCardId === item.id || menuOpen;
            return (
              <article
                key={item.id}
                className={`mewmo-list-card-wrap ${cardHovered ? "mewmo-list-card-wrap--hover" : ""} ${menuOpen ? "mewmo-list-card-wrap--menu-open" : ""}`}
                onMouseEnter={() => setHoveredCardId(item.id)}
                onMouseLeave={() =>
                  setHoveredCardId((current) =>
                    current === item.id ? null : current,
                  )
                }
              >
                <button
                  type="button"
                  className={`mewmo-list-card mewmo-list-card--button ${item.id === selectedClip?.id ? "mewmo-list-card--selected" : ""}`}
                  onClick={() => selectClip(item)}
                >
                  <div className="mewmo-list-card__title">
                    <span>{item.title}</span>
                  </div>
                  <p>{clipPreviewText(item)}</p>
                  {item.coverImage && (
                    <div className="mewmo-list-card__cover" aria-hidden="true">
                      <img src={item.coverImage} alt="" referrerPolicy="no-referrer" />
                    </div>
                  )}
                  <div className="mewmo-list-card__source mewmo-list-card__source--clip">
                    <Favicon clip={item} />
                    <span>{domain}</span>
                    <time>{formatClipListTime(item.createdAt)}</time>
                  </div>
                </button>
                <CardActionMenu
                  kind="clips"
                  open={menuOpen}
                  ariaLabel="剪藏操作"
                  onOpenChange={(open) => setOpenMenuId(open ? item.id : null)}
                  onDelete={() => void deleteClip(item)}
                  onRefresh={() => void refreshClip(item)}
                  onCopyLink={() => void copyClipUrl(item)}
                  href={item.url}
                />
              </article>
            );
          })}
        </div>
      </ListColumn>

      <section className="mewmo-reader-surface">
        <ReaderToolbar
          title={selectedClip?.title ?? "剪藏"}
          titleVisible={toolbarTitleVisible}
          onTitleClick={scrollToTop}
          onToggleList={() => setListCollapsed((value) => !value)}
          listCollapsed={listCollapsed}
          menuKind="clips"
          onDelete={selectedClip ? () => void deleteClip(selectedClip) : undefined}
          onRefresh={selectedClip ? () => void refreshClip(selectedClip) : undefined}
          onCopyLink={selectedClip ? () => void copyClipUrl(selectedClip) : undefined}
        />
        <ReaderToc
          items={toc}
          scrollRef={scrollRef}
          headingSelector=".mewmo-clip-prose h1, .mewmo-clip-prose h2, .mewmo-clip-prose h3"
          ariaLabel="剪藏目录"
          minItems={3}
        />
        <div ref={scrollRef} className="mewmo-reader-scroll">
          {selectedClip ? (
            <article className="mewmo-document mewmo-document--clip">
              <h1>{selectedClip.title}</h1>
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
                loading={isSelectedClipLoading}
              />
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
