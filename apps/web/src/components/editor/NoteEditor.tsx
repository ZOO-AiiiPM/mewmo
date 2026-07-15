"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { Crepe } from "@milkdown/crepe";
import { editorViewOptionsCtx } from "@milkdown/kit/core";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { $prose } from "@milkdown/kit/utils";
import { Plugin } from "@milkdown/kit/prose/state";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import { normalizeNoteMarkdownBreaks } from "../../lib/note-markdown-breaks";
import { buildNoteMetadataItems, noteTagPalette } from "../../lib/note-list-preview";
import { PrototypeIcon } from "../shell/PrototypeIcon";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { PopoverMenu } from "../ui/FloatingMenu";
import { getMewmoBlockEditConfig } from "./block-ui";
import { editorInteractions } from "./editor-interactions";
import { shouldSaveMarkdownUpdate } from "./markdown-save";
import { highlight } from "./highlight-plugin";
import {
  readNoteContentDraft,
  resolveInitialNoteContent,
} from "./note-draft-store";
import {
  queueNoteContentSync,
  retryStoredNoteContent,
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
  embedded?: boolean;
  autoFocusTitle?: boolean;
  onContentChange?: (content: string) => void;
  onTitleChange?: (title: string, slug?: string) => void;
}

const TAG_PICKER_OPTIONS = ["产品", "AI", "读书", "设计", "数据层"];
const TAG_PICKER_COLORS = [
  "#4caf72",
  "#4f93e8",
  "#e0a93a",
  "#a874e0",
  "#e88478",
  "#5ba3d9",
  "#b07cd8",
  "#62b87e",
];
const TAG_PICKER_SUGGESTIONS = ["关联到当前主题", "让 AI 归类"];

function tagColor(tag: string) {
  return noteTagPalette[tag] ?? "#e88478";
}

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
  embedded = false,
  autoFocusTitle = false,
  onContentChange,
  onTitleChange,
}: NoteEditorProps) {
  const router = useRouter();
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const tagPickerAnchorRef = useRef<HTMLSpanElement>(null);
  const titleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onContentChangeRef = useRef(onContentChange);
  onContentChangeRef.current = onContentChange;
  const [editorInitialContent] = useState(() =>
    normalizeNoteMarkdownBreaks(
      resolveInitialNoteContent(initialContent, readNoteContentDraft(noteId)),
    ),
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
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

  const savePatch = useCallback(
    async (data: { title?: string; content?: string }) => {
      try {
        const res = await fetch(`/api/notes/${noteId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error("Save failed");
        return (await res.json()) as { title: string; slug: string };
      } catch {
        // Save errors stay silent in the editor chrome.
        return null;
      }
    },
    [noteId],
  );

  const handleContentChange = useCallback(
    (content: string) => {
      onContentChange?.(content);
      queueNoteContentSync(noteId, content);
    },
    [noteId, onContentChange],
  );

  const queueTitleSave = useCallback(
    (title: string) => {
      if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current);
      titleSaveTimer.current = setTimeout(() => {
        void savePatch({ title }).then((updated) => {
          if (updated) onTitleChange?.(updated.title, updated.slug);
        });
      }, 300);
    },
    [onTitleChange, savePatch],
  );

  useEffect(() => {
    return () => {
      if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current);
    };
  }, []);

  useEffect(() => {
    const draft = readNoteContentDraft(noteId);
    if (!draft) return;

    onContentChangeRef.current?.(draft.content);
    retryStoredNoteContent(noteId, draft.content);
  }, [noteId]);

  useEffect(() => {
    const title = titleRef.current;
    if (!title) return;

    title.textContent = initialTitle;
    if (!autoFocusTitle || editorInitialContent.trim()) return;

    window.requestAnimationFrame(() => {
      title.focus();
      if (getInitialTitleSelectionMode(initialTitle) !== "select-all") return;

      const range = document.createRange();
      range.selectNodeContents(title);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  }, [autoFocusTitle, editorInitialContent, initialTitle, noteId]);

  const focusBodyEditor = useCallback(() => {
    const editor = bodyRef.current?.querySelector<HTMLElement>(".ProseMirror[contenteditable=\"true\"]");
    editor?.focus();
  }, []);

  const commitTitle = useCallback(
    (target: HTMLHeadingElement) => {
      const newTitle = normalizeTitleText(target.textContent ?? "");
      if (target.textContent !== newTitle) target.textContent = newTitle;
      if (newTitle !== initialTitle) {
        onTitleChange?.(newTitle);
        queueTitleSave(newTitle);
      }
    },
    [queueTitleSave, initialTitle, onTitleChange],
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

  const tagOptions = useMemo(() => {
    const query = tagSearch.trim().toLowerCase();
    if (!query) return TAG_PICKER_OPTIONS;
    return TAG_PICKER_OPTIONS.filter((tag) => tag.toLowerCase().includes(query));
  }, [tagSearch]);

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
              <span className="mewmo-note-editor__tags" ref={tagPickerAnchorRef}>
                {metadata.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="mewmo-note-editor__tag"
                    style={{ "--tc": tagColor(tag) } as CSSProperties}
                    onClick={() => setTagPickerOpen((value) => !value)}
                  >
                    {tag}
                  </button>
                ))}
              </span>
              <PopoverMenu
                open={tagPickerOpen}
                anchorRef={tagPickerAnchorRef}
                onOpenChange={setTagPickerOpen}
                align="start"
                gap={4}
                boundary="main"
                className="mewmo-tag-picker"
              >
                <div className="mewmo-tag-picker__search">
                  <PrototypeIcon name="search" size={14} />
                  <input
                    value={tagSearch}
                    placeholder="搜索或创建标签..."
                    onChange={(event) => setTagSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setTagPickerOpen(false);
                    }}
                  />
                </div>
                <div className="mewmo-tag-picker__list">
                  {tagOptions.map((tag) => {
                    const checked = metadata.tags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={`mewmo-tag-picker__item ${checked ? "mewmo-tag-picker__item--checked" : ""}`}
                        onClick={() => setTagPickerOpen(false)}
                      >
                        <span
                          className="mewmo-tag-picker__dot"
                          style={{ "--tc": tagColor(tag) } as CSSProperties}
                        />
                        <span>{tag}</span>
                        {checked && (
                          <span className="mewmo-tag-picker__check">
                            <PrototypeIcon name="check" size={14} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  className="mewmo-tag-picker__create"
                  onClick={() => setTagPickerOpen(false)}
                >
                  <PrototypeIcon name="plus" size={14} />
                  <span>{tagSearch.trim() ? `新建「${tagSearch.trim()}」` : "新建标签"}</span>
                </button>
                <div className="mewmo-tag-picker__colors">
                  {TAG_PICKER_COLORS.map((color, index) => (
                    <button
                      key={color}
                      type="button"
                      className={`mewmo-tag-picker__color ${index === 0 ? "mewmo-tag-picker__color--selected" : ""}`}
                      style={{ "--tc": color } as CSSProperties}
                      aria-label={`标签颜色 ${index + 1}`}
                    />
                  ))}
                </div>
                <div className="mewmo-tag-picker__ai">
                  <PrototypeIcon name="tag" size={14} />
                  {TAG_PICKER_SUGGESTIONS.map((suggestion) => (
                    <button key={suggestion} type="button">
                      {suggestion}
                    </button>
                  ))}
                </div>
              </PopoverMenu>
              {metadata.tags.length === 0 && (
                <span
                  className="mewmo-note-editor__tag"
                  style={{ "--tc": tagColor("读书") } as CSSProperties}
                >
                  未标签
                </span>
              )}
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
