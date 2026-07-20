"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { CardActionMenu } from "../../../../components/shell/CardActionMenu";
import { useAISidebarContext } from "../../../../components/shell/AISidebar";
import { ListColumn } from "../../../../components/shell/ListColumn";
import {
  PinIcon,
  PrototypeIcon,
} from "../../../../components/shell/PrototypeIcon";
import { ReaderBackToTopButton } from "../../../../components/shell/ReaderBackToTopButton";
import { ReaderToolbar } from "../../../../components/shell/ReaderToolbar";
import { ReaderToc } from "../../../../components/shell/ReaderToc";
import {
  useReaderToolbarTitleVisibility,
} from "../../../../components/shell/useReaderToolbarTitleVisibility";
import { useToast } from "../../../../components/ui/ToastProvider";
import {
  buildNoteCardTitle,
  contentTags,
  extractNoteImages,
  formatNoteListTime,
  notePreviewText,
  noteTagPalette,
} from "../../../../lib/note-list-preview";
import {
  buildNoteCopyMarkdown,
  copyNoteMarkdownToClipboard,
} from "../../../../lib/note-copy";
import {
  buildNoteToc,
} from "../../../../lib/note-toc";
import {
  currentStableSelectionPath,
  pushStableSelectionUrl,
} from "../../../../lib/stable-selection-url";
import { useWorkspaceMemory } from "../../../../lib/workspace-memory";
import {
  getCachedWorkspaceDetail,
  getCachedWorkspaceList,
  getCachedWorkspaceSelection,
  isWorkspaceDetailFresh,
  loadWorkspaceResource,
  removeCachedWorkspaceItem,
  setCachedWorkspaceDetail,
  setCachedWorkspaceList,
  setCachedWorkspaceSelection,
  updateCachedWorkspaceItem,
} from "../../../../lib/workspace-data-cache";
import { useWorkspaceAccountId } from "../../../../lib/workspace-account";
import { workspaceResourceKeys } from "../../../../lib/workspace-resource-keys";
import {
  queueNoteDraftSync,
  subscribeNoteDraftSync,
} from "../../../../components/editor/note-draft-sync";
import "../../../../components/editor/editor-theme.css";

