"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ClipContentRenderer } from "../../../components/clips/ClipContentRenderer";
import { ReaderBackToTopButton } from "../../../components/shell/ReaderBackToTopButton";
import { ListColumn } from "../../../components/shell/ListColumn";
import { PrototypeIcon, type PrototypeIconName } from "../../../components/shell/PrototypeIcon";
import { ReaderToolbar } from "../../../components/shell/ReaderToolbar";
import { useReaderToolbarTitleVisibility } from "../../../components/shell/useReaderToolbarTitleVisibility";
import { SharedNoteMarkdown } from "../../../components/share/SharedNoteMarkdown";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { useToast } from "../../../components/ui/ToastProvider";
import {
  WorkspaceScopeChangedError,
  getWorkspaceResource,
  invalidateWorkspaceResource,
  invalidateWorkspaceResourcePrefix,
  refreshWorkspaceResource,
} from "../../../lib/workspace-data-cache";
import { workspaceResourceKeys } from "../../../lib/workspace-resource-keys";
import { useWorkspaceResource } from "../../../lib/use-workspace-resource";

const DAY_MS = 24 * 60 * 60 * 1000;

type TrashItemType = "note" | "clip" | "feed" | "knowledge_base";

interface TrashItem {
  type: TrashItemType;
  id: string;
  title: string;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string;
  expiresAt: string;
  url?: string | null;
  icon?: string | null;
  feedType?: string | null;
  content?: string;
  description?: string | null;
  excerpt?: string | null;
  favicon?: string | null;
  coverImage?: string | null;
  sourceName?: string | null;
  author?: string | null;
  publishedAt?: string | null;
}

const typeMeta: Record<TrashItemType, { label: string; icon: PrototypeIconName }> = {
  note: { label: "笔记", icon: "note" },
  clip: { label: "剪藏", icon: "bookmark" },
  feed: { label: "订阅源", icon: "rss" },
  knowledge_base: { label: "知识库", icon: "library" },
};

function itemKey(item: TrashItem) {
  return `${item.type}-${item.id}`;
}

