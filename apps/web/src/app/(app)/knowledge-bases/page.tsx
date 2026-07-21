"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { KnowledgeImportModal } from "../../../components/knowledge/KnowledgeImportModal";
import { ClipContentRenderer } from "../../../components/clips/ClipContentRenderer";
import { CardActionMenu } from "../../../components/shell/CardActionMenu";
import { ListColumn } from "../../../components/shell/ListColumn";
import {
  PrototypeIcon,
  type PrototypeIconName,
} from "../../../components/shell/PrototypeIcon";
import { ReaderBackToTopButton } from "../../../components/shell/ReaderBackToTopButton";
import { ListContentSkeleton } from "../../../components/shell/ListContentSkeleton";
import { ReaderContentSkeleton } from "../../../components/shell/ReaderContentSkeleton";
import { ReaderToc } from "../../../components/shell/ReaderToc";
import { ReaderToolbar } from "../../../components/shell/ReaderToolbar";
import {
  useReaderToolbarTitleVisibility,
} from "../../../components/shell/useReaderToolbarTitleVisibility";
import { FloatingMenuButton } from "../../../components/ui/FloatingMenu";
import { useToast } from "../../../components/ui/ToastProvider";
import {
  clipPreviewText,
  formatClipListTime,
} from "../../../lib/clip-card";
import {
  buildKnowledgeCardView,
  classifyKnowledgeContentType,
  sortKnowledgeItemsForList,
  type KnowledgeContentType,
  type KnowledgeItemLike,
} from "../../../lib/knowledge-content";
import {
  buildKnowledgeFolderTree,
  type KnowledgeFolderNode,
} from "../../../lib/knowledge-tree";
import {
  extractNoteImages,
  formatNoteListTime,
  notePreviewText,
} from "../../../lib/note-list-preview";
import {
  buildNoteCopyMarkdown,
  copyNoteMarkdownToClipboard,
} from "../../../lib/note-copy";
import * as noteToc from "../../../lib/note-toc";
import { workspaceResourceKeys } from "../../../lib/workspace-resource-keys";
import { useWorkspaceMemory } from "../../../lib/workspace-memory";
import { useWorkspaceResource } from "../../../lib/use-workspace-resource";
import "../../../components/editor/editor-theme.css";

const NoteEditor = dynamic(
  () =>
    import("../../../components/editor/NoteEditor").then((m) => ({
      default: m.NoteEditor,
    })),
  {
    ssr: false,
    loading: () => <ReaderContentSkeleton active label="正在加载编辑器" />,
  },
);

interface KnowledgeBaseRecord {
  id: string;
  title: string;
  icon?: string | null;
  folders?: KnowledgeFolderRow[];
}

interface KnowledgeFolderRow {
  id: string;
  name: string;
  parentId?: string | null;
  depth: number;
  position?: number | null;
}

type KnowledgeItemRecord = KnowledgeItemLike & {
  id: string;
  kind: "note" | "clip" | "feed_entry" | "asset";
  createdAt: string;
  updatedAt: string;
  assetType?: "pdf" | "ebook" | null;
};

type KnowledgeEntityDetail = {
  id: string;
  slug?: string;
  title?: string;
  summary?: string | null;
  content?: string | null;
  updatedAt?: string;
  createdAt?: string;
  version?: number;
};

type LocalKnowledgeAssetType = "pdf" | "ebook";
type LocalKnowledgeImportType = "note" | LocalKnowledgeAssetType;
type KnowledgeFilter = "all" | KnowledgeContentType;

const knowledgeFilters: Array<{
  value: KnowledgeFilter;
  label: string;
  icon: PrototypeIconName;
}> = [
  { value: "all", label: "全部", icon: "library" },
  { value: "note", label: "笔记", icon: "note" },
  { value: "article", label: "文章", icon: "doc" },
  { value: "media", label: "媒体", icon: "media" },
  { value: "video", label: "视频", icon: "video" },
  { value: "podcast", label: "播客", icon: "mic" },
  { value: "pdf", label: "PDF", icon: "pdf" },
  { value: "ebook", label: "电子书", icon: "book" },
];

