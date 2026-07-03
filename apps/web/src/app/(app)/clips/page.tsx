"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ListColumn, type ListSortMode } from "../../../components/shell/ListColumn";
import { PrototypeIcon } from "../../../components/shell/PrototypeIcon";
import { ReaderToolbar } from "../../../components/shell/ReaderToolbar";
import { useToast } from "../../../components/ui/ToastProvider";

interface ClipListItem {
  id: string;
  url: string;
  title: string;
  summary: string | null;
  favicon: string | null;
  createdAt: string;
  updatedAt: string;
}

const tagPalette: Record<string, string> = {
  产品: "#4caf72",
  设计: "#e88478",
  技术: "#a874e0",
  AI: "#e0a93a",
  稍后读: "#5ba3d9",
};

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function contentTags(clip: ClipListItem) {
  const text = `${clip.title} ${clip.summary ?? ""} ${clip.url}`.toLowerCase();
  const tags = [];
  if (text.includes("ai")) tags.push("AI");
  if (text.includes("product") || text.includes("产品")) tags.push("产品");
  if (text.includes("design") || text.includes("设计")) tags.push("设计");
  if (text.includes("postgres") || text.includes("pgvector") || text.includes("技术")) tags.push("技术");
  return tags.length ? tags.slice(0, 2) : ["稍后读"];
}

