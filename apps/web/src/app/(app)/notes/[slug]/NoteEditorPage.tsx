"use client";

import dynamic from "next/dynamic";
import "../../../../components/editor/editor-theme.css";

const NoteEditor = dynamic(
  () => import("../../../../components/editor/NoteEditor").then((m) => ({ default: m.NoteEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full flex items-center justify-center text-muted text-sm">
        Loading editor...
      </div>
    ),
  },
);

interface NoteEditorPageProps {
  noteId: string;
  title: string;
  content: string;
}

export function NoteEditorPage({ noteId, title, content }: NoteEditorPageProps) {
  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 min-h-0">
        <NoteEditor noteId={noteId} initialTitle={title} initialContent={content} />
      </div>
    </div>
  );
}
