"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Crepe } from "@milkdown/crepe";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import { InsertToolbar } from "./InsertToolbar";
import { highlight } from "./highlight-plugin";

interface NoteEditorProps {
  noteId: string;
  initialTitle: string;
  initialContent: string;
  embedded?: boolean;
}

/**
 * Inner Crepe instance. Created once (deps `[]`) so typing never re-builds the
 * editor — content changes flow out through the listener, not React state, which
 * is why the cursor no longer jumps. `onContentChange` is read through a ref so
 * the one-time listener closure always calls the latest save logic.
 */
function CrepeContent({
  initialContent,
  onContentChange,
}: {
  initialContent: string;
  onContentChange: (md: string) => void;
}) {
  const changeRef = useRef(onContentChange);
  changeRef.current = onContentChange;
  // Crepe emits one markdownUpdated on creation (initial doc normalization).
  // Skip it so merely opening a note doesn't bump updatedAt / reorder the list.
  const readyRef = useRef(false);

  useEditor((root) => {
    const crepe = new Crepe({ root, defaultValue: initialContent });
    crepe.editor.use(highlight);
    crepe.on((listener) => {
      listener.markdownUpdated((_, markdown, prevMarkdown) => {
        if (!readyRef.current) {
          readyRef.current = true;
          return;
        }
        if (markdown !== prevMarkdown) changeRef.current(markdown);
      });
    });
    return crepe;
  }, []);

  return <Milkdown />;
}

export function NoteEditor({ noteId, initialTitle, initialContent, embedded = false }: NoteEditorProps) {
  const router = useRouter();
  const contentSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const savePatch = useCallback(
    async (data: { title?: string; content?: string }) => {
      try {
        setSaveStatus("saving");
        const res = await fetch(`/api/notes/${noteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error("Save failed");

        setSaveStatus("saved");
        if (resetStatusTimer.current) clearTimeout(resetStatusTimer.current);
        resetStatusTimer.current = setTimeout(() => setSaveStatus("idle"), 1500);
      } catch {
        setSaveStatus("error");
      }
    },
    [noteId],
  );

  const queueContentSave = useCallback(
    (content: string) => {
      if (contentSaveTimer.current) clearTimeout(contentSaveTimer.current);
      contentSaveTimer.current = setTimeout(() => {
        void savePatch({ content });
      }, 800);
    },
    [savePatch],
  );

  const queueTitleSave = useCallback(
    (title: string) => {
      if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current);
      titleSaveTimer.current = setTimeout(() => {
        void savePatch({ title });
      }, 300);
    },
    [savePatch],
  );

  useEffect(() => {
    return () => {
      if (contentSaveTimer.current) clearTimeout(contentSaveTimer.current);
      if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current);
      if (resetStatusTimer.current) clearTimeout(resetStatusTimer.current);
    };
  }, []);

  const handleTitleBlur = useCallback(
    (e: React.FocusEvent<HTMLHeadingElement>) => {
      const newTitle = e.currentTarget.textContent?.trim() || "Untitled";
      if (newTitle !== initialTitle) {
        queueTitleSave(newTitle);
      }
    },
    [queueTitleSave, initialTitle],
  );

  const handleDelete = useCallback(async () => {
    if (!confirm("Delete this note?")) return;
    await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
    router.push("/notes");
  }, [noteId, router]);

  const status = (
    <span className={embedded ? "mewmo-note-editor__status" : "text-xs text-muted"}>
      {saveStatus === "saving" && "保存中..."}
      {saveStatus === "saved" && "已保存"}
      {saveStatus === "error" && "保存失败"}
    </span>
  );

  const titleEditor = (
    <h1
      contentEditable
      suppressContentEditableWarning
      onBlur={handleTitleBlur}
      className={embedded ? "mewmo-note-title-editor" : "text-xl font-bold text-ink outline-none flex-1 mr-4"}
    >
      {initialTitle}
    </h1>
  );

  if (embedded) {
    return (
      <div className="mewmo-note-editor">
        <div className="mewmo-note-editor__head">
          {titleEditor}
          {status}
        </div>
        <div className="mewmo-note-editor__body">
          <MilkdownProvider>
            <div className="h-full overflow-auto crepe-editor-wrapper crepe-editor-wrapper--embedded">
              <CrepeContent initialContent={initialContent} onContentChange={queueContentSave} />
            </div>
            <InsertToolbar />
          </MilkdownProvider>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-line">
        {titleEditor}
        <div className="flex items-center gap-3">
          {status}
          <button
            onClick={handleDelete}
            className="text-xs text-muted hover:text-coral transition-colors"
          >
            删除
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative">
        <MilkdownProvider>
          <div className="h-full overflow-auto crepe-editor-wrapper">
            <CrepeContent initialContent={initialContent} onContentChange={queueContentSave} />
          </div>
          <InsertToolbar />
        </MilkdownProvider>
      </div>
    </div>
  );
}
