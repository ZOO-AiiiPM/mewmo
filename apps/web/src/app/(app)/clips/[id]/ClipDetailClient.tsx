"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { ListColumn, type ListSortMode } from "../../../../components/shell/ListColumn";
import { PrototypeIcon } from "../../../../components/shell/PrototypeIcon";
import { ReaderToolbar } from "../../../../components/shell/ReaderToolbar";
import { useToast } from "../../../../components/ui/ToastProvider";

interface ClipListItem {
  id: string;
  url: string;
  title: string;
  summary: string | null;
  favicon: string | null;
  content?: string;
  createdAt: string;
  updatedAt: string;
}

interface ClipDetailClientProps {
  clip: ClipListItem;
  clips: ClipListItem[];
  contentText: string;
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

export function ClipDetailClient({ clip, clips: initialClips, contentText }: ClipDetailClientProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [clips, setClips] = useState(initialClips);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<ListSortMode>("updated");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [listCollapsed, setListCollapsed] = useState(false);

  const visibleClips = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...clips]
      .filter((item) => {
        if (!normalizedQuery) return true;
        return `${item.title} ${item.summary ?? ""} ${item.url} ${getDomain(item.url)}`.toLowerCase().includes(normalizedQuery);
      })
      .sort((a, b) => {
        const aDate = sortMode === "created" ? a.createdAt : a.updatedAt;
        const bDate = sortMode === "created" ? b.createdAt : b.updatedAt;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      });
  }, [clips, query, sortMode]);

  async function createClipFromUrl(url: string) {
    const domain = getDomain(url);
    const res = await fetch("/api/clips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, title: domain, content: url, summary: `Saved from ${domain}` }),
    });
    if (res.ok) {
      const created = await res.json();
      router.push(`/clips/${created.id}`);
    }
  }

  const deleteClip = async (item: ClipListItem) => {
    const response = await fetch(`/api/clips/${item.id}`, { method: "DELETE" });
    if (response.ok) {
      showToast("已删除剪藏");
      if (item.id === clip.id) router.push("/clips");
      else setClips((current) => current.filter((entry) => entry.id !== item.id));
    }
  };

  return (
    <div className={`mewmo-workspace ${listCollapsed ? "mewmo-workspace--list-collapsed" : ""}`}>
      <ListColumn
        title="剪藏"
        clipUrlInput
        sortMode={sortMode}
        onSortChange={setSortMode}
        onSearchChange={setQuery}
        onSubmitClipUrl={(url) => void createClipFromUrl(url)}
      >
        <div className="mewmo-list-stack">
          {visibleClips.map((item) => {
            const domain = getDomain(item.url);
            const tags = contentTags(item);
            const menuOpen = openMenuId === item.id;
            return (
              <article key={item.id} className={`mewmo-list-card-wrap ${menuOpen ? "mewmo-list-card-wrap--menu-open" : ""}`}>
                <Link href={`/clips/${item.id}`} className={`mewmo-list-card ${item.id === clip.id ? "mewmo-list-card--selected" : ""}`}>
                  <div className="mewmo-list-card__source">
                    <span className="mewmo-favicon">{domain.charAt(0).toUpperCase()}</span>
                    <span>{domain}</span>
                    <time>{new Date(item.createdAt).toLocaleDateString()}</time>
                  </div>
                  <div className="mewmo-list-card__title"><span>{item.title}</span></div>
                  <p>{item.summary || item.url}</p>
                  <div className="mewmo-list-card__meta">
                    {tags.map((tag) => (
                      <span key={tag} className="mewmo-tag-pill" style={{ "--tc": tagPalette[tag] ?? tagPalette["稍后读"] } as CSSProperties}>{tag}</span>
                    ))}
                  </div>
                </Link>
                <div className="mewmo-list-card__action">
                  <button type="button" className="mewmo-row-action-card" onClick={() => setOpenMenuId(menuOpen ? null : item.id)} aria-label="剪藏操作">
                    <PrototypeIcon name="more-horizontal" size={16} />
                  </button>
                  {menuOpen && (
                    <div className="mewmo-card-menu">
                      <button type="button" className="mewmo-card-menu__item mewmo-card-menu__item--danger" onClick={() => void deleteClip(item)}><PrototypeIcon name="trash" size={15} /> 删除</button>
                      <button type="button" className="mewmo-card-menu__item" onClick={() => showToast("检查更新...")}><PrototypeIcon name="sync" size={15} /> 刷新</button>
                      <button type="button" className="mewmo-card-menu__item" onClick={() => showToast("已复制链接")}><PrototypeIcon name="copy" size={15} /> 复制链接</button>
                      <a className="mewmo-card-menu__item" href={item.url} target="_blank" rel="noreferrer"><PrototypeIcon name="external" size={15} /> 浏览器打开</a>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </ListColumn>

      <section className="mewmo-reader-surface">
        <ReaderToolbar title={clip.title} onToggleList={() => setListCollapsed((value) => !value)} listCollapsed={listCollapsed} menuKind="clips" />
        <div className="mewmo-reader-scroll">
          <div className="mewmo-clip-src">
            <span className="mewmo-favicon">{getDomain(clip.url).charAt(0).toUpperCase()}</span>
            <span><strong>{getDomain(clip.url)}</strong> 收藏于 {new Date(clip.createdAt).toLocaleDateString()}</span>
            <a href={clip.url} target="_blank" rel="noreferrer"><PrototypeIcon name="external" size={14} /> 原文</a>
          </div>
          <article className="mewmo-document">
            <h1>{clip.title}</h1>
            {clip.summary && <blockquote><p>{clip.summary}</p></blockquote>}
            <p>{contentText || "No readable content saved for this clip."}</p>
          </article>
        </div>
      </section>
    </div>
  );
}