function itemPath(item: TrashItem) {
  return `/api/trash/${item.type}/${item.id}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function daysLeft(item: TrashItem) {
  const expiresAt = new Date(item.expiresAt).getTime();
  if (!Number.isFinite(expiresAt)) return 0;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / DAY_MS));
}

function retentionLabel(item: TrashItem) {
  const days = daysLeft(item);
  if (days <= 0) return "即将清理";
  return `剩 ${days} 天`;
}

function previewText(item: TrashItem) {
  if (item.excerpt) return item.excerpt;
  if (item.summary) return item.summary;
  if (item.description) return item.description;
  if (item.url) return item.url;
  return "无摘要";
}

function sourceLabel(item: TrashItem) {
  if (item.sourceName) return item.sourceName;
  if (item.type === "feed" && item.feedType) return item.feedType;
  return typeMeta[item.type].label;
}

function DetailMetadata({ item }: { item: TrashItem }) {
  const values = [
    typeMeta[item.type].label,
    item.sourceName,
    item.author,
    item.publishedAt ? formatDateTime(item.publishedAt) : null,
    `删除于 ${formatDateTime(item.deletedAt)}`,
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="mewmo-doc-meta">
      {values.map((value, index) => (
        <span key={`${value}-${index}`}>
          {index > 0 && <b aria-hidden="true">·</b>}
          {value}
        </span>
      ))}
      {item.url && (
        <span>
          {values.length > 0 && <b aria-hidden="true">·</b>}
          <a className="mewmo-doc-meta__link" href={item.url} target="_blank" rel="noreferrer">
            原文
          </a>
        </span>
      )}
    </div>
  );
}

function TrashDetail({ item, loading }: { item: TrashItem; loading: boolean }) {
  return (
    <article className="mewmo-document mewmo-document--trash-detail">
      {item.coverImage && (
        <div className="mewmo-trash-detail__cover" aria-hidden="true">
          <img src={item.coverImage} alt="" />
        </div>
      )}
      <h1>{item.title}</h1>
      <DetailMetadata item={item} />
      {item.type === "note" ? (
        <SharedNoteMarkdown content={item.content ?? ""} />
      ) : item.type === "clip" ? (
        <ClipContentRenderer
          html={item.content ?? ""}
          sourceUrl={item.url ?? ""}
          contentKey={itemKey(item)}
          loading={loading}
        />
      ) : (
        <div className="mewmo-trash-detail__summary">
          <p>{item.description ?? item.summary ?? "这条内容没有补充说明。"}</p>
          {item.type === "knowledge_base" && item.icon && (
            <p className="mewmo-trash-detail__source">知识库标识：{item.icon}</p>
          )}
          {item.type === "feed" && item.feedType && (
            <p className="mewmo-trash-detail__source">订阅类型：{item.feedType}</p>
          )}
        </div>
      )}
    </article>
  );
}

export default function TrashPage() {
  const { showToast } = useToast();
  const scrollRef = useRef<HTMLDivElement>(null);
  const {
    data: items,
    initialLoading: isLoading,
    error,
    update: updateItems,
  } = useWorkspaceResource<TrashItem[]>({
    key: workspaceResourceKeys.trashList(),
    initialData: [],
    load: async () => {
      const response = await fetch("/api/trash");
      if (!response.ok) throw new Error("Failed to load trash");
      return (await response.json()) as TrashItem[];
    },
    errorMessage: "无法加载废纸篓",
  });
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<TrashItem | null>(null);
  const [loadingDetailKey, setLoadingDetailKey] = useState<string | null>(null);
  const [detailError, setDetailError] = useState("");
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<TrashItem | null>(null);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...items]
      .filter((item) => {
        if (!normalizedQuery) return true;
        return `${typeMeta[item.type].label} ${item.title} ${item.summary ?? ""} ${item.excerpt ?? ""} ${item.url ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((left, right) => new Date(right.deletedAt).getTime() - new Date(left.deletedAt).getTime());
  }, [items, query]);

  const selectedListItem =
    visibleItems.find((item) => itemKey(item) === selectedKey) ??
    visibleItems[0] ??
    null;

  useEffect(() => {
    if (!selectedListItem) {
      setSelectedDetail(null);
      setLoadingDetailKey(null);
      setDetailError("");
      return;
    }

    const item = selectedListItem;
    let cancelled = false;
    const resourceKey = workspaceResourceKeys.trashDetail(item.type, item.id);
    const cachedDetail = getWorkspaceResource<TrashItem>(resourceKey)?.value ?? null;
    if (cachedDetail) setSelectedDetail(cachedDetail);
    setDetailError("");
    setLoadingDetailKey(itemKey(item));
    void refreshWorkspaceResource(resourceKey, async () => {
      const response = await fetch(itemPath(item));
        if (!response.ok) throw new Error("detail");
      return (await response.json()) as TrashItem;
    })
      .then((detail) => {
        if (!cancelled) setSelectedDetail(detail);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof WorkspaceScopeChangedError) return;
        if (!cancelled) {
          if (!cachedDetail) setSelectedDetail(null);
          setDetailError("无法加载这条内容");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingDetailKey(null);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedListItem]);

  const { toolbarTitleVisible } = useReaderToolbarTitleVisibility({ scrollRef });

  const invalidateRestoredWorkspaceResources = (item: TrashItem) => {
    invalidateWorkspaceResource(workspaceResourceKeys.trashDetail(item.type, item.id));
    invalidateWorkspaceResource(workspaceResourceKeys.todayList());
    invalidateWorkspaceResourcePrefix("knowledge:contents:");
    if (item.type === "note") {
      invalidateWorkspaceResource(workspaceResourceKeys.notesList());
      invalidateWorkspaceResource(workspaceResourceKeys.noteDetail(item.id));
    } else if (item.type === "clip") {
      invalidateWorkspaceResource(workspaceResourceKeys.clipsList());
      invalidateWorkspaceResource(workspaceResourceKeys.clipDetail(item.id));
    } else if (item.type === "feed") {
      invalidateWorkspaceResourcePrefix("feeds:sources:");
    } else {
      invalidateWorkspaceResource(workspaceResourceKeys.knowledgeBases());
      invalidateWorkspaceResourcePrefix("knowledge:tree:");
    }
  };

  const removeItem = (item: TrashItem) => {
    updateItems((current) => current.filter((value) => itemKey(value) !== itemKey(item)));
    invalidateRestoredWorkspaceResources(item);
    setSelectedDetail(null);
    setDetailError("");
  };

  const restoreItem = async (item: TrashItem) => {
    const response = await fetch(itemPath(item), { method: "PATCH" });
    if (!response.ok) {
      showToast("恢复失败", "error");
      return;
    }

    removeItem(item);
    showToast("已恢复", "success");
  };

  const deletePermanently = async () => {
    if (!confirmDeleteItem) return;

    const item = confirmDeleteItem;
    const response = await fetch(itemPath(item), { method: "DELETE" });
    if (!response.ok) {
      showToast("永久删除失败", "error");
      return;
    }

    removeItem(item);
    setConfirmDeleteItem(null);
    showToast("已永久删除", "success");
  };

  const detailIsLoading = Boolean(
    selectedListItem && loadingDetailKey === itemKey(selectedListItem),
  );

  return (
    <div className="mewmo-workspace">
      <ListColumn title="废纸篓" searchPlaceholder="搜索废纸篓..." onSearchChange={setQuery}>
        {isLoading ? (
          <div className="mewmo-list-empty">
            <span className="mewmo-spinner" aria-hidden="true" />
            <p>正在加载废纸篓...</p>
          </div>
        ) : error && items.length === 0 ? (
          <div className="mewmo-list-empty">
            <PrototypeIcon name="empty" size={36} />
            <p>{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="mewmo-list-empty">
            <PrototypeIcon name="trash" size={38} />
            <p>废纸篓是空的</p>
            <span>删除的内容会保留 14 天。</span>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="mewmo-list-empty">
            <PrototypeIcon name="search" size={34} />
            <p>没有找到匹配的内容</p>
          </div>
        ) : (
          <div className="mewmo-trash-list">
            {visibleItems.map((item) => {
              const meta = typeMeta[item.type];
              const selected = itemKey(selectedListItem ?? item) === itemKey(item);
              return (
                <div key={itemKey(item)} className="mewmo-list-card-wrap">
                  <button
                    type="button"
                    className={`mewmo-list-card mewmo-list-card--button mewmo-trash-card ${selected ? "mewmo-list-card--selected" : ""}`}
                    onClick={() => setSelectedKey(itemKey(item))}
                  >
                    <div className="mewmo-list-card__title">
                      <span>{item.title}</span>
                    </div>
                    <p>{previewText(item)}</p>
                    {item.coverImage && (
                      <div className="mewmo-list-card__cover" aria-hidden="true">
                        <img src={item.coverImage} alt="" />
                      </div>
                    )}
                    <div className="mewmo-list-card__source mewmo-trash-card__meta">
                      <PrototypeIcon name={meta.icon} dual size={14} />
                      <span>{sourceLabel(item)}</span>
                      <time dateTime={item.deletedAt}>{formatDateTime(item.deletedAt)}</time>
                      <span>{retentionLabel(item)}</span>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </ListColumn>

      <section className="mewmo-reader-surface mewmo-reader-surface--trash">
        <ReaderToolbar
          title={selectedListItem?.title ?? "废纸篓"}
          titleVisible={toolbarTitleVisible}
          onTitleClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
          showMenu={false}
          actions={
            selectedListItem ? (
              <div className="mewmo-trash-reader-actions">
                <button
                  type="button"
                  className="mewmo-button mewmo-button--ghost"
                  onClick={() => void restoreItem(selectedListItem)}
                >
                  恢复
                </button>
                <button
                  type="button"
                  className="mewmo-button mewmo-button--danger"
                  onClick={() => setConfirmDeleteItem(selectedListItem)}
                >
                  永久删除
                </button>
              </div>
            ) : null
          }
        />
        <div ref={scrollRef} className="mewmo-reader-scroll">
          {detailIsLoading && !selectedDetail ? (
            <article className="mewmo-document mewmo-document--empty">
              <span className="mewmo-spinner" aria-hidden="true" />
              <p>正在加载内容...</p>
            </article>
          ) : detailError && !selectedDetail ? (
            <article className="mewmo-document mewmo-document--empty">
              <h1>内容暂时无法打开</h1>
              <p>{detailError}</p>
            </article>
          ) : selectedDetail ? (
            <TrashDetail item={selectedDetail} loading={detailIsLoading} />
          ) : (
            <article className="mewmo-document mewmo-document--empty mewmo-trash-detail__empty">
              <h1>{query ? "没有可预览的内容" : "废纸篓是空的"}</h1>
              <p>删除的内容会保留 14 天，之后自动清理。</p>
            </article>
          )}
        </div>
        <ReaderBackToTopButton scrollRef={scrollRef} visible={toolbarTitleVisible} />
      </section>

      <ConfirmDialog
        open={Boolean(confirmDeleteItem)}
        title={confirmDeleteItem ? `永久删除「${confirmDeleteItem.title}」？` : "永久删除？"}
        description="这个操作无法撤销。"
        confirmLabel="永久删除"
        cancelLabel="取消"
        onConfirm={() => void deletePermanently()}
        onCancel={() => setConfirmDeleteItem(null)}
      />
    </div>
  );
}
