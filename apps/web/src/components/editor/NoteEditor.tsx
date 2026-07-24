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
import { useToast } from "../ui/ToastProvider";
import { getMewmoBlockEditConfig } from "./block-ui";
import { editorInteractions } from "./editor-interactions";
import { shouldSaveMarkdownUpdate } from "./markdown-save";
import { highlight } from "./highlight-plugin";
import { readNoteDraft, removeLegacyNoteDraft } from "./note-draft-store";
import {
  queueNoteDraftSync,
  retryStoredNoteDraft,
  resolveNoteDraftConflict,
  subscribeNoteDraftSync,
  type NoteSaveSnapshot,
  type NoteSaveStatus,
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
  onSaveSnapshot?: (snapshot: NoteSaveSnapshot) => void;
}

const NOTE_SAVE_MESSAGES = {
  saving: "保存中…",
  saved: "已保存",
  offline: "保存失败",
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
  onSaveSnapshot,
}: NoteEditorProps) {
  const router = useRouter();
  const userId = useWorkspaceAccountId();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;
  const onTitleChangeRef = useRef(onTitleChange);
  onTitleChangeRef.current = onTitleChange;
  const onSaveSnapshotRef = useRef(onSaveSnapshot);
  onSaveSnapshotRef.current = onSaveSnapshot;
  const initialDraft = readNoteDraft(userId, noteId);
  const latestTitleRef = useRef(initialDraft?.title ?? initialTitle);
  const latestContentRef = useRef(initialDraft?.content ?? initialContent);
  const serverVersionRef = useRef(initialDraft?.serverVersion ?? serverVersion);
  const baseTitleRef = useRef(initialDraft?.baseTitle ?? initialTitle);
  const baseContentRef = useRef(initialDraft?.baseContent ?? initialContent);
  const draftRevisionRef = useRef(initialDraft?.updatedAt ?? 0);
  const [editorRevision, setEditorRevision] = useState(0);
  const [editorInitialContent] = useState(() =>
    normalizeNoteMarkdownBreaks(latestContentRef.current),
  );
  const [saveState, setSaveState] = useState<NoteSaveSnapshot>({ status: "saved", message: NOTE_SAVE_MESSAGES.saved });
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const { showToast } = useToast();
  const prevSaveStatusRef = useRef<NoteSaveStatus>("saved");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const metadata = useMemo(
    () =>
      (updatedAt || lastSavedAt)
        ? buildNoteMetadataItems({
            title: initialTitle,
            summary: initialSummary,
            content: editorInitialContent,
            updatedAt: lastSavedAt ? new Date(lastSavedAt).toISOString() : updatedAt!,
          })
        : null,
    [editorInitialContent, initialSummary, initialTitle, lastSavedAt, updatedAt],
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
      baseTitle: baseTitleRef.current,
      baseContent: baseContentRef.current,
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

  useEffect(() => {
    if (readNoteDraft(userId, noteId)) return;
    serverVersionRef.current = serverVersion;
    baseTitleRef.current = initialTitle;
    baseContentRef.current = initialContent;
  }, [initialContent, initialTitle, noteId, serverVersion, userId]);

  useEffect(() => subscribeNoteDraftSync(userId, noteId, (snapshot) => {
    if (snapshot.status === "saved") {
      if (snapshot.serverVersion !== undefined) serverVersionRef.current = snapshot.serverVersion;
      if (snapshot.title !== undefined) {
        latestTitleRef.current = snapshot.title;
        baseTitleRef.current = snapshot.title;
        if (snapshot.resolvedWithRemote && titleRef.current) {
          titleRef.current.textContent = snapshot.title;
        }
        onTitleChangeRef.current?.(snapshot.title, snapshot.slug);
      }
      if (snapshot.content !== undefined) {
        latestContentRef.current = snapshot.content;
        baseContentRef.current = snapshot.content;
        onContentChangeRef.current?.(snapshot.content);
        if (snapshot.resolvedWithRemote) setEditorRevision((revision) => revision + 1);
      }
      if (snapshot.savedAt !== undefined) setLastSavedAt(snapshot.savedAt);
    }
    if (snapshot.status === "error" && prevSaveStatusRef.current !== "error") {
      showToast(snapshot.message || NOTE_SAVE_MESSAGES.error, "error");
    }
    prevSaveStatusRef.current = snapshot.status;
    setSaveState(snapshot);
    onSaveSnapshotRef.current?.(snapshot);
  }), [noteId, userId, showToast]);

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
  const saveStatus =
    saveState.status === "saved" || saveState.status === "saving" || saveState.status === "error"
      ? null
      : (
    <span
      className={`mewmo-note-save-status mewmo-note-save-status--${saveState.status}`}
      aria-live="polite"
    >
      {saveState.message}
    </span>
  );
  const conflictActions = saveState.conflict ? (
    <span className="mewmo-note-save-conflict-actions">
      <button
        type="button"
        onClick={() => resolveNoteDraftConflict(userId, noteId, "local")}
      >
        保留本地版本
      </button>
      <button
        type="button"
        onClick={() => resolveNoteDraftConflict(userId, noteId, "remote")}
      >
        使用云端版本
      </button>
    </span>
  ) : null;

  if (embedded) {
    return (
      <div className="mewmo-note-editor">
        <div className="mewmo-note-editor__head">
          {titleEditor}
          {metadata && (
            <div className="mewmo-note-editor__meta">
              {metadata.details.map((item, index) => (
                <span key={item}>
                  {index > 0 && <b aria-hidden="true" />}
                  {item}
                </span>
              ))}
              {saveStatus}
              {conflictActions}
            </div>
          )}
        </div>
        <div className="mewmo-note-editor__body" ref={bodyRef}>
          <MilkdownProvider>
            <div className="crepe-editor-wrapper crepe-editor-wrapper--embedded">
              <CrepeContent
                key={editorRevision}
                initialContent={editorRevision
                  ? normalizeNoteMarkdownBreaks(latestContentRef.current)
                  : editorInitialContent}
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
              key={editorRevision}
              initialContent={editorRevision
                ? normalizeNoteMarkdownBreaks(latestContentRef.current)
                : editorInitialContent}
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
