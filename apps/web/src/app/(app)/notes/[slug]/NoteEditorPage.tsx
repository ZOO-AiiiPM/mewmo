"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import { ListColumn, type ListSortMode } from "../../../../components/shell/ListColumn";
import { PinIcon, PrototypeIcon } from "../../../../components/shell/PrototypeIcon";
import { ReaderToolbar } from "../../../../components/shell/ReaderToolbar";
import { useToast } from "../../../../components/ui/ToastProvider";
import "../../../../components/editor/editor-theme.css";

const NoteEditor = dynamic(
  () => import("../../../../components/editor/NoteEditor").then((m) => ({ default: m.NoteEditor })),
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

interface NoteListItem {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  pinned: boolean;
  updatedAt: string;
  createdAt?: string;
}

interface CurrentNote {
  id: string;
  slug: string;
  title: string;
  content: string;
}

interface NoteEditorPageProps {
  note: CurrentNote;
  notes: NoteListItem[];
}

const tagPalette: Record<string, string> = {
  产品: "#4caf72",
  数据层: "#a874e0",
  读书: "#4f93e8",
  AI: "#e0a93a",
  灵感: "#5ba3d9",
};

function contentTags(note: NoteListItem) {
  const text = `${note.title} ${note.summary ?? ""}`.toLowerCase();
  const tags = [];
  if (text.includes("产品") || text.includes("定位")) tags.push("产品");
  if (text.includes("数据") || text.includes("db") || text.includes("api")) tags.push("数据层");
  if (text.includes("ai")) tags.push("AI");
  if (text.includes("读") || text.includes("book")) tags.push("读书");
  return tags.length ? tags.slice(0, 2) : ["灵感"];
}

function buildToc(content: string) {
  const headings = content
    .split("\n")
    .map((line) => line.match(/^(#{1,2})\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match, index) => ({ id: `heading-${index}`, title: match[2] ?? "", level: match[1]?.length ?? 1 }));
  return headings.length
    ? headings.slice(0, 8)
    : [
        { id: "heading-empty-0", title: noteFallbackTitle(content), level: 1 },
        { id: "heading-empty-1", title: "正文", level: 2 },
      ];
}

function noteFallbackTitle(content: string) {
  return content.trim().split("\n").find(Boolean)?.replace(/^#+\s*/, "") || "当前笔记";
}

export function NoteEditorPage({ note, notes: initialNotes }: NoteEditorPageProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [notes, setNotes] = useState(initialNotes);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<ListSortMode>("updated");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [activeToc, setActiveToc] = useState(0);

  const handleNewNote = useCallback(async () => {
    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled" }),
    });
    if (response.ok) {
      const created = await response.json();
      router.push(`/notes/${created.slug}`);
    }
  }, [router]);

  const visibleNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...notes]
      .filter((item) => {
        if (!normalizedQuery) return true;
        return `${item.title} ${item.summary ?? ""}`.toLowerCase().includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        const aDate = sortMode === "created" ? a.createdAt ?? a.updatedAt : a.updatedAt;
        const bDate = sortMode === "created" ? b.createdAt ?? b.updatedAt : b.updatedAt;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      });
  }, [notes, query, sortMode]);

  const toc = useMemo(() => buildToc(note.content), [note.content]);

  const deleteNote = async (item: NoteListItem) => {
    const response = await fetch(`/api/notes/${item.id}`, { method: "DELETE" });
    if (response.ok) {
      showToast("已删除笔记");
      if (item.slug === note.slug) router.push("/notes");
      else setNotes((current) => current.filter((entry) => entry.id !== item.id));
    }
  };

  const togglePin = async (item: NoteListItem) => {
    const response = await fetch(`/api/notes/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !item.pinned }),
    });
    if (response.ok) {
      const updated = await response.json();
      setNotes((current) => current.map((entry) => (entry.id === item.id ? { ...entry, pinned: updated.pinned } : entry)));
      showToast(updated.pinned ? "已置顶" : "已取消置顶");
    }
  };

  const updateTocFromScroll = () => {
    const el = scrollRef.current;
    if (!el || toc.length <= 1) return;
    const max = Math.max(1, el.scrollHeight - el.clientHeight);
    const progress = el.scrollTop / max;
    setActiveToc(Math.min(toc.length - 1, Math.floor(progress * toc.length)));
  };

  const jumpToToc = (index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const max = Math.max(0, el.scrollHeight - el.clientHeight);
    el.scrollTo({ top: max * (index / Math.max(1, toc.length - 1)), behavior: "smooth" });
    setActiveToc(index);
  };

  return (
    <div className={`mewmo-workspace ${listCollapsed ? "mewmo-workspace--list-collapsed" : ""}`}>
      <ListColumn
        title="笔记"
        sortMode={sortMode}
        onSortChange={setSortMode}
        onSearchChange={setQuery}
        action={
          <button type="button" className="mewmo-icon-button mewmo-icon-button--primary" onClick={handleNewNote} aria-label="新建笔记">
            <PrototypeIcon name="pen-new-square" size={17} />
          </button>
        }
      >
        <div className="mewmo-list-stack">
          {visibleNotes.map((item) => {
            const tags = contentTags(item);
            const menuOpen = openMenuId === item.id;
            return (
              <article key={item.id} className={`mewmo-list-card-wrap ${menuOpen ? "mewmo-list-card-wrap--menu-open" : ""}`}>
                <Link
                  href={`/notes/${item.slug}`}
                  className={`mewmo-list-card ${item.slug === note.slug ? "mewmo-list-card--selected" : ""}`}
                >
                  <div className="mewmo-list-card__title">
                    <span>{item.title}</span>
                    {item.pinned && <PinIcon />}
                  </div>
                  {item.summary && <p>{item.summary}</p>}
                  <div className="mewmo-list-card__meta">
                    <span>{new Date(item.updatedAt).toLocaleDateString()}</span>
                    {tags.map((tag) => (
                      <span key={tag} className="mewmo-tag-pill" style={{ "--tc": tagPalette[tag] ?? tagPalette["灵感"] } as CSSProperties}>{tag}</span>
                    ))}
                  </div>
                </Link>
                <div className="mewmo-list-card__action">
                  <button type="button" className="mewmo-row-action-card" onClick={() => setOpenMenuId(menuOpen ? null : item.id)} aria-label="笔记操作">
                    <PrototypeIcon name="more-horizontal" size={16} />
                  </button>
                  {menuOpen && (
                    <div className="mewmo-card-menu">
                      <button type="button" className="mewmo-card-menu__item mewmo-card-menu__item--danger" onClick={() => void deleteNote(item)}><PrototypeIcon name="trash" size={15} /> 删除</button>
                      <button type="button" className="mewmo-card-menu__item" onClick={() => void togglePin(item)}><PrototypeIcon name="pin" size={15} /> {item.pinned ? "取消置顶" : "置顶"}</button>
                      <button type="button" className="mewmo-card-menu__item" onClick={() => showToast("已复制分享链接")}><PrototypeIcon name="share" size={15} /> 分享</button>
                      <button type="button" className="mewmo-card-menu__item" onClick={() => showToast("已导出 Markdown 文件")}><PrototypeIcon name="export" size={15} /> 导出</button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </ListColumn>

      <section className="mewmo-reader-surface">
        <ReaderToolbar title={note.title} onToggleList={() => setListCollapsed((value) => !value)} listCollapsed={listCollapsed} menuKind="notes" />
        <nav className="mewmo-doc-toc" aria-label="笔记目录">
          <div className="mewmo-doc-toc__bars">
            {toc.map((item, index) => (
              <button
                key={`${item.id}-bar`}
                type="button"
                className={`mewmo-doc-toc__bar ${activeToc === index ? "mewmo-doc-toc__bar--active" : ""}`}
                style={{ width: `${item.level === 1 ? 22 : 15}px` }}
                onClick={() => jumpToToc(index)}
                aria-label={item.title}
              />
            ))}
          </div>
          <div className="mewmo-doc-toc__links">
            {toc.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`mewmo-doc-toc__link ${item.level === 2 ? "mewmo-doc-toc__link--nested" : ""} ${activeToc === index ? "mewmo-doc-toc__link--active" : ""}`}
                onClick={() => jumpToToc(index)}
              >
                {item.title}
              </button>
            ))}
          </div>
        </nav>
        <div ref={scrollRef} className="mewmo-reader-scroll mewmo-reader-scroll--editor" onScroll={updateTocFromScroll}>
          <NoteEditor noteId={note.id} initialTitle={note.title} initialContent={note.content} embedded />
        </div>
      </section>
    </div>
  );
}