function knowledgeDetailRequest(item: KnowledgeItemRecord) {
  if (item.kind === "note" && item.note) {
    return {
      key: workspaceResourceKeys.noteDetail(item.note.id),
      url: `/api/notes/${item.note.id}`,
    };
  }
  if (item.kind === "clip" && item.clip) {
    return {
      key: workspaceResourceKeys.clipDetail(item.clip.id),
      url: `/api/clips/${item.clip.id}`,
    };
  }
  if (item.kind === "feed_entry" && item.feedEntry) {
    return {
      key: workspaceResourceKeys.feedEntryDetail(item.feedEntry.id),
      url: `/api/feed-entries/${item.feedEntry.id}`,
    };
  }
  return null;
}

function mergeKnowledgeDetail(
  item: KnowledgeItemRecord,
  detail: KnowledgeEntityDetail | null,
): KnowledgeItemRecord {
  if (!detail) return item;
  if (item.kind === "note" && item.note?.id === detail.id) {
    return { ...item, note: { ...item.note, ...detail } };
  }
  if (item.kind === "clip" && item.clip?.id === detail.id) {
    return { ...item, clip: { ...item.clip, ...detail } };
  }
  if (item.kind === "feed_entry" && item.feedEntry?.id === detail.id) {
    return { ...item, feedEntry: { ...item.feedEntry, ...detail } };
  }
  return item;
}

