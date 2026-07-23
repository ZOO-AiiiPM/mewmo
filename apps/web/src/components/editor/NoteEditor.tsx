"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Crepe } from "@milkdown/crepe";
import { editorViewOptionsCtx } from "@milkdown/kit/core";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { $prose } from "@milkdown/kit/utils";
import { Plugin } from "@milkdown/kit/prose/state";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import { normalizeNoteMarkdownBreaks } from "../../lib/note-markdown-breaks";
import { buildNoteMetadataItems } from "../../lib/note-list-preview";
import { useWorkspaceAccountId } from "../../lib/workspace-account";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { getMewmoBlockEditConfig } from "./block-ui";
import { editorInteractions } from "./editor-interactions";
import { shouldSaveMarkdownUpdate } from "./markdown-save";
import { highlight } from "./highlight-plugin";
import { readNoteDraft, removeLegacyNoteDraft } from "./note-draft-store";
import {
  queueNoteDraftSync,
  retryStoredNoteDraft,
  subscribeNoteDraftSync,
  type NoteSaveSnapshot,
} from "./note-draft-sync";
import { uploadNoteImage } from "./note-image-client";
import { normalizePastedImageSlice } from "./note-image-paste";
import { serializeNoteSelectionText } from "./note-selection-copy";
import {
  getInitialTitleSelectionMode,
  normalizeTitleText,
  titleKeyAction,
} from "./title-ui";

interface NoteEditorProps {
  noteId: string;
  initialTitle: string;
  initialSummary?: string | null;
  initialContent: string;
  updatedAt?: string | null;
  serverVersion?: number | undefined;
  embedded?: boolean;
  autoFocusTitle?: boolean;
  onContentChange?: (content: string) => void;
  onTitleChange?: (title: string, slug?: string) => void;
}

const NOTE_SAVE_MESSAGES = {
  saving: "保存中…",
  saved: "已保存",
  offline: "离线，已保存在本机",
  error: "保存失败",
} as const;

/**
 * Inner Crepe instance. Created once (deps `[]`) so typing never re-builds the
 * editor — content changes flow out through the listener, not React state, which
 * is why the cursor no longer jumps. `onContentChange` is read through a ref so
 * the one-time listener closure always calls the latest save logic.
 */
function CrepeContent({
  initialContent,
  noteId,
  onContentChange,
}: {
  initialContent: string;
  noteId: string;
  onContentChange: (md: string) => void;
}) {
  const changeRef = useRef(onContentChange);
  changeRef.current = onContentChange;
  // Crepe emits one markdownUpdated on creation (initial doc normalization).
  // Skip it so merely opening a note doesn't bump updatedAt / reorder the list.
  const readyRef = useRef(false);

  useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: initialContent,
      features: {
        [Crepe.Feature.Placeholder]: false,
        [Crepe.Feature.Toolbar]: false,
      },
      featureConfigs: {
        [Crepe.Feature.BlockEdit]: getMewmoBlockEditConfig(),
        [Crepe.Feature.Cursor]: { virtual: false },
        [Crepe.Feature.ImageBlock]: {
          onUpload: (file: File) => uploadNoteImage(noteId, file),
        },
      },
    });
    crepe.editor.use(highlight);
    crepe.editor.use(editorInteractions);
    crepe.editor.config((ctx) => {
      ctx.update(editorViewOptionsCtx, (options) => ({
        ...options,
        clipboardTextSerializer: serializeNoteSelectionText,
      }));
    });
    crepe.editor.use(
      $prose(
        () =>
          new Plugin({
            props: {
              transformPasted: (slice, view) => normalizePastedImageSlice(slice, view.state.schema),
            },
          }),
      ),
    );
    crepe.on((listener) => {
      listener.markdownUpdated((_, markdown, prevMarkdown) => {
        const wasReady = readyRef.current;
        if (!readyRef.current) {
          readyRef.current = true;
        }
        if (
          shouldSaveMarkdownUpdate({
            ready: wasReady,
            initialContent,
            markdown,
            prevMarkdown,
          })
        ) {
          changeRef.current(markdown);
        }
      });
    });
    return crepe;
  }, []);

  return <Milkdown />;
}

