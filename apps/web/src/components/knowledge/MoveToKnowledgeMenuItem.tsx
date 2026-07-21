"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildKnowledgeFolderTree,
  type KnowledgeFolderNode,
} from "../../lib/knowledge-tree";
import { invalidateWorkspaceResourcePrefix } from "../../lib/workspace-data-cache";
import { useFloatingMenuClose } from "../ui/FloatingMenu";
import { useToast } from "../ui/ToastProvider";
import { PrototypeIcon } from "../shell/PrototypeIcon";

export type MoveToKnowledgeTarget =
  | { kind: "note"; noteId: string; title: string }
  | { kind: "clip"; clipId: string; title: string }
  | { kind: "feed_entry"; feedEntryId: string; title: string };

interface KnowledgeBaseOption {
  id: string;
  title: string;
}

interface KnowledgeTreeResponse extends KnowledgeBaseOption {
  folders?: Array<{
    id: string;
    name: string;
    parentId?: string | null;
    depth: number;
    position?: number | null;
  }>;
}

type LoadState = "idle" | "loading" | "error" | "ready";

const MODAL_EXIT_MS = 160;

export function MoveToKnowledgeMenuItem({
  target,
}: {
  target: MoveToKnowledgeTarget;
}) {
  const { showToast } = useToast();
  const closeMenu = useFloatingMenuClose();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [bases, setBases] = useState<KnowledgeBaseOption[]>([]);
  const [basesState, setBasesState] = useState<LoadState>("idle");
  const [selectedBaseId, setSelectedBaseId] = useState("");
  const [foldersByBase, setFoldersByBase] = useState<
    Record<string, KnowledgeFolderNode[]>
  >({});
  const [folderStates, setFolderStates] = useState<Record<string, LoadState>>(
    {},
  );
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), MODAL_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const loadBases = useCallback(async () => {
    setBasesState("loading");
    try {
      const response = await fetch("/api/knowledge-bases");
      if (!response.ok) throw new Error("load");
      const data = (await response.json()) as KnowledgeBaseOption[];
      const list = Array.isArray(data) ? data : [];
      setBases(list);
      setBasesState("ready");
      setSelectedBaseId((current) => current || list[0]?.id || "");
    } catch {
      setBasesState("error");
      showToast("知识库加载失败，请稍后再试。", "error");
    }
  }, [showToast]);

  const loadFolders = useCallback(
    async (baseId: string, force = false) => {
      let shouldLoad = true;
      setFolderStates((current) => {
        const state = current[baseId] ?? "idle";
        if (!force && (state === "loading" || state === "ready")) {
          shouldLoad = false;
          return current;
        }
        return { ...current, [baseId]: "loading" };
      });
      if (!shouldLoad) return;
      try {
        const response = await fetch(`/api/knowledge-bases/${baseId}`);
        if (!response.ok) throw new Error("load");
        const data = (await response.json()) as KnowledgeTreeResponse;
        setFoldersByBase((current) => ({
          ...current,
          [baseId]: buildKnowledgeFolderTree(data.folders ?? []),
        }));
        setFolderStates((current) => ({ ...current, [baseId]: "ready" }));
      } catch {
        setFolderStates((current) => ({ ...current, [baseId]: "error" }));
        showToast("文件夹加载失败，请稍后再试。", "error");
      }
    },
    [showToast],
  );

  useEffect(() => {
    if (!open) return;
    void loadBases();
  }, [open, loadBases]);

  useEffect(() => {
    if (!open || !selectedBaseId) return;
    setSelectedFolderId(null);
    void loadFolders(selectedBaseId);
  }, [open, selectedBaseId, loadFolders]);

  const openModal = () => {
    closeMenu?.();
    setOpen(true);
    setSelectedFolderId(null);
    setSubmitting(false);
  };

  const closeModal = () => {
    if (submitting) return;
    setOpen(false);
  };

  const move = async () => {
    if (!selectedBaseId || submitting) return;
    setSubmitting(true);
    showToast("正在移动...", "loading");

    const item =
      target.kind === "note"
        ? { kind: target.kind, noteId: target.noteId }
        : target.kind === "clip"
          ? { kind: target.kind, clipId: target.clipId }
          : { kind: target.kind, feedEntryId: target.feedEntryId };

    try {
      const response = await fetch(
        `/api/knowledge-bases/${selectedBaseId}/items/import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            folderId: selectedFolderId,
            items: [item],
          }),
        },
      );
      if (response.status === 409) {
        showToast("这条内容已经在目标文件夹中。", "error");
        return;
      }
      if (!response.ok) throw new Error("move");
      invalidateWorkspaceResourcePrefix(`knowledge:contents:${selectedBaseId}:`);
      showToast("已移动到知识库", "success");
      setOpen(false);
    } catch {
      showToast("移动失败，请稍后再试。", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const folderState = selectedBaseId
    ? (folderStates[selectedBaseId] ?? "idle")
    : "idle";
  const flatFolders = selectedBaseId
    ? flattenFolders(foldersByBase[selectedBaseId] ?? [])
    : [];
  const canSubmit =
    Boolean(selectedBaseId) &&
    basesState === "ready" &&
    bases.length > 0 &&
    !submitting;

  return (
    <>
      <button
        type="button"
        className="mewmo-card-menu__item"
        aria-haspopup="dialog"
        onClick={openModal}
      >
        <span className="mewmo-card-menu__icon">
          <PrototypeIcon name="library" size={16} dual />
        </span>
        <span>移动到知识库</span>
      </button>

      {mounted && (
        <div
          className="mewmo-move-knowledge"
          data-state={open ? "open" : "closed"}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mewmo-move-knowledge-title"
        >
          <button
            type="button"
            className="mewmo-move-knowledge__scrim"
            aria-label="关闭"
            onClick={closeModal}
          />
          <section className="mewmo-move-knowledge__panel">
            <div className="mewmo-move-knowledge__head">
              <h2 id="mewmo-move-knowledge-title">移动到知识库</h2>
              <button
                type="button"
                className="mewmo-move-knowledge__close"
                aria-label="关闭"
                onClick={closeModal}
              >
                <PrototypeIcon name="close" size={19} className="mewmo-icon-close" />
              </button>
            </div>

            <p className="mewmo-move-knowledge__source">
              将「{target.title || "未命名内容"}」加入目标知识库
            </p>

            <div className="mewmo-move-knowledge__body">
              <div className="mewmo-move-knowledge__column">
                <p className="mewmo-move-knowledge__label">知识库</p>
                <div className="mewmo-move-knowledge__list" aria-label="知识库">
                  {basesState === "loading" && (
                    <p className="mewmo-move-knowledge__status">正在加载...</p>
                  )}
                  {basesState === "error" && (
                    <button
                      type="button"
                      className="mewmo-move-knowledge__row"
                      onClick={() => {
                        setBasesState("idle");
                        void loadBases();
                      }}
                    >
                      加载失败，点击重试
                    </button>
                  )}
                  {basesState === "ready" && bases.length === 0 && (
                    <p className="mewmo-move-knowledge__status">
                      暂无知识库，请先创建一个
                    </p>
                  )}
                  {bases.map((base) => (
                    <button
                      key={base.id}
                      type="button"
                      className={`mewmo-move-knowledge__row ${selectedBaseId === base.id ? "mewmo-move-knowledge__row--active" : ""}`}
                      onClick={() => setSelectedBaseId(base.id)}
                    >
                      <span className="mewmo-card-menu__icon">
                        <PrototypeIcon name="library" size={16} dual />
                      </span>
                      <span>{base.title}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mewmo-move-knowledge__column">
                <p className="mewmo-move-knowledge__label">文件夹</p>
                <div className="mewmo-move-knowledge__list" aria-label="文件夹">
                  {!selectedBaseId && (
                    <p className="mewmo-move-knowledge__status">请先选择知识库</p>
                  )}
                  {selectedBaseId && (
                    <>
                      <button
                        type="button"
                        className={`mewmo-move-knowledge__row ${selectedFolderId === null ? "mewmo-move-knowledge__row--active" : ""}`}
                        onClick={() => setSelectedFolderId(null)}
                      >
                        <span className="mewmo-card-menu__icon">
                          <PrototypeIcon name="library" size={16} dual />
                        </span>
                        <span>知识库根级</span>
                      </button>
                      {folderState === "loading" && (
                        <p className="mewmo-move-knowledge__status">正在加载...</p>
                      )}
                      {folderState === "error" && (
                        <button
                          type="button"
                          className="mewmo-move-knowledge__row"
                          onClick={() => {
                            void loadFolders(selectedBaseId, true);
                          }}
                        >
                          加载失败，点击重试
                        </button>
                      )}
                      {folderState === "ready" && flatFolders.length === 0 && (
                        <p className="mewmo-move-knowledge__status">
                          暂无其他文件夹
                        </p>
                      )}
                      {flatFolders.map((folder) => (
                        <button
                          key={folder.id}
                          type="button"
                          className={`mewmo-move-knowledge__row ${selectedFolderId === folder.id ? "mewmo-move-knowledge__row--active" : ""}`}
                          style={{ paddingLeft: 12 + folder.depth * 14 }}
                          onClick={() => setSelectedFolderId(folder.id)}
                        >
                          <span className="mewmo-card-menu__icon">
                            <PrototypeIcon name="folder" size={16} dual />
                          </span>
                          <span>{folder.name}</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="mewmo-move-knowledge__actions">
              <button
                type="button"
                className="mewmo-button mewmo-button--ghost"
                onClick={closeModal}
                disabled={submitting}
              >
                取消
              </button>
              <button
                type="button"
                className="mewmo-button"
                onClick={() => void move()}
                disabled={!canSubmit}
              >
                {submitting ? "移动中..." : "移动"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function flattenFolders(folders: KnowledgeFolderNode[]): KnowledgeFolderNode[] {
  return folders.flatMap((folder) => [
    folder,
    ...flattenFolders(folder.children),
  ]);
}