export default function KnowledgeBasesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const localFileInputRef = useRef<HTMLInputElement>(null);
  const localFolderInputRef = useRef<HTMLInputElement>(null);
  const searchString = searchParams.toString();
  const workspaceHref = searchString ? `${pathname}?${searchString}` : pathname;
  const kbId = searchParams.get("kbId");
  const folderId = searchParams.get("folderId");
  const itemId = searchParams.get("itemId");
  const importOpen = searchParams.get("import") === "1";
  const localImport = searchParams.get("localImport");

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<KnowledgeFilter>("all");
  const [listCollapsed, setListCollapsed] = useState(false);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      const queryString = next.toString();
      router.push(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  const {
    data: knowledgeBases,
    error: knowledgeBasesError,
  } = useWorkspaceResource<KnowledgeBaseRecord[]>({
    key: workspaceResourceKeys.knowledgeBases(),
    initialData: [],
    load: async () => {
      const response = await fetch("/api/knowledge-bases");
      if (!response.ok) throw new Error("knowledge-bases");
      return (await response.json()) as KnowledgeBaseRecord[];
    },
    errorMessage: "知识库加载失败。",
  });

  const treeKey = kbId
    ? workspaceResourceKeys.knowledgeTree(kbId)
    : "knowledge:tree:none";
  const {
    data: currentBase,
    error: currentBaseError,
    refresh: loadCurrentBase,
  } = useWorkspaceResource<KnowledgeBaseRecord | null>({
    key: treeKey,
    initialData: null,
    enabled: Boolean(kbId),
    load: async () => {
      if (!kbId) return null;
      const response = await fetch(`/api/knowledge-bases/${kbId}`);
      if (!response.ok) throw new Error("knowledge-base");
      return (await response.json()) as KnowledgeBaseRecord;
    },
    errorMessage: "知识库目录加载失败。",
  });
  const folderTree = useMemo(
    () => buildKnowledgeFolderTree(currentBase?.folders ?? []),
    [currentBase],
  );

  const contentsKey = kbId && folderId
    ? workspaceResourceKeys.knowledgeContents(kbId, folderId)
    : "knowledge:contents:none";
  const {
    data: items,
    initialLoading: loading,
    error: contentsError,
    refresh: loadContents,
    update: setItems,
  } = useWorkspaceResource<KnowledgeItemRecord[]>({
    key: contentsKey,
    initialData: [],
    enabled: Boolean(kbId && folderId),
    load: async () => {
      if (!kbId || !folderId) return [];
      const params = new URLSearchParams({ folderId });
      const response = await fetch(`/api/knowledge-bases/${kbId}/contents?${params.toString()}`);
      if (!response.ok) throw new Error("knowledge-contents");
      return (await response.json()) as KnowledgeItemRecord[];
    },
    errorMessage: "知识库内容加载失败。",
  });
  const error = knowledgeBasesError || currentBaseError || contentsError;

  useEffect(() => {
    if (!folderId) {
      setItems([]);
    }
  }, [folderId, setItems]);

  useEffect(() => {
    if (!kbId && knowledgeBases[0]) updateParams({ kbId: knowledgeBases[0].id });
  }, [kbId, knowledgeBases, updateParams]);

  const activeFolderName = useMemo(
    () => (folderId ? findFolderName(folderTree, folderId) : null),
    [folderId, folderTree],
  );
  const listTitle = activeFolderName ?? currentBase?.title ?? "知识库";
  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = items
      .filter((item) => {
        if (filter !== "all" && classifyKnowledgeContentType(item) !== filter) return false;
        const card = buildKnowledgeCardView(item);
        if (!normalizedQuery) return true;
        return `${card.title} ${card.summary} ${card.sourceText}`
          .toLowerCase()
          .includes(normalizedQuery);
      });
    return sortKnowledgeItemsForList(filtered);
  }, [filter, items, query]);

  const selectedListItem =
    visibleItems.find((item) => item.id === itemId) ?? visibleItems[0] ?? null;
  const detailRequest = selectedListItem ? knowledgeDetailRequest(selectedListItem) : null;
  const {
    data: selectedDetail,
    initialLoading: selectedDetailLoading,
    error: selectedDetailError,
    update: updateSelectedDetail,
  } = useWorkspaceResource<KnowledgeEntityDetail | null>({
    key: detailRequest?.key ?? "knowledge:detail:none",
    initialData: null,
    enabled: Boolean(detailRequest),
    load: async () => {
      if (!detailRequest) return null;
      const response = await fetch(detailRequest.url);
      if (!response.ok) throw new Error("knowledge-detail");
      return (await response.json()) as KnowledgeEntityDetail;
    },
    errorMessage: "正文加载失败。",
  });
  const selectedItem = selectedListItem
    ? mergeKnowledgeDetail(selectedListItem, selectedDetail)
    : null;
  const selectedCard = selectedItem ? buildKnowledgeCardView(selectedItem) : null;
  const selectedToc = useMemo(() => buildKnowledgeItemToc(selectedItem), [selectedItem]);
  const selectedHeadingSelector =
    selectedItem?.kind === "note"
      ? ".crepe-editor-wrapper .ProseMirror h1, .crepe-editor-wrapper .ProseMirror h2, .crepe-editor-wrapper .ProseMirror h3"
      : ".mewmo-clip-prose h1, .mewmo-clip-prose h2, .mewmo-clip-prose h3";
  const selectedSourceUrl = selectedItem ? knowledgeItemSourceUrl(selectedItem) : null;
  const { toolbarTitleVisible } = useReaderToolbarTitleVisibility({ scrollRef });
  const quickSwitch = (
    <>
      {knowledgeFilters.map((item) => (
        <FloatingMenuButton
          key={item.value}
          icon={item.icon}
          checked={filter === item.value}
          onClick={() => setFilter(item.value)}
        >
          {item.label}
        </FloatingMenuButton>
      ))}
    </>
  );
  useWorkspaceMemory({
    section: "knowledge-bases",
    href: workspaceHref,
    listRef,
    readerRef: scrollRef,
    restoreKey: loading ? "loading" : "ready",
  });

  const closeImportModal = () => updateParams({ import: null });
  const openImportModal = () => {
    if (!folderId) return;
    updateParams({ import: "1" });
  };
  const openLocalFileImport = () => {
    if (!folderId) {
      showToast("请先选择知识库文件夹", "error");
      return;
    }
    localFileInputRef.current?.click();
  };
  const openLocalFolderImport = () => localFolderInputRef.current?.click();
  const scrollToTop = () => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });

  useEffect(() => {
    if (localImport !== "file" && localImport !== "folder") return;
    updateParams({ localImport: null });
    if (localImport === "file") openLocalFileImport();
    if (localImport === "folder") openLocalFolderImport();
  }, [localImport, updateParams]);

  const handleNewNote = useCallback(async () => {
    if (!kbId || !folderId) {
      showToast("请先选择知识库文件夹", "error");
      return;
    }
    const response = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Untitled" }),
    });
    if (!response.ok) {
      showToast("新建笔记失败", "error");
      return;
    }

    const note = (await response.json()) as { id: string; slug: string };
    const importResponse = await fetch(`/api/knowledge-bases/${kbId}/items/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        folderId,
        items: [{ kind: "note", noteId: note.id }],
      }),
    });
    if (!importResponse.ok) {
      showToast("新建笔记失败", "error");
      return;
    }

    const imported = (await importResponse.json()) as Array<{ id: string }>;
    await loadContents();
    updateParams({ itemId: imported[0]?.id ?? null });
    showToast("已在知识库新建笔记", "success");
  }, [folderId, kbId, loadContents, showToast, updateParams]);

  const importLocalAssets = async (files: File[], mode: "file" | "folder") => {
    if (!kbId) return;
    if (mode === "file" && !folderId) {
      showToast("请先选择知识库文件夹", "error");
      return;
    }

    const supportedFiles = files
      .map((file) => ({ file, importType: inferLocalKnowledgeImportType(file.name) }))
      .filter((item): item is { file: File; importType: LocalKnowledgeImportType } => Boolean(item.importType));

    if (supportedFiles.length === 0) {
      showToast("未找到支持的 Markdown、PDF 或电子书文件", "error");
      return;
    }

    let targetFolderId = folderId;
    if (!targetFolderId) {
      const response = await fetch(`/api/knowledge-bases/${kbId}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: localFolderName(files) }),
      });
      if (!response.ok) {
        showToast("本地文件夹导入失败", "error");
        return;
      }
      const folder = (await response.json()) as { id: string };
      targetFolderId = folder.id;
    }

    const created: Array<{ id: string }> = [];
    for (const { file, importType } of supportedFiles) {
      if (importType === "note") {
        const response = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: localImportTitle(file.name),
            content: await file.text(),
          }),
        });
        if (!response.ok) continue;
        const note = (await response.json()) as { id: string };
        const importResponse = await fetch(`/api/knowledge-bases/${kbId}/items/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            folderId: targetFolderId,
            items: [{ kind: "note", noteId: note.id }],
          }),
        });
        if (importResponse.ok) created.push(...((await importResponse.json()) as Array<{ id: string }>));
        continue;
      }

      const response = await fetch(`/api/knowledge-bases/${kbId}/items/asset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderId: targetFolderId,
          title: localImportTitle(file.name),
          assetType: importType,
          sourceName: "从本地导入",
          summary: `本地文件：${file.name}`,
        }),
      });
      if (response.ok) created.push((await response.json()) as { id: string });
    }

    if (created.length === 0) {
      showToast("本地导入失败", "error");
      return;
    }

    await loadCurrentBase();
    if (targetFolderId === folderId) await loadContents();
    updateParams({ folderId: targetFolderId, itemId: created[0]?.id ?? null });
    showToast(`已导入 ${created.length} 个本地文件`, "success");
  };

  const deleteSelectedItem = async () => {
    if (!kbId || !selectedItem) return;
    await deleteKnowledgeItem(selectedItem);
  };

  const deleteKnowledgeItem = async (item: KnowledgeItemRecord) => {
    if (!kbId) return;
    const response = await fetch(`/api/knowledge-bases/${kbId}/items/${item.id}`, {
      method: "DELETE",
    });
    if (response.ok) {
      showToast("已从知识库移除", "success");
      setOpenMenuId(null);
      await loadContents();
    }
  };

  const updateSelectedNoteContent = useCallback(
    (content: string) => {
      if (selectedItem?.kind !== "note") return;
      updateSelectedDetail((current) => {
        if (current?.content === content) return current;
        return current ? { ...current, content } : current;
      });
    },
    [selectedItem, updateSelectedDetail],
  );

  const updateSelectedNoteTitle = useCallback(
    (title: string) => {
      if (selectedItem?.kind !== "note") return;
      setItems((current) =>
        current.map((item) => {
          if (item.id !== selectedItem.id || item.kind !== "note" || !item.note) {
            return item;
          }
          if (item.note.title === title) {
            return item;
          }
          return {
            ...item,
            note: { ...item.note, title },
          };
        }),
      );
      updateSelectedDetail((current) => current ? { ...current, title } : current);
    },
    [selectedItem, setItems, updateSelectedDetail],
  );

  const copySelectedNote = async () => {
    if (selectedItem?.kind !== "note" || !selectedItem.note) return;

    try {
      const markdown = buildNoteCopyMarkdown({
        title: selectedItem.note.title,
        markdown: selectedItem.note.content ?? "",
      });
      await copyNoteMarkdownToClipboard(markdown, navigator.clipboard);
      showToast("已复制全文", "success");
    } catch {
      showToast("复制全文失败", "error");
    }
  };

  return (
    <div className={`mewmo-workspace ${listCollapsed ? "mewmo-workspace--list-collapsed" : ""}`}>
      <input
        ref={localFileInputRef}
        type="file"
        accept=".md,.markdown,.pdf,.epub,.mobi,.azw3"
        hidden
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          void importLocalAssets(files, "file");
        }}
      />
      <input
        ref={(node) => {
          localFolderInputRef.current = node;
          node?.setAttribute("webkitdirectory", "");
        }}
        type="file"
        accept=".md,.markdown,.pdf,.epub,.mobi,.azw3"
        hidden
        multiple
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          void importLocalAssets(files, "folder");
        }}
      />
      <ListColumn
        title={listTitle}
        titleMenuLabel="筛选"
        quickSwitch={quickSwitch}
        bodyRef={listRef}
        onSearchChange={setQuery}
        searchPlaceholder="搜索当前知识库..."
        action={
          <div className="mewmo-knowledge-list-actions">
            <button
              type="button"
              className="mewmo-icon-button"
              onClick={() => void handleNewNote()}
              aria-label="新建笔记"
            >
              <PrototypeIcon name="pen-new-square" size={17} />
            </button>
            {folderId ? (
              <button type="button" className="mewmo-icon-button" onClick={openImportModal} aria-label="从收藏箱导入">
                <PrototypeIcon name="inbox" size={17} />
              </button>
            ) : null}
          </div>
        }
      >
        {loading ? (
          <ListContentSkeleton active variant="mixed" label="正在加载知识库" />
        ) : error && items.length === 0 ? (
          <div className="mewmo-list-empty">
            <PrototypeIcon name="empty" size={36} />
            <p>{error}</p>
          </div>
        ) : !folderId ? (
          <KnowledgeRootEmptyState onImportLocalFolder={openLocalFolderImport} />
        ) : visibleItems.length === 0 ? (
          <KnowledgeEmptyState
            onImportInbox={openImportModal}
            onImportLocalFile={openLocalFileImport}
            onImportLocalFolder={openLocalFolderImport}
          />
        ) : (
          <div className="mewmo-knowledge-list">
            {visibleItems.map((item) => {
              const card = buildKnowledgeCardView(item);
              const preview = knowledgeCardPreview(item, card.summary);
              const noteImages = item.kind === "note" ? extractNoteImages(item.note?.content) : [];
              const selected = selectedItem?.id === item.id;
              const menuOpen = openMenuId === item.id;
              const cardHovered = hoveredCardId === item.id || menuOpen;
              const sourceUrl = knowledgeItemSourceUrl(item);
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
                    className={`mewmo-list-card mewmo-list-card--button mewmo-knowledge-card ${selected ? "mewmo-list-card--selected" : ""}`}
                    onClick={() => updateParams({ itemId: item.id })}
                  >
                    <div className="mewmo-list-card__title">
                      <span>{card.title}</span>
                    </div>
                    {preview && <p>{preview}</p>}
                    {item.kind === "clip" && item.clip?.coverImage && (
                      <div className="mewmo-list-card__cover" aria-hidden="true">
                        <img src={item.clip.coverImage} alt="" referrerPolicy="no-referrer" />
                      </div>
                    )}
                    {noteImages.length > 0 && (
                      <div className="mewmo-list-card__thumbs" aria-hidden="true">
                        {noteImages.map((src) => (
                          <span key={src} className="mewmo-list-card__thumb">
                            <img src={src} alt="" loading="lazy" />
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="mewmo-list-card__source mewmo-knowledge-card__source">
                      <PrototypeIcon name={card.icon} size={15} />
                      <span>{card.sourceText}</span>
                      <time>{formatKnowledgeListTime(item, card)}</time>
                    </div>
                  </button>
                  <CardActionMenu
                    kind={item.kind === "note" ? "notes" : "clips"}
                    open={menuOpen}
                    ariaLabel={item.kind === "note" ? "笔记操作" : "内容操作"}
                    onOpenChange={(open) => setOpenMenuId(open ? item.id : null)}
                    onDelete={() => void deleteKnowledgeItem(item)}
                    {...(item.kind === "note"
                      ? {
                          onShare: () => showToast("已复制分享链接", "success"),
                          onExport: () => showToast("已导出 Markdown 文件", "success"),
                        }
                      : { onRefresh: () => showToast("已刷新内容", "success") })}
                    {...(sourceUrl
                      ? {
                          onCopyLink: () => {
                            void navigator.clipboard?.writeText(sourceUrl);
                            showToast("已复制链接", "success");
                          },
                          href: sourceUrl,
                        }
                      : {})}
                  />
                </article>
              );
            })}
          </div>
        )}
      </ListColumn>

      <section className="mewmo-reader-surface">
        <ReaderToolbar
          title={selectedCard?.title ?? listTitle}
          titleVisible={toolbarTitleVisible}
          onTitleClick={scrollToTop}
          onToggleList={() => setListCollapsed((value) => !value)}
          listCollapsed={listCollapsed}
          menuKind={selectedItem?.kind === "note" ? "notes" : "clips"}
          onDelete={selectedItem ? () => void deleteSelectedItem() : undefined}
          onCopyContent={
            selectedItem?.kind === "note" && selectedItem.note
              ? () => void copySelectedNote()
              : undefined
          }
          onCopyLink={
            selectedSourceUrl
              ? () => {
                  void navigator.clipboard?.writeText(selectedSourceUrl);
                  showToast("已复制链接", "success");
                }
              : undefined
          }
        />
        <ReaderToc
          items={selectedToc}
          scrollRef={scrollRef}
          headingSelector={selectedHeadingSelector}
          ariaLabel={selectedItem?.kind === "note" ? "笔记目录" : "内容目录"}
          minItems={selectedItem?.kind === "note" ? 1 : 3}
        />
        <div
          ref={scrollRef}
          className={`mewmo-reader-scroll ${selectedItem?.kind === "note" ? "mewmo-reader-scroll--editor" : ""}`}
        >
          <KnowledgeReader
            item={selectedItem}
            card={selectedCard}
            title={listTitle}
            loading={selectedDetailLoading}
            error={selectedDetailError}
            onNoteContentChange={updateSelectedNoteContent}
            onNoteTitleChange={updateSelectedNoteTitle}
          />
        </div>
        <ReaderBackToTopButton scrollRef={scrollRef} visible={toolbarTitleVisible} />
      </section>

      <KnowledgeImportModal
        open={importOpen && Boolean(folderId)}
        knowledgeBaseId={kbId}
        folderId={folderId}
        onClose={closeImportModal}
        onImported={() => {
          void loadContents();
          showToast("已导入知识库", "success");
        }}
      />
    </div>
  );
}

function KnowledgeRootEmptyState({ onImportLocalFolder }: { onImportLocalFolder: () => void }) {
  return (
    <div className="mewmo-list-empty mewmo-knowledge-empty">
      <PrototypeIcon name="folder" size={40} />
      <p>一级目录只存放文件夹</p>
      <div className="mewmo-knowledge-empty__actions">
        <button type="button" className="mewmo-knowledge-empty__asset" onClick={onImportLocalFolder}>
          <PrototypeIcon name="folder" size={15} />
          <span>从本地文件夹导入</span>
        </button>
      </div>
    </div>
  );
}

function KnowledgeEmptyState({
  onImportInbox,
  onImportLocalFile,
  onImportLocalFolder,
}: {
  onImportInbox: () => void;
  onImportLocalFile: () => void;
  onImportLocalFolder: () => void;
}) {
  return (
    <div className="mewmo-list-empty mewmo-knowledge-empty">
      <PrototypeIcon name="library" size={40} />
      <p>这个位置还没有内容</p>
      <div className="mewmo-knowledge-empty__actions">
        <button type="button" className="mewmo-button" onClick={onImportInbox}>
          从收藏箱导入
        </button>
        <button type="button" className="mewmo-knowledge-empty__asset" onClick={onImportLocalFile}>
          <PrototypeIcon name="import" size={15} />
          <span>从本地文件导入</span>
        </button>
        <button type="button" className="mewmo-knowledge-empty__asset" onClick={onImportLocalFolder}>
          <PrototypeIcon name="folder" size={15} />
          <span>从本地文件夹导入</span>
        </button>
      </div>
    </div>
  );
}

function KnowledgeReader({
  item,
  card,
  title,
  loading,
  error,
  onNoteContentChange,
  onNoteTitleChange,
}: {
  item: KnowledgeItemRecord | null;
  card: ReturnType<typeof buildKnowledgeCardView> | null;
  title: string;
  loading: boolean;
  error: string;
  onNoteContentChange: (content: string) => void;
  onNoteTitleChange: (title: string) => void;
}) {
  if (!item || !card) {
    if (loading) {
      return (
        <article className="mewmo-document mewmo-document--clip">
          <ReaderContentSkeleton active showTitle label="正在加载内容" />
        </article>
      );
    }
    return (
      <article className="mewmo-document mewmo-document--empty">
        <h1>{title}</h1>
        <p>知识库里的笔记、剪藏、订阅条目和本地文件会在这里打开。</p>
      </article>
    );
  }

  if (item.kind === "note" && item.note) {
    if (typeof item.note.content !== "string") {
      return (
        <KnowledgeBodyLoading loading={loading} error={error} />
      );
    }
    return (
      <NoteEditor
        key={item.note.id}
        noteId={item.note.id}
        initialTitle={item.note.title}
        initialSummary={item.note.summary ?? null}
        initialContent={item.note.content}
        updatedAt={item.note.updatedAt ?? item.updatedAt}
        serverVersion={(item.note as { version?: number }).version}
        onContentChange={onNoteContentChange}
        onTitleChange={onNoteTitleChange}
        embedded
      />
    );
  }

  if (item.kind === "asset") {
    return (
      <article className="mewmo-document mewmo-document--knowledge mewmo-knowledge-asset-reader">
        <span className="mewmo-knowledge-asset-reader__icon">
          <PrototypeIcon name={card.icon} size={44} />
        </span>
        <h1>{card.title}</h1>
        <div className="mewmo-doc-meta">
          <span>{card.sourceText}</span>
          <span><b aria-hidden="true">·</b>{item.assetType === "ebook" ? "电子书" : "PDF"}</span>
        </div>
        <p>{card.summary}</p>
      </article>
    );
  }

  if (item.kind === "clip" && item.clip) {
    if (typeof item.clip.content !== "string") {
      return (
        <KnowledgeBodyLoading loading={loading} error={error} />
      );
    }
    return (
      <article className="mewmo-document mewmo-document--clip mewmo-document--knowledge">
        <h1>{card.title}</h1>
        <SourceStrip card={card} url={item.clip.url} />
        <ClipContentRenderer html={item.clip.content} sourceUrl={item.clip.url} contentKey={item.clip.id} />
      </article>
    );
  }

  if (item.kind === "feed_entry" && item.feedEntry) {
    if (typeof item.feedEntry.content !== "string") {
      return (
        <KnowledgeBodyLoading loading={loading} error={error} />
      );
    }
    return (
      <article className="mewmo-document mewmo-document--knowledge">
        <h1>{card.title}</h1>
        <SourceStrip card={card} url={item.feedEntry.url} />
        {item.feedEntry.summary && <p className="mewmo-feed-reader__summary">{item.feedEntry.summary}</p>}
        <ClipContentRenderer
          html={item.feedEntry.content}
          sourceUrl={item.feedEntry.url}
          contentKey={item.feedEntry.id}
        />
      </article>
    );
  }

  return (
    <article className="mewmo-document mewmo-document--knowledge">
      <h1>{card.title}</h1>
      <div className="mewmo-doc-meta">
        <span>{card.sourceText}</span>
        <span><b aria-hidden="true">·</b>{formatKnowledgeListTime(item, card)}</span>
      </div>
      <div className="mewmo-knowledge-note-body">
        {item.note?.content || item.note?.summary || card.summary}
      </div>
    </article>
  );
}

function KnowledgeBodyLoading({ loading, error }: { loading: boolean; error: string }) {
  if (error) {
    return (
      <article className="mewmo-document mewmo-document--empty">
        <p>{error}</p>
      </article>
    );
  }

  if (!loading) {
    return (
      <article className="mewmo-document mewmo-document--empty">
        <p>暂无正文内容</p>
      </article>
    );
  }

  return (
    <article className="mewmo-document mewmo-document--clip">
      <ReaderContentSkeleton active showTitle label="正在加载内容" />
    </article>
  );
}

function SourceStrip({
  card,
  url,
}: {
  card: ReturnType<typeof buildKnowledgeCardView>;
  url: string;
}) {
  return (
    <div className="mewmo-source-strip">
      <PrototypeIcon name={card.icon} size={16} />
      <span>{card.readerSourceText}</span>
      <a href={url} target="_blank" rel="noreferrer">
        原文
      </a>
    </div>
  );
}

function buildKnowledgeItemToc(item: KnowledgeItemRecord | null) {
  if (!item) return [];
  if (item.kind === "note" && item.note) return noteToc.buildNoteToc(item.note.content ?? "");
  if (item.kind === "clip" && item.clip) return noteToc.buildHtmlToc(item.clip.content ?? "");
  if (item.kind === "feed_entry" && item.feedEntry) return noteToc.buildHtmlToc(item.feedEntry.content ?? "");
  return [];
}

function knowledgeItemSourceUrl(item: KnowledgeItemRecord) {
  if (item.kind === "clip" && item.clip) return item.clip.url;
  if (item.kind === "feed_entry" && item.feedEntry) return item.feedEntry.url;
  if (item.kind === "asset") return item.sourceUrl ?? null;
  return null;
}

function findFolderName(folders: KnowledgeFolderNode[], id: string): string | null {
  for (const folder of folders) {
    if (folder.id === id) return folder.name;
    const child = findFolderName(folder.children, id);
    if (child) return child;
  }
  return null;
}

function knowledgeCardPreview(item: KnowledgeItemRecord, fallback: string) {
  if (item.kind === "note" && item.note) {
    return notePreviewText({
      summary: item.note.summary ?? null,
      content: item.note.content ?? "",
    }) || fallback;
  }

  if (item.kind === "clip" && item.clip) {
    return clipPreviewText({
      content: item.clip.content ?? "",
      excerpt: item.clip.excerpt ?? null,
      summary: item.clip.summary ?? null,
      url: item.clip.url,
    });
  }

  return fallback;
}

function formatKnowledgeListTime(
  item: KnowledgeItemRecord,
  card: ReturnType<typeof buildKnowledgeCardView>,
) {
  const value = card.createdAt ?? card.updatedAt;
  if (!value) return "";
  if (item.kind === "note") return formatNoteListTime(value);
  return formatClipListTime(value);
}

function inferLocalKnowledgeImportType(fileName: string): LocalKnowledgeImportType | null {
  const normalized = fileName.toLowerCase();
  if (/\.(md|markdown)$/.test(normalized)) return "note";
  if (normalized.endsWith(".pdf")) return "pdf";
  if (/\.(epub|mobi|azw3)$/.test(normalized)) return "ebook";
  return null;
}

function localImportTitle(fileName: string) {
  return fileName.replace(/\.(md|markdown|pdf|epub|mobi|azw3)$/i, "");
}

function localFolderName(files: File[]) {
  const relativePath = files.find((file) => file.webkitRelativePath)?.webkitRelativePath;
  const name = relativePath?.split("/").filter(Boolean)[0];
  return name || "本地文件夹";
}
