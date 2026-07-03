"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { ListColumn } from "../../../../components/shell/ListColumn";
import { ReaderToolbar } from "../../../../components/shell/ReaderToolbar";
import "../../../../components/editor/editor-theme.css";

const NoteEditor = dynamic(
  () => import("../../../../components/editor/NoteEditor").then((m) => ({ default: m.NoteEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="mewmo-empty-state">
        正在加载编辑器...
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

export function NoteEditorPage({ note, notes }: NoteEditorPageProps) {
  const router = useRouter();

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

  return (
    <div className="mewmo-workspace">
      <ListColumn
        title="笔记"
        action={
          <button type="button" className="mewmo-icon-button mewmo-icon-button--primary" onClick={handleNewNote} aria-label="新建笔记">
            +
          </button>
        }
      >
        <div className="mewmo-list-stack">
          {notes.map((item) => (
            <Link
              key={item.id}
              href={`/notes/${item.slug}`}
              className={`mewmo-list-card ${item.slug === note.slug ? "mewmo-list-card--selected" : ""}`}
            >
              <div className="mewmo-list-card__title">
                <span>{item.title}</span>
                {item.pinned && <b aria-label="置顶">P</b>}
              </div>
              {item.summary && <p>{item.summary}</p>}
              <div className="mewmo-list-card__meta">
                <span>{new Date(item.updatedAt).toLocaleDateString()}</span>
                <span className="mewmo-tag-pill">笔记</span>
              </div>
            </Link>
          ))}
        </div>
      </ListColumn>

      <section className="mewmo-reader-surface">
        <ReaderToolbar title={note.title} />
        <div className="mewmo-reader-scroll mewmo-reader-scroll--editor">
          <NoteEditor noteId={note.id} initialTitle={note.title} initialContent={note.content} embedded />
        </div>
      </section>
    </div>
  );
}