export default function ClipsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const parentRef = useRef<HTMLDivElement>(null);
  const [clips, setClips] = useState<ClipListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<ListSortMode>("updated");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [listCollapsed, setListCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadClips() {
      try {
        setIsLoading(true);
        setError("");
        const res = await fetch("/api/clips");
        if (!res.ok) throw new Error("Failed to load clips");
        const data = (await res.json()) as ClipListItem[];
        if (!cancelled) setClips(data);
      } catch {
        if (!cancelled) setError("Could not load clips.");
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
    const domain = getDomain(url);
    try {
      setError("");
      const res = await fetch("/api/clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          title: domain,
          content: url,
          summary: `Saved from ${domain}`,
        }),
      });
      if (!res.ok) throw new Error("Failed to save clip");
      const clip = (await res.json()) as ClipListItem;
      setClips((current) => [clip, ...current]);
      router.push(`/clips/${clip.id}`);
    } catch {
      setError("Could not save clip.");
    }
  }

  const visibleClips = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...clips]
      .filter((clip) => {
        if (!normalizedQuery) return true;
        return `${clip.title} ${clip.summary ?? ""} ${clip.url} ${getDomain(clip.url)}`.toLowerCase().includes(normalizedQuery);
      })
      .sort((a, b) => {
        const aDate = sortMode === "created" ? a.createdAt : a.updatedAt;
        const bDate = sortMode === "created" ? b.createdAt : b.updatedAt;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      });
  }, [clips, query, sortMode]);

  const firstClip = visibleClips[0];

  const virtualizer = useVirtualizer({
    count: visibleClips.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 126,
    overscan: 10,
  });

  const deleteClip = async (clip: ClipListItem) => {
    const response = await fetch(`/api/clips/${clip.id}`, { method: "DELETE" });
    if (response.ok) {
      setClips((current) => current.filter((item) => item.id !== clip.id));
      showToast("已删除剪藏");
    }
  };

  return (
    <div className={`mewmo-workspace ${listCollapsed ? "mewmo-workspace--list-collapsed" : ""}`}>
      <ListColumn
        title="剪藏"
        bodyRef={parentRef}
        clipUrlInput
        sortMode={sortMode}
        onSortChange={setSortMode}
        onSearchChange={setQuery}
        onSubmitClipUrl={(url) => void createClipFromUrl(url)}
      >
        {isLoading ? (
          <div className="mewmo-list-empty">
            <span className="mewmo-spinner" aria-hidden="true" />
            <p>正在加载剪藏...</p>
          </div>
        ) : error ? (
          <div className="mewmo-list-empty">
            <PrototypeIcon name="empty" size={36} />
            <p>{error}</p>
          </div>
        ) : clips.length === 0 ? (
          <div className="mewmo-list-empty">
            <PrototypeIcon name="bookmark" size={38} />
            <p>还没有剪藏</p>
            <button type="button" className="mewmo-button" onClick={() => document.querySelector<HTMLButtonElement>(".mewmo-list-column__clip-button")?.click()}>
              添加剪藏
            </button>
          </div>
        ) : visibleClips.length === 0 ? (
          <div className="mewmo-list-empty">
            <PrototypeIcon name="search" size={34} />
            <p>没有找到匹配的剪藏</p>
          </div>
        ) : (
          <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const clip = visibleClips[virtualRow.index]!;
              const domain = getDomain(clip.url);
              const tags = contentTags(clip);
              const menuOpen = openMenuId === clip.id;
              return (
                <article
                  key={clip.id}
                  className={`mewmo-list-card-wrap mewmo-list-card-wrap--virtual ${menuOpen ? "mewmo-list-card-wrap--menu-open" : ""}`}
                  style={{ top: `${virtualRow.start}px`, height: `${virtualRow.size}px` }}
                >
                  <Link
                    href={`/clips/${clip.id}`}
                    className={`mewmo-list-card ${virtualRow.index === 0 ? "mewmo-list-card--selected" : ""}`}
                  >
                    <div className="mewmo-list-card__source">
                      <span className="mewmo-favicon">{clip.favicon ? "" : domain.charAt(0).toUpperCase()}</span>
                      <span>{domain}</span>
                      <time>{new Date(clip.createdAt).toLocaleDateString()}</time>
                    </div>
                    <div className="mewmo-list-card__title"><span>{clip.title}</span></div>
                    <p>{clip.summary || clip.url}</p>
                    <div className="mewmo-list-card__meta">
                      {tags.map((tag) => (
                        <span key={tag} className="mewmo-tag-pill" style={{ "--tc": tagPalette[tag] ?? tagPalette["稍后读"] } as CSSProperties}>{tag}</span>
                      ))}
                    </div>
                  </Link>
                  <div className="mewmo-list-card__action">
                    <button type="button" className="mewmo-row-action-card" onClick={() => setOpenMenuId(menuOpen ? null : clip.id)} aria-label="剪藏操作">
                      <PrototypeIcon name="more-horizontal" size={16} />
                    </button>
                    {menuOpen && (
                      <div className="mewmo-card-menu">
                        <button type="button" className="mewmo-card-menu__item mewmo-card-menu__item--danger" onClick={() => void deleteClip(clip)}><PrototypeIcon name="trash" size={15} /> 删除</button>
                        <button type="button" className="mewmo-card-menu__item" onClick={() => showToast("检查更新...")}><PrototypeIcon name="sync" size={15} /> 刷新</button>
                        <button type="button" className="mewmo-card-menu__item" onClick={() => showToast("已复制链接")}><PrototypeIcon name="copy" size={15} /> 复制链接</button>
                        <a className="mewmo-card-menu__item" href={clip.url} target="_blank" rel="noreferrer"><PrototypeIcon name="external" size={15} /> 浏览器打开</a>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </ListColumn>

      <section className="mewmo-reader-surface">
        <ReaderToolbar title={firstClip?.title ?? "剪藏"} onToggleList={() => setListCollapsed((value) => !value)} listCollapsed={listCollapsed} menuKind="clips" />
        <div className="mewmo-reader-scroll">
          <article className="mewmo-document">
            <div className="mewmo-source-strip">
              <span className="mewmo-favicon">
                {firstClip ? getDomain(firstClip.url).charAt(0).toUpperCase() : "C"}
              </span>
              <span>{firstClip ? getDomain(firstClip.url) : "已保存来源"}</span>
            </div>
            <h1>{firstClip?.title ?? "选择一条剪藏"}</h1>
            <p>{firstClip?.summary ?? "保存的文章和网页会在这里打开。"}</p>
          </article>
        </div>
      </section>
    </div>
  );
}
