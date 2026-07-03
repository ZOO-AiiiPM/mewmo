"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useEffect, type CSSProperties } from "react";
import { ListColumn, type ListSortMode } from "../../../components/shell/ListColumn";
import { PinIcon, PrototypeIcon } from "../../../components/shell/PrototypeIcon";
import { ReaderToolbar } from "../../../components/shell/ReaderToolbar";
import { useToast } from "../../../components/ui/ToastProvider";

interface NoteItem {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  pinned: boolean;
  updatedAt: string;
  createdAt?: string;
}

const tagPalette: Record<string, string> = {
  产品: "#4caf72",
  数据层: "#a874e0",
  读书: "#4f93e8",
  AI: "#e0a93a",
  灵感: "#5ba3d9",
};

function contentTags(note: NoteItem) {
  const text = `${note.title} ${note.summary ?? ""}`.toLowerCase();
  const tags = [];
  if (text.includes("产品") || text.includes("定位")) tags.push("产品");
  if (text.includes("数据") || text.includes("db") || text.includes("api")) tags.push("数据层");
  if (text.includes("ai")) tags.push("AI");
  if (text.includes("读") || text.includes("book")) tags.push("读书");
  return tags.length ? tags.slice(0, 2) : ["灵感"];
}

export default function NotesPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState<ListSortMode>("updated");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [listCollapsed, setListCollapsed] = useState(false);

  useEffect(() => {
    fetch("/api/notes")
      .then((response) => response.json())
      .then((data) => {
        setNotes(data);
        setLoading(false);
      });
  }, []);

  const handleNewNote = useCallback(async () => {
    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled" }),
    });
    if (response.ok) {
      const note = await response.json();
      router.push(`/notes/${note.slug}`);
    }
  }, [router]);

  const visibleNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...notes]
      .filter((note) => {
        if (!normalizedQuery) return true;
        return `${note.title} ${note.summary ?? ""}`.toLowerCase().includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        const aDate = sortMode === "created" ? a.createdAt ?? a.updatedAt : a.updatedAt;
        const bDate = sortMode === "created" ? b.createdAt ?? b.updatedAt : b.updatedAt;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      });
  }, [notes, query, sortMode]);

  const selected = visibleNotes[0];

  const deleteNote = async (note: NoteItem) => {
    const response = await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
    if (response.ok) {
      setNotes((current) => current.filter((item) => item.id !== note.id));
      showToast("已删除笔记");
    }
  };

  const togglePin = async (note: NoteItem) => {
    const response = await fetch(`/api/notes/${note.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !note.pinned }),
    });
    if (response.ok) {
      const updated = await response.json();
      setNotes((current) => current.map((item) => (item.id === note.id ? { ...item, pinned: updated.pinned } : item)));
      showToast(updated.pinned ? "已置顶" : "已取消置顶");
    }
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
        {loading && (
          <div className="mewmo-empty-state">
            <span className="mewmo-spinner" aria-hidden="true" />
            <p>正在加载笔记...</p>
          </div>
        )}

        {!loading && notes.length === 0 && (
          <div className="mewmo-empty-state">
            <PrototypeIcon name="empty" size={38} />
            <p>还没有笔记</p>
            <button type="button" className="mewmo-button" onClick={handleNewNote}>新建笔记</button>
          </div>
        )}

        {!loading && notes.length > 0 && visibleNotes.length === 0 && (
          <div className="mewmo-empty-state">
            <PrototypeIcon name="search" size={34} />
            <p>没有找到匹配的笔记</p>
          </div>
        )}

        {!loading && visibleNotes.length > 0 && (
          <div className="mewmo-list-stack">
            {visibleNotes.map((note, index) => {
              const tags = contentTags(note);
              const menuOpen = openMenuId === note.id;
              return (
                <article key={note.id} className={`mewmo-list-card-wrap ${menuOpen ? "mewmo-list-card-wrap--menu-open" : ""}`}>
                  <Link href={`/notes/${note.slug}`} className={`mewmo-list-card ${index === 0 ? "mewmo-list-card--selected" : ""}`}>
                    <div className="mewmo-list-card__title">
                      <span>{note.title}</span>
                      {note.pinned && <PinIcon />}
                    </div>
                    {note.summary && <p>{note.summary}</p>}
                    <div className="mewmo-list-card__meta">
                      <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
                      {tags.map((tag) => (
                        <span key={tag} className="mewmo-tag-pill" style={{ "--tc": tagPalette[tag] ?? tagPalette["灵感"] } as CSSProperties}>{tag}</span>
                      ))}
                    </div>
                  </Link>
                  <div className="mewmo-list-card__action">
                    <button type="button" className="mewmo-row-action-card" onClick={() => setOpenMenuId(menuOpen ? null : note.id)} aria-label="笔记操作">
                      <PrototypeIcon name="more-horizontal" size={16} />
                    </button>
                    {menuOpen && (
                      <div className="mewmo-card-menu">
                        <button type="button" className="mewmo-card-menu__item mewmo-card-menu__item--danger" onClick={() => void deleteNote(note)}><PrototypeIcon name="trash" size={15} /> 删除</button>
                        <button type="button" className="mewmo-card-menu__item" onClick={() => void togglePin(note)}><PrototypeIcon name="pin" size={15} /> {note.pinned ? "取消置顶" : "置顶"}</button>
                        <button type="button" className="mewmo-card-menu__item" onClick={() => showToast("已复制分享链接")}><PrototypeIcon name="share" size={15} /> 分享</button>
                        <button type="button" className="mewmo-card-menu__item" onClick={() => showToast("已导出 Markdown 文件")}><PrototypeIcon name="export" size={15} /> 导出</button>
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
        <ReaderToolbar title={selected?.title ?? "笔记"} onToggleList={() => setListCollapsed((value) => !value)} listCollapsed={listCollapsed} menuKind="notes" />
        <div className="mewmo-reader-scroll">
          <article className="mewmo-document mewmo-document--empty">
            <h1>{selected?.title ?? "选择一条笔记"}</h1>
            <p>{selected?.summary ?? "从左侧列表选择，或新建一条笔记。"}</p>
          </article>
        </div>
      </section>
    </div>
  );
}
