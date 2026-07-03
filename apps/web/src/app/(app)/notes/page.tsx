"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ListColumn } from "../../../components/shell/ListColumn";
import { ReaderToolbar } from "../../../components/shell/ReaderToolbar";

interface NoteItem {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  pinned: boolean;
  updatedAt: string;
}

export default function NotesPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);

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

  const selected = notes[0];

  return (
    <div className="mewmo-workspace">
      <ListColumn
        title="笔记"
        action={
          <button type="button" className="mewmo-icon-button mewmo-icon-button--primary" onClick={handleNewNote} aria-label="New note">
            +
          </button>
        }
      >
        {loading && <div className="mewmo-empty-state">正在加载笔记...</div>}

        {!loading && notes.length === 0 && (
          <div className="mewmo-empty-state">
            <p>还没有笔记</p>
            <button type="button" className="mewmo-button" onClick={handleNewNote}>新建笔记</button>
          </div>
        )}

        {!loading && notes.length > 0 && (
          <div className="mewmo-list-stack">
            {notes.map((note, index) => (
              <Link key={note.id} href={`/notes/${note.slug}`} className={`mewmo-list-card ${index === 0 ? "mewmo-list-card--selected" : ""}`}>
                <div className="mewmo-list-card__title">
                  <span>{note.title}</span>
                  {note.pinned && <b aria-label="Pinned">P</b>}
                </div>
                {note.summary && <p>{note.summary}</p>}
                <div className="mewmo-list-card__meta">
                  <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
                  <span className="mewmo-tag-pill">笔记</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </ListColumn>

      <section className="mewmo-reader-surface">
        <ReaderToolbar title={selected?.title ?? "笔记"} />
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
