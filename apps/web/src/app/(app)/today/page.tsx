"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ListColumn } from "../../../components/shell/ListColumn";
import { PrototypeIcon, type PrototypeIconName } from "../../../components/shell/PrototypeIcon";
import { ReaderBackToTopButton } from "../../../components/shell/ReaderBackToTopButton";
import { ReaderToolbar } from "../../../components/shell/ReaderToolbar";
import { useReaderToolbarTitleVisibility } from "../../../components/shell/useReaderToolbarTitleVisibility";
import { FloatingMenuButton } from "../../../components/ui/FloatingMenu";
import { clipPreviewText, formatClipListTime } from "../../../lib/clip-card";
import { preferredFeedCardSource, preferredFeedReaderSource } from "../../../lib/feed-display";
import { extractNoteImages, notePreviewText } from "../../../lib/note-list-preview";
import {
  getRememberedWorkspaceSelection,
  rememberWorkspaceSelection,
  useWorkspaceMemory,
} from "../../../lib/workspace-memory";
import "../../../components/editor/editor-theme.css";

const NoteEditor = dynamic(
  () =>
    import("../../../components/editor/NoteEditor").then((m) => ({
      default: m.NoteEditor,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="mewmo-empty-state">
        <span className="mewmo-spinner" aria-hidden="true" />
        <p>正在加载编辑器...</p>
      </div>
    ),
  },
);

type TodayItemType = "note" | "clip" | "feed";
type TodayFilter = "all" | TodayItemType;

interface TodayItem {
  type: TodayItemType;
  id: string;
  href: string;
  title: string;
  summary?: string | null;
  content?: string | null;
  excerpt?: string | null;
  coverImage?: string | null;
  url?: string;
  favicon?: string | null;
  sourceName?: string | null;
  feedTitle?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  eventAt: string;
  createdAt: string;
  updatedAt: string;
}

const typeLabels: Record<TodayItemType, string> = {
  note: "笔记",
  clip: "剪藏",
  feed: "订阅",
};

const todayFilters: Array<{
  value: TodayFilter;
  label: string;
  icon: PrototypeIconName;
}> = [
  { value: "all", label: "全部", icon: "calendar" },
  { value: "note", label: "笔记", icon: "note" },
  { value: "clip", label: "剪藏", icon: "bookmark" },
  { value: "feed", label: "订阅", icon: "rss" },
];

function getDomain(url: string | undefined) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function todayPreview(item: TodayItem) {
  if (item.type === "note") {
    return notePreviewText({
      summary: item.summary ?? null,
      content: item.content ?? "",
    });
  }
  return clipPreviewText({
    summary: item.summary ?? null,
    excerpt: item.excerpt ?? null,
    content: item.content ?? "",
    url: item.url ?? item.href,
  });
}

function cardSourceLabel(item: TodayItem) {
  if (item.type === "note") return "";
  if (item.type === "clip") return item.sourceName || getDomain(item.url);
  return preferredFeedCardSource({
    feedTitle: item.feedTitle,
    sourceName: item.sourceName,
    url: item.url,
  });
}

function readerSourceLabel(item: TodayItem) {
  if (item.type === "note") return "";
  if (item.type === "clip") return item.sourceName || getDomain(item.url);
  return preferredFeedReaderSource({
    sourceName: item.sourceName,
    url: item.url,
    feedTitle: item.feedTitle,
  });
}

function todayTypeIcon(type: TodayItemType): PrototypeIconName {
  if (type === "note") return "note";
  if (type === "clip") return "bookmark";
  return "rss";
}

function metaTime(item: TodayItem) {
  const time = formatClipListTime(item.type === "note" ? item.updatedAt : item.eventAt);
  if (item.type === "note") return `更新于 ${time}`;
  if (item.type === "clip") return `收藏于 ${time}`;
  return time;
}

export default function TodayPage() {
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<TodayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TodayFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    getRememberedWorkspaceSelection("today"),
  );
  const [listCollapsed, setListCollapsed] = useState(false);
  const { toolbarTitleVisible } = useReaderToolbarTitleVisibility({ scrollRef });
  useWorkspaceMemory({
    section: "today",
    href: "/today",
    listRef,
    readerRef: scrollRef,
    restoreKey: loading ? "loading" : "ready",
  });

  useEffect(() => {
    let cancelled = false;

    async function loadToday() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch("/api/today");
        if (!response.ok) throw new Error("today");
        const data = (await response.json()) as TodayItem[];
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setError("今天内容加载失败。");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadToday();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...items]
      .filter((item) => {
        if (filter !== "all" && item.type !== filter) return false;
        if (!normalizedQuery) return true;
        return `${item.title} ${todayPreview(item)} ${cardSourceLabel(item)}`
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [filter, items, query]);

  const selected = visibleItems.find((item) => `${item.type}-${item.id}` === selectedId) ?? visibleItems[0] ?? null;
  const selectedPreview = selected ? todayPreview(selected) : "";
  const selectedSource = selected ? readerSourceLabel(selected) : "";
  const quickSwitch = (
    <>
      {todayFilters.map((item) => (
        <FloatingMenuButton
          key={item.value}
          icon={item.icon}
          checked={filter === item.value}
          onClick={() => setFilter(item.value)}
        >
          {item.label}
        </FloatingMenuButton>
      ))}
    </>
  );

  const handleNewNote = useCallback(async () => {
    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled" }),
    });
    if (!response.ok) {
      setError("新建笔记失败。");
      return;
    }

    const note = (await response.json()) as {
      id: string;
      slug: string;
      title: string;
      summary: string | null;
      content: string;
      createdAt: string;
      updatedAt: string;
    };
    const item: TodayItem = {
      type: "note",
      id: note.id,
      href: `/notes/${note.slug}`,
      title: note.title,
      summary: note.summary,
      content: note.content,
      eventAt: note.updatedAt,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
    };
    const key = `note-${note.id}`;
    setItems((current) => [item, ...current.filter((entry) => `${entry.type}-${entry.id}` !== key)]);
    setSelectedId(key);
    rememberWorkspaceSelection("today", key);
  }, []);

  const updateSelectedNoteContent = useCallback((content: string) => {
    if (selected?.type !== "note") return;
    setItems((current) =>
      current.map((item) =>
        item.type === "note" && item.id === selected.id
          ? { ...item, content }
          : item,
      ),
    );
  }, [selected]);

  const updateSelectedNoteTitle = useCallback((title: string) => {
    if (selected?.type !== "note") return;
    setItems((current) =>
      current.map((item) =>
        item.type === "note" && item.id === selected.id
          ? { ...item, title }
          : item,
      ),
    );
  }, [selected]);

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className={`mewmo-workspace ${listCollapsed ? "mewmo-workspace--list-collapsed" : ""}`}>
      <ListColumn
        title="今天"
        bodyRef={listRef}
        quickSwitch={quickSwitch}
        titleMenuLabel="筛选"
        searchPlaceholder="搜索今天..."
        onSearchChange={setQuery}
        action={
          <button
            type="button"
            className="mewmo-icon-button"
            onClick={() => void handleNewNote()}
            aria-label="新建笔记"
          >
            <PrototypeIcon name="pen-new-square" size={17} />
          </button>
        }
      >
        {loading ? (
          <div className="mewmo-list-empty">
            <span className="mewmo-spinner" aria-hidden="true" />
            <p>正在加载今天...</p>
          </div>
        ) : error ? (
          <div className="mewmo-list-empty">
            <PrototypeIcon name="empty" size={36} />
            <p>{error}</p>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="mewmo-list-empty">
            <PrototypeIcon name="calendar" size={38} />
            <p>{items.length === 0 ? "今天还没有新内容" : "没有找到匹配的今天内容"}</p>
          </div>
        ) : (
          <div className="mewmo-list-stack">
            {visibleItems.map((item) => {
              const preview = todayPreview(item);
              const label = cardSourceLabel(item);
              const noteImages = item.type === "note" ? extractNoteImages(item.content) : [];
              return (
                <article key={`${item.type}-${item.id}`} className="mewmo-list-card-wrap">
                  <button
                    type="button"
                    className={`mewmo-list-card mewmo-list-card--button mewmo-knowledge-card ${selected?.type === item.type && selected.id === item.id ? "mewmo-list-card--selected" : ""}`}
                    onClick={() => {
                      const key = `${item.type}-${item.id}`;
                      setSelectedId(key);
                      rememberWorkspaceSelection("today", key);
                    }}
                  >
                    <div className="mewmo-list-card__title">
                      <span>{item.title}</span>
                    </div>
                    {preview && <p>{preview}</p>}
                    {item.coverImage && (
                      <div className="mewmo-list-card__cover" aria-hidden="true">
                        <img src={item.coverImage} alt="" referrerPolicy="no-referrer" />
                      </div>
                    )}
                    {noteImages.length > 0 && (
                      <div className="mewmo-list-card__thumbs" aria-hidden="true">
                        {noteImages.map((src) => (
                          <span key={src} className="mewmo-list-card__thumb">
                            <img src={src} alt="" loading="lazy" />
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mewmo-list-card__source mewmo-knowledge-card__source">
                      <PrototypeIcon name={todayTypeIcon(item.type)} size={15} />
                      <span>{item.type === "note" ? typeLabels[item.type] : label}</span>
                      <time dateTime={item.eventAt}>{metaTime(item)}</time>
                    </div>
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </ListColumn>

      <section className="mewmo-reader-surface">
        <ReaderToolbar
          title={selected?.title ?? "今天"}
          titleVisible={toolbarTitleVisible}
          onTitleClick={scrollToTop}
          onToggleList={() => setListCollapsed((value) => !value)}
          listCollapsed={listCollapsed}
          menuKind="notes"
        />
        <div
          ref={scrollRef}
          className={`mewmo-reader-scroll ${selected?.type === "note" ? "mewmo-reader-scroll--editor" : ""}`}
        >
          {selected?.type === "note" ? (
            <NoteEditor
              key={selected.id}
              noteId={selected.id}
              initialTitle={selected.title}
              initialSummary={selected.summary ?? null}
              initialContent={selected.content ?? ""}
              updatedAt={selected.updatedAt}
              onContentChange={updateSelectedNoteContent}
              onTitleChange={updateSelectedNoteTitle}
              embedded
            />
          ) : (
            <article className="mewmo-document mewmo-document--empty">
              <h1>{selected?.title ?? "今天"}</h1>
              {selected ? (
              <>
                <div className="mewmo-doc-meta">
                  <span>{typeLabels[selected.type]}</span>
                  {selectedSource && (
                    <span>
                      <b aria-hidden="true">·</b>
                      {selectedSource}
                    </span>
                  )}
                  <span>
                    <b aria-hidden="true">·</b>
                    {metaTime(selected)}
                  </span>
                </div>
                <p>{selectedPreview || "这条内容暂时没有摘要。"}</p>
              </>
              ) : (
                <p>今天创建的笔记、收藏的剪藏和订阅更新会出现在这里。</p>
              )}
            </article>
          )}
        </div>
        <ReaderBackToTopButton scrollRef={scrollRef} visible={toolbarTitleVisible} />
      </section>
    </div>
  );
}
