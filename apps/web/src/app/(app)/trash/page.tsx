"use client";

import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";
import { useToast } from "../../../components/ui/ToastProvider";
import { ListColumn } from "../../../components/shell/ListColumn";
import { PrototypeIcon, type PrototypeIconName } from "../../../components/shell/PrototypeIcon";

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
}

const typeMeta: Record<TrashItemType, { label: string; icon: PrototypeIconName }> = {
  note: { label: "笔记", icon: "note" },
  clip: { label: "剪藏", icon: "bookmark" },
  feed: { label: "订阅源", icon: "rss" },
  knowledge_base: { label: "知识库", icon: "library" },
};

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
  if (item.summary) return item.summary;
  if (item.url) return item.url;
  return "无摘要";
}

export default function TrashPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<TrashItem[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<TrashItem | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTrash() {
      try {
        setIsLoading(true);
        setError("");
        const response = await fetch("/api/trash");
        if (!response.ok) throw new Error("Failed to load trash");
        const data = (await response.json()) as TrashItem[];
        if (!cancelled) setItems(data);
      } catch {
        if (!cancelled) setError("无法加载废纸篓");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadTrash();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return [...items]
      .filter((item) => {
        if (!normalizedQuery) return true;
        return `${typeMeta[item.type].label} ${item.title} ${item.summary ?? ""} ${item.url ?? ""}`
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((left, right) => new Date(right.deletedAt).getTime() - new Date(left.deletedAt).getTime());
  }, [items, query]);

  const counts = useMemo(() => {
    return items.reduce<Record<TrashItemType, number>>(
      (next, item) => ({ ...next, [item.type]: next[item.type] + 1 }),
      { note: 0, clip: 0, feed: 0, knowledge_base: 0 },
    );
  }, [items]);

  const restoreItem = async (item: TrashItem) => {
    const response = await fetch(itemPath(item), { method: "PATCH" });
    if (!response.ok) {
      showToast("恢复失败", "error");
      return;
    }

    setItems((current) => current.filter((value) => !(value.type === item.type && value.id === item.id)));
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

    setItems((current) => current.filter((value) => !(value.type === item.type && value.id === item.id)));
    setConfirmDeleteItem(null);
    showToast("已永久删除", "success");
  };

  return (
    <div className="mewmo-workspace">
      <ListColumn
        title="废纸篓"
        searchPlaceholder="搜索废纸篓..."
        onSearchChange={setQuery}
      >
        {isLoading ? (
          <div className="mewmo-list-empty">
            <span className="mewmo-spinner" aria-hidden="true" />
            <p>正在加载废纸篓...</p>
          </div>
        ) : error ? (
          <div className="mewmo-list-empty">
            <PrototypeIcon name="empty" size={36} />
            <p>{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="mewmo-list-empty">
            <PrototypeIcon name="trash" size={38} />
            <p>废纸篓是空的</p>
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
              return (
                <article key={`${item.type}-${item.id}`} className="mewmo-list-card mewmo-trash-card">
                  <div className="mewmo-list-card__title">
                    <PrototypeIcon name={meta.icon} dual size={18} />
                    <span>{item.title}</span>
                  </div>
                  <p>{previewText(item)}</p>
                  <div className="mewmo-list-card__source mewmo-trash-card__meta">
                    <b>{meta.label}</b>
                    <time>{formatDateTime(item.deletedAt)}</time>
                    <span>{retentionLabel(item)}</span>
                  </div>
                  <div className="mewmo-trash-card__actions">
                    <button
                      type="button"
                      className="mewmo-button mewmo-button--ghost"
                      onClick={() => void restoreItem(item)}
                    >
                      恢复
                    </button>
                    <button
                      type="button"
                      className="mewmo-button mewmo-button--danger"
                      onClick={() => setConfirmDeleteItem(item)}
                    >
                      永久删除
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </ListColumn>

      <section className="mewmo-reader-surface">
        <div className="mewmo-reader-scroll">
          <article className="mewmo-document mewmo-document--trash">
            <h1>废纸篓</h1>
            <p>删除的内容保留 14 天。</p>
            <div className="mewmo-trash-summary">
              {Object.entries(counts).map(([type, count]) => (
                <div key={type} className="mewmo-trash-summary__item">
                  <PrototypeIcon name={typeMeta[type as TrashItemType].icon} dual size={20} />
                  <span>{typeMeta[type as TrashItemType].label}</span>
                  <b>{count}</b>
                </div>
              ))}
            </div>
          </article>
        </div>
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