const NoteEditor = dynamic(
  () =>
    import("../../../../components/editor/NoteEditor").then((m) => ({
      default: m.NoteEditor,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="mewmo-empty-state">
        <span className="mewmo-spinner" aria-hidden="true" />
        <p>正在加载编辑器...</p>
      </div>
    ),
  },
);

interface NoteListItem {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  preview?: string;
  content?: string;
  pinned: boolean;
  version?: number;
  updatedAt: string;
  createdAt?: string;
}

interface CurrentNote {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  content: string;
  version: number;
  updatedAt: string;
}

interface NoteEditorPageProps {
  note?: CurrentNote | null;
  notes: NoteListItem[];
}

export function NoteEditorPage({
  note,
  notes: initialNotes,
}: NoteEditorPageProps) {
  const { showToast } = useToast();
  const { setContentContext } = useAISidebarContext();
  const userId = useWorkspaceAccountId();
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousSelectedNoteRef = useRef<{ id: string; slug: string } | null>(null);
  const cachedNotes = getCachedWorkspaceList<NoteListItem>("notes");
  const mergeCachedDetail = (item: NoteListItem) => {
    const cachedDetail = getCachedWorkspaceDetail<NoteListItem>("notes", item.id);
    return cachedDetail
      ? { ...item, ...cachedDetail, updatedAt: item.updatedAt }
      : item;
  };
  const seededNotes = initialNotes.map(mergeCachedDetail);
  const initialCachedNotes = (cachedNotes ?? seededNotes).map(mergeCachedDetail);
  const cachedSelectedId = getCachedWorkspaceSelection("notes");
  const cachedSelectedSlug = initialCachedNotes.find(
    (item) => item.id === cachedSelectedId,
  )?.slug;
  const [notes, setNotes] = useState(initialCachedNotes);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(
    note?.slug ?? cachedSelectedSlug ?? seededNotes[0]?.slug ?? null,
  );
  const [query, setQuery] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [isLoading, setIsLoading] = useState(!cachedNotes && initialNotes.length === 0);
  const [loadError, setLoadError] = useState("");
  const [agentEditorRevision, setAgentEditorRevision] = useState(0);
  const selectedNote = useMemo(() => {
    if (selectedSlug) {
      const selected = notes.find((item) => item.slug === selectedSlug);
      if (selected) return selected;
    }
    return notes[0] ?? null;
  }, [notes, selectedSlug]);

  const loadNoteDetail = useCallback((item: NoteListItem) => {
    const cachedDetail = getCachedWorkspaceDetail<NoteListItem>("notes", item.id);
    if (cachedDetail && isWorkspaceDetailFresh("notes", item)) {
      if (item.content === undefined) {
        setNotes((current) =>
          current.map((entry) =>
            entry.id === item.id
              ? { ...entry, ...cachedDetail, updatedAt: entry.updatedAt }
              : entry,
          ),
        );
      }
      return;
    }
    if (cachedDetail && item.content === undefined) {
      setNotes((current) =>
        current.map((entry) =>
          entry.id === item.id
            ? { ...entry, ...cachedDetail, updatedAt: entry.updatedAt }
            : entry,
        ),
      );
    }

    void loadWorkspaceResource(workspaceResourceKeys.noteDetail(item.id), () =>
      fetch(`/api/notes/${item.id}`).then((response) =>
        response.ok ? response.json() : null,
      ),
    )
      .then((data: NoteListItem | null) => {
        if (!data?.id || typeof data.content !== "string") return;
        const content = data.content;
        setCachedWorkspaceDetail("notes", data);
        setNotes((current) =>
          current.map((entry) =>
            entry.id === data.id
              ? {
                  ...entry,
                  content,
                  summary: data.summary,
                  title: data.title,
                  updatedAt: data.updatedAt,
                }
              : entry,
          ),
        );
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (initialNotes.length > 0) return;
    let cancelled = false;

    void loadWorkspaceResource(workspaceResourceKeys.notesList(), async () => {
      const response = await fetch("/api/notes");
      if (!response.ok) throw new Error("Failed to load notes");
      return (await response.json()) as NoteListItem[];
    })
      .then((data) => {
        setCachedWorkspaceList("notes", data);
        if (cancelled) return;
        setNotes(
          data.map((item) => {
            const detail = getCachedWorkspaceDetail<NoteListItem>("notes", item.id);
            return detail ? { ...item, ...detail, updatedAt: item.updatedAt } : item;
          }),
        );
        setSelectedSlug((current) => {
          if (current && data.some((item) => item.slug === current)) return current;
          const selectedId = getCachedWorkspaceSelection("notes");
          const next = data.find((item) => item.id === selectedId) ?? data[0] ?? null;
          setCachedWorkspaceSelection("notes", next?.id ?? null);
          return next?.slug ?? null;
        });
        setLoadError("");
      })
      .catch(() => {
        if (!cancelled && !cachedNotes) setLoadError("Could not load notes.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [initialNotes.length]);

  useEffect(() => {
    if (initialNotes.length === 0 && !note) return;
    setCachedWorkspaceList("notes", seededNotes);
    if (note) {
      const pinned = initialNotes.find((item) => item.id === note.id)?.pinned ?? false;
      setCachedWorkspaceDetail("notes", { ...note, pinned });
    }

    setNotes((current) =>
      seededNotes.map((item) => {
        const local = current.find((entry) => entry.id === item.id);
        return local?.content !== undefined
          ? { ...item, ...local }
          : mergeCachedDetail(item);
      }),
    );
  }, [initialNotes, note?.id, note?.updatedAt]);

  const selectNote = useCallback(
    (item: NoteListItem | null, mode: "push" | "replace" = "push") => {
      setSelectedSlug(item?.slug ?? null);
      setCachedWorkspaceSelection("notes", item?.id ?? null);
      pushStableSelectionUrl(item ? `/notes/${item.slug}` : "/notes", mode);
      if (!item) return;
      loadNoteDetail(item);
    },
    [loadNoteDetail],
  );

  const handleNewNote = useCallback(async () => {
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled" }),
      });
      if (!response.ok) throw new Error("create note failed");

      const created = (await response.json()) as NoteListItem;
      setCachedWorkspaceDetail("notes", created);
      setNotes((current) => {
        const next = [created, ...current.filter((item) => item.id !== created.id)];
        setCachedWorkspaceList("notes", next);
        return next;
      });
      selectNote(created);
    } catch {
      showToast("新建笔记失败", "error");
    }
  }, [selectNote, showToast]);

  const visibleNotes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...notes]
      .filter((item) => {
        if (!normalizedQuery) return true;
        return `${item.title} ${item.summary ?? ""} ${item.content ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [notes, query]);

  const toc = useMemo(
    () => buildNoteToc(selectedNote?.content ?? ""),
    [selectedNote?.content],
  );
  const currentToolbarNote = useMemo<NoteListItem>(
    () =>
      selectedNote ?? {
        id: "",
        slug: "",
        title: "笔记",
        summary: null,
        content: "",
        updatedAt: "",
        pinned: false,
      },
    [selectedNote],
  );
  const { toolbarTitleVisible } = useReaderToolbarTitleVisibility({
    scrollRef,
  });
  useWorkspaceMemory({
    section: "notes",
    href: selectedNote ? `/notes/${selectedNote.slug}` : "/notes",
    listRef,
    readerRef: scrollRef,
    restoreKey: selectedNote?.id ?? "empty",
  });

  useEffect(() => {
    const previous = previousSelectedNoteRef.current;
    if (
      previous &&
      selectedNote &&
      previous.id === selectedNote.id &&
      previous.slug !== selectedNote.slug
    ) {
      pushStableSelectionUrl(`/notes/${selectedNote.slug}`, "replace");
    }
    previousSelectedNoteRef.current = selectedNote
      ? { id: selectedNote.id, slug: selectedNote.slug }
      : null;
  }, [selectedNote?.id, selectedNote?.slug]);

  useEffect(() => {
    if (selectedNote) loadNoteDetail(selectedNote);
  }, [loadNoteDetail, selectedNote]);

  useEffect(() => {
    if (!selectedNote) {
      setContentContext(null);
      return;
    }

    const currentNote = selectedNote;
    setContentContext({
      kind: "note",
      id: currentNote.id,
      title: currentNote.title,
      sourceLabel: "笔记",
      summary: currentNote.summary,
      draft: {
        baseVersion: currentNote.version ?? 0,
        title: currentNote.title,
        content: currentNote.content ?? "",
      },
      applyDraftPatch: async (patch) => {
        if (patch.noteId !== currentNote.id) throw new Error("当前打开的笔记已经变化");
        if ((currentNote.version ?? 0) !== patch.baseVersion) throw new Error("笔记版本已变化，请重新生成操作预览");

        const nextTitle = patch.title ?? currentNote.title;
        const nextContent = patch.content ?? currentNote.content ?? "";
        const updatedAt = Date.now();

        setNotes((items) => items.map((item) => item.id === currentNote.id
          ? { ...item, title: nextTitle, content: nextContent }
          : item));
        updateCachedWorkspaceItem<NoteListItem>("notes", currentNote.id, (item) => ({
          ...item,
          title: nextTitle,
          content: nextContent,
        }));
        setAgentEditorRevision((revision) => revision + 1);
        queueNoteDraftSync({
          userId,
          noteId: currentNote.id,
          title: nextTitle,
          content: nextContent,
          serverVersion: patch.baseVersion,
          updatedAt,
        });
        const savePromise = new Promise<{ version?: number }>((resolve, reject) => {
          let unsubscribe = () => {};
          const timeout = window.setTimeout(() => {
            unsubscribe();
            reject(new Error("笔记保存超时，本地草稿仍已保留"));
          }, 20_000);
          unsubscribe = subscribeNoteDraftSync(userId, currentNote.id, (snapshot) => {
            if (snapshot.status === "saved") {
              window.clearTimeout(timeout);
              unsubscribe();
              resolve(snapshot.serverVersion === undefined ? {} : { version: snapshot.serverVersion });
            } else if (snapshot.status === "error") {
              window.clearTimeout(timeout);
              unsubscribe();
              reject(new Error(snapshot.message));
            }
          });
        });
        const result = await savePromise;
        const savedVersion = result.version;
        if (savedVersion !== undefined) {
          setNotes((items) => items.map((item) => item.id === currentNote.id
            ? { ...item, version: savedVersion }
            : item));
        }
        return result;
      },
    });

    return () => setContentContext(null);
  }, [selectedNote, setContentContext, userId]);

  useEffect(() => {
    const handlePopState = () => {
      const match = currentStableSelectionPath().match(/^\/notes\/([^/?#]+)/);
      setSelectedSlug(match?.[1] ? decodeURIComponent(match[1]) : (notes[0]?.slug ?? null));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [notes]);

  const deleteNote = async (item: NoteListItem) => {
    const response = await fetch(`/api/notes/${item.id}`, { method: "DELETE" });
    if (response.ok) {
      showToast("已删除笔记", "success");
      const remaining = visibleNotes.filter((entry) => entry.id !== item.id);
      const next = remaining[0] ?? null;
      setNotes((current) => current.filter((entry) => entry.id !== item.id));
      removeCachedWorkspaceItem("notes", item.id);
      if (item.slug === selectedNote?.slug) selectNote(next, "replace");
    }
  };

  const togglePin = async (item: NoteListItem) => {
    const response = await fetch(`/api/notes/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !item.pinned }),
    });
    if (response.ok) {
      const updated = await response.json();
      updateCachedWorkspaceItem<NoteListItem>("notes", item.id, (entry) => ({
        ...entry,
        pinned: updated.pinned,
      }));
      setNotes((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, pinned: updated.pinned } : entry,
        ),
      );
      showToast(updated.pinned ? "已置顶" : "已取消置顶", "success");
    }
  };

  const shareNote = async (item: NoteListItem) => {
    showToast("正在生成分享链接...", "loading");
    try {
      const response = await fetch(`/api/notes/${item.id}/share`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("share failed");

      const data = (await response.json()) as { url?: string };
      if (!data.url) throw new Error("missing share url");

      const shareUrl = new URL(data.url, window.location.origin).toString();
      await navigator.clipboard?.writeText(shareUrl);
      showToast(`已复制分享链接：${shareUrl}`, "success");
    } catch {
      showToast("分享链接生成失败", "error");
    }
  };

  const copyCurrentNote = async () => {
    if (!selectedNote || selectedNote.content === undefined) return;

    try {
      const markdown = buildNoteCopyMarkdown({
        title: selectedNote.title,
        markdown: selectedNote.content,
      });
      await copyNoteMarkdownToClipboard(markdown, navigator.clipboard);
      showToast("已复制全文", "success");
    } catch {
      showToast("复制全文失败", "error");
    }
  };

  const updateSelectedNoteContent = useCallback(
    (content: string) => {
      if (!selectedNote) return;
      updateCachedWorkspaceItem<NoteListItem>("notes", selectedNote.id, (item) => ({
        ...item,
        content,
      }));
      setNotes((current) =>
        current.map((item) =>
          item.id === selectedNote.id ? { ...item, content } : item,
        ),
      );
    },
    [selectedNote],
  );

  const updateSelectedNoteTitle = useCallback(
    (title: string, slug?: string) => {
      if (!selectedNote) return;
      updateCachedWorkspaceItem<NoteListItem>("notes", selectedNote.id, (item) => ({
        ...item,
        title,
        ...(slug ? { slug } : {}),
      }));
      setNotes((current) =>
        current.map((item) =>
          item.id === selectedNote.id ? { ...item, title, ...(slug ? { slug } : {}) } : item,
        ),
      );
      if (slug && slug !== selectedNote.slug) {
        setSelectedSlug(slug);
        pushStableSelectionUrl(`/notes/${slug}`, "replace");
      }
    },
    [selectedNote],
  );

  const scrollToTop = () => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div
      className={`mewmo-workspace ${listCollapsed ? "mewmo-workspace--list-collapsed" : ""}`}
    >
      <ListColumn
        title="笔记"
        bodyRef={listRef}
        onSearchChange={setQuery}
        action={
          <button
            type="button"
            className="mewmo-icon-button"
            onClick={handleNewNote}
            aria-label="新建笔记"
          >
            <PrototypeIcon name="pen-new-square" size={17} />
          </button>
        }
      >
        {isLoading ? (
          <div className="mewmo-list-empty">
            <span className="mewmo-spinner" aria-hidden="true" />
            <p>正在加载笔记...</p>
          </div>
        ) : loadError && notes.length === 0 ? (
          <div className="mewmo-list-empty">
            <PrototypeIcon name="empty" size={36} />
            <p>{loadError}</p>
          </div>
        ) : (
        <div className="mewmo-list-stack">
          {visibleNotes.map((item) => {
            const content = item.content ?? "";
            const tags = contentTags({ ...item, content });
            const preview = notePreviewText({ ...item, content: item.content });
            const images = extractNoteImages(content);
            const menuOpen = openMenuId === item.id;
            const cardHovered = hoveredCardId === item.id || menuOpen;
            return (
              <article
                key={item.id}
                className={`mewmo-list-card-wrap ${cardHovered ? "mewmo-list-card-wrap--hover" : ""} ${menuOpen ? "mewmo-list-card-wrap--menu-open" : ""}`}
                onMouseEnter={() => setHoveredCardId(item.id)}
                onMouseLeave={() =>
                  setHoveredCardId((current) =>
                    current === item.id ? null : current,
                  )
                }
              >
                <button
                  type="button"
                  className={`mewmo-list-card mewmo-list-card--button ${item.slug === selectedNote?.slug ? "mewmo-list-card--selected" : ""} ${item.pinned ? "mewmo-list-card--pinned" : ""}`}
                  onClick={() => selectNote(item)}
                  title={buildNoteCardTitle({
                    title: item.title,
                    updatedAt: item.updatedAt,
                    createdAt: item.createdAt,
                    tags,
                    preview,
                  })}
                >
                  <div className="mewmo-list-card__title">
                    <span>{item.title}</span>
                  </div>
                  {preview && <p>{preview}</p>}
                  {images.length > 0 && (
                    <div className="mewmo-list-card__thumbs" aria-hidden="true">
                      {images.map((src) => (
                        <span key={src} className="mewmo-list-card__thumb">
                          <img src={src} alt="" loading="lazy" />
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mewmo-list-card__meta">
                    <span>{formatNoteListTime(item.createdAt ?? item.updatedAt)}</span>
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="mewmo-tag-pill"
                        style={
                          {
                            "--tc": noteTagPalette[tag],
                          } as CSSProperties
                        }
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </button>
                {item.pinned && (
                  <span className="mewmo-list-card__pin" aria-hidden="true">
                    <PinIcon />
                  </span>
                )}
                <CardActionMenu
                  kind="notes"
                  open={menuOpen}
                  ariaLabel="笔记操作"
                  pinned={item.pinned}
                  onOpenChange={(open) => setOpenMenuId(open ? item.id : null)}
                  onDelete={() => void deleteNote(item)}
                  onTogglePin={() => void togglePin(item)}
                  onShare={() => void shareNote(item)}
                  onExport={() => showToast("已导出 Markdown 文件", "success")}
                />
              </article>
            );
          })}
        </div>
        )}
      </ListColumn>

      <section className="mewmo-reader-surface">
        <ReaderToolbar
          title={selectedNote?.title ?? "笔记"}
          titleVisible={toolbarTitleVisible}
          onTitleClick={scrollToTop}
          onToggleList={() => setListCollapsed((value) => !value)}
          listCollapsed={listCollapsed}
          menuKind="notes"
          pinned={currentToolbarNote.pinned}
          onDelete={selectedNote ? () => void deleteNote(currentToolbarNote) : undefined}
          onTogglePin={selectedNote ? () => void togglePin(currentToolbarNote) : undefined}
          onShare={selectedNote ? () => void shareNote(currentToolbarNote) : undefined}
          onCopyContent={
            selectedNote?.content !== undefined
              ? () => void copyCurrentNote()
              : undefined
          }
          onExport={selectedNote ? () => showToast("已导出 Markdown 文件", "success") : undefined}
        />
        <ReaderToc
          items={toc}
          scrollRef={scrollRef}
          headingSelector=".crepe-editor-wrapper .ProseMirror h1, .crepe-editor-wrapper .ProseMirror h2, .crepe-editor-wrapper .ProseMirror h3"
          ariaLabel="笔记目录"
        />
        <div
          ref={scrollRef}
          className="mewmo-reader-scroll mewmo-reader-scroll--editor"
        >
          {selectedNote ? (
            selectedNote.content === undefined ? (
              <div className="mewmo-empty-state">
                <span className="mewmo-spinner" aria-hidden="true" />
                <p>正在加载笔记...</p>
              </div>
            ) : (
              <NoteEditor
                key={`${selectedNote.id}:${agentEditorRevision}`}
                noteId={selectedNote.id}
                initialTitle={selectedNote.title}
                initialSummary={selectedNote.summary}
                initialContent={selectedNote.content}
                    updatedAt={selectedNote.updatedAt}
                    serverVersion={selectedNote.version}
                autoFocusTitle={selectedNote.title === "Untitled" && !selectedNote.content.trim()}
                onContentChange={updateSelectedNoteContent}
                onTitleChange={updateSelectedNoteTitle}
                embedded
              />
            )
          ) : (
            <article className="mewmo-document mewmo-document--empty">
              <h1>选择一条笔记</h1>
              <p>从左侧列表选择，或新建一条笔记。</p>
            </article>
          )}
        </div>
        <ReaderBackToTopButton scrollRef={scrollRef} visible={toolbarTitleVisible} />
      </section>
    </div>
  );
}
