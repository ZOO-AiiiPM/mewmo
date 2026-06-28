"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import { TopBar } from "../../../components/shell/TopBar";

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
      .then((r) => r.json())
      .then((data) => {
        setNotes(data);
        setLoading(false);
      });
  }, []);

  const handleNewNote = useCallback(async () => {
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled" }),
    });
    if (res.ok) {
      const note = await res.json();
      router.push(`/notes/${note.slug}`);
    }
  }, [router]);

  return (
    <div className="flex flex-col h-screen">
      <TopBar title="Notes" action={{ label: "+ New Note", onClick: handleNewNote }} />
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading && (
          <div className="text-sm text-muted text-center py-8">Loading...</div>
        )}

        {!loading && notes.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted text-sm mb-4">No notes yet</p>
            <button
              onClick={handleNewNote}
              className="px-4 py-2 rounded-md bg-moss text-white text-sm font-medium hover:bg-moss/90 transition-colors"
            >
              Create your first note
            </button>
          </div>
        )}

        {!loading && notes.length > 0 && (
          <div className="space-y-1">
            {notes.map((note) => (
              <Link
                key={note.id}
                href={`/notes/${note.slug}`}
                className="block px-4 py-3 rounded-md hover:bg-moss-2/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="flex-1 text-sm font-medium text-ink truncate">
                    {note.title}
                  </span>
                  <span className="text-xs text-muted whitespace-nowrap">
                    {new Date(note.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                {note.summary && (
                  <p className="text-xs text-muted mt-1 line-clamp-1">{note.summary}</p>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