export function NoteEditor({
  noteId,
  initialTitle,
  initialSummary = null,
  initialContent,
  updatedAt = null,
  serverVersion = 0,
  embedded = false,
  autoFocusTitle = false,
  onContentChange,
  onTitleChange,
}: NoteEditorProps) {
  const router = useRouter();
  const userId = useWorkspaceAccountId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;
  const onTitleChangeRef = useRef(onTitleChange);
  onTitleChangeRef.current = onTitleChange;
  const initialDraft = readNoteDraft(userId, noteId);
  const latestTitleRef = useRef(initialDraft?.title ?? initialTitle);
  const latestContentRef = useRef(initialDraft?.content ?? initialContent);
  const serverVersionRef = useRef(initialDraft?.serverVersion ?? serverVersion);
  const draftRevisionRef = useRef(initialDraft?.updatedAt ?? 0);
  const [editorInitialContent] = useState(() =>
    normalizeNoteMarkdownBreaks(latestContentRef.current),
  );
  const [saveState, setSaveState] = useState<NoteSaveSnapshot>({ status: "saved", message: NOTE_SAVE_MESSAGES.saved });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const metadata = useMemo(
    () =>
      updatedAt
        ? buildNoteMetadataItems({
            title: initialTitle,
            summary: initialSummary,
            content: editorInitialContent,
            updatedAt,
          })
        : null,
    [editorInitialContent, initialSummary, initialTitle, updatedAt],
  );

  const queueCurrentDraft = useCallback(() => {
    const updatedAt = Math.max(Date.now(), draftRevisionRef.current + 1);
    draftRevisionRef.current = updatedAt;
    queueNoteDraftSync({
      userId,
      noteId,
      title: latestTitleRef.current,
      content: latestContentRef.current,
      serverVersion: serverVersionRef.current,
      updatedAt,
    });
  }, [noteId, userId]);

  const handleContentChange = useCallback(
    (content: string) => {
      onContentChange?.(content);
      latestContentRef.current = content;
      queueCurrentDraft();
    },
    [onContentChange, queueCurrentDraft],
  );

  useEffect(() => {
    removeLegacyNoteDraft(noteId);
    const draft = readNoteDraft(userId, noteId);
    if (!draft) return;
    onContentChangeRef.current?.(draft.content);
    onTitleChangeRef.current?.(draft.title);
    retryStoredNoteDraft(userId, noteId);
  }, [noteId, userId]);

  useEffect(() => subscribeNoteDraftSync(userId, noteId, (snapshot) => {
    if (snapshot.serverVersion !== undefined) serverVersionRef.current = snapshot.serverVersion;
    if (snapshot.status === "saved" && snapshot.title && snapshot.slug) {
      onTitleChangeRef.current?.(snapshot.title, snapshot.slug);
    }
    setSaveState(snapshot);
  }), [noteId, userId]);

  useEffect(() => {
    const retryLatestDraft = () => retryStoredNoteDraft(userId, noteId);
    window.addEventListener("online", retryLatestDraft);
    return () => window.removeEventListener("online", retryLatestDraft);
  }, [noteId, userId]);

  useEffect(() => {
    const title = titleRef.current;
    if (!title) return;

    title.textContent = latestTitleRef.current;
    if (!autoFocusTitle || editorInitialContent.trim()) return;

    window.requestAnimationFrame(() => {
      title.focus();
      if (getInitialTitleSelectionMode(latestTitleRef.current) !== "select-all") return;

      const range = document.createRange();
      range.selectNodeContents(title);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  }, [autoFocusTitle, editorInitialContent, noteId]);

  const focusBodyEditor = useCallback(() => {
    const editor = bodyRef.current?.querySelector<HTMLElement>(".ProseMirror[contenteditable=\"true\"]");
    editor?.focus();
  }, []);

  const commitTitle = useCallback(
    (target: HTMLHeadingElement) => {
      const newTitle = normalizeTitleText(target.textContent ?? "");
      if (target.textContent !== newTitle) target.textContent = newTitle;
      if (newTitle !== initialTitle) {
        latestTitleRef.current = newTitle;
        onTitleChange?.(newTitle);
        queueCurrentDraft();
      }
    },
    [initialTitle, onTitleChange, queueCurrentDraft],
  );

  const handleTitleBlur = useCallback(
    (e: React.FocusEvent<HTMLHeadingElement>) => {
      commitTitle(e.currentTarget);
    },
    [commitTitle],
  );

  const handleTitleInput = useCallback((e: React.FormEvent<HTMLHeadingElement>) => {
    const target = e.currentTarget;
    const singleLine = target.textContent?.replace(/\s+/g, " ") ?? "";
    if (target.textContent === singleLine) return;

    target.textContent = singleLine;
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, []);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLHeadingElement>) => {
      if (titleKeyAction(e.key) !== "commit-and-focus-body") return;

      e.preventDefault();
      commitTitle(e.currentTarget);
      focusBodyEditor();
    },
    [commitTitle, focusBodyEditor],
  );

  const handleTitlePaste = useCallback((e: React.ClipboardEvent<HTMLHeadingElement>) => {
    e.preventDefault();
    document.execCommand("insertText", false, normalizeTitleText(e.clipboardData.getData("text/plain")));
  }, []);

  const confirmDelete = useCallback(async () => {
    setDeleteOpen(false);
    await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
    router.push("/notes");
  }, [noteId, router]);

  const titleEditor = (
    <h1
      ref={titleRef}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onBlur={handleTitleBlur}
      onInput={handleTitleInput}
      onKeyDown={handleTitleKeyDown}
      onPaste={handleTitlePaste}
      className={embedded ? "mewmo-note-title-editor" : "text-xl font-bold text-ink outline-none flex-1 mr-4"}
    />
  );
  const saveStatus = (
    <span
      className={`mewmo-note-save-status mewmo-note-save-status--${saveState.status}`}
      aria-live="polite"
    >
      {saveState.message}
    </span>
  );

  if (embedded) {
    return (
      <div className="mewmo-note-editor">
        <div className="mewmo-note-editor__head">
          {titleEditor}
          {saveStatus}
          {metadata && (
            <div className="mewmo-note-editor__meta">
              {metadata.details.map((item, index) => (
                <span key={item}>
                  {index > 0 && <b aria-hidden="true" />}
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="mewmo-note-editor__body" ref={bodyRef}>
          <MilkdownProvider>
            <div className="crepe-editor-wrapper crepe-editor-wrapper--embedded">
              <CrepeContent
                initialContent={editorInitialContent}
                noteId={noteId}
                onContentChange={handleContentChange}
              />
            </div>
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
          {saveStatus}
          <button
            onClick={() => setDeleteOpen(true)}
            className="text-xs text-muted hover:text-coral transition-colors"
          >
            删除
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 relative" ref={bodyRef}>
        <MilkdownProvider>
          <div className="h-full crepe-editor-wrapper">
            <CrepeContent
              initialContent={editorInitialContent}
              noteId={noteId}
              onContentChange={handleContentChange}
            />
          </div>
        </MilkdownProvider>
      </div>
      <ConfirmDialog
        open={deleteOpen}
        title={`删除笔记「${initialTitle}」？`}
        description="删除后会从笔记列表移除。"
        confirmLabel="删除"
        cancelLabel="取消"
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}
