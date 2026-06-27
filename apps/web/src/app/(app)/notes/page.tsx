"use client";

import Link from "next/link";
import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TopBar } from "../../../components/shell/TopBar";
import { generateNotes } from "../../../lib/mock-data";

const notes = generateNotes(1000);

export default function NotesPage() {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: notes.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 76,
    overscan: 10,
  });

  return (
    <div className="flex flex-col h-screen">
      <TopBar title="Notes" action={{ label: "+ New Note" }} />
      <div ref={parentRef} className="flex-1 overflow-y-auto px-6 py-4">
        <div
          className="relative w-full"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const note = notes[virtualRow.index]!;
            return (
              <Link
                key={note.id}
                href={`/notes/${note.slug}`}
                className="absolute left-0 right-0 px-4 py-3 rounded-md hover:bg-moss-2/50 transition-colors block"
                style={{
                  top: `${virtualRow.start}px`,
                  height: `${virtualRow.size}px`,
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="flex-1 text-sm font-medium text-ink truncate">
                    {note.title}
                  </span>
                  <span className="text-xs text-muted whitespace-nowrap">
                    {new Date(note.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-xs text-muted mt-1 line-clamp-1">{note.summary}</p>
                {note.tags.length > 0 && (
                  <div className="flex gap-1.5 mt-1.5">
                    {note.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[11px] px-1.5 py-0.5 rounded-full bg-paper-2 border border-line text-muted"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
