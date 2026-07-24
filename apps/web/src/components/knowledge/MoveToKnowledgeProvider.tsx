"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  buildKnowledgeFolderTree,
  type KnowledgeFolderNode,
} from "../../lib/knowledge-tree";
import { invalidateWorkspaceResourcePrefix } from "../../lib/workspace-data-cache";
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

interface MoveToKnowledgeContextValue {
  openMoveDialog: (target: MoveToKnowledgeTarget) => void;
}

const MoveToKnowledgeContext =
  createContext<MoveToKnowledgeContextValue | null>(null);

export function useMoveToKnowledge(): MoveToKnowledgeContextValue {
  const value = useContext(MoveToKnowledgeContext);
  if (!value) {
    throw new Error(
      "useMoveToKnowledge must be used inside MoveToKnowledgeProvider",
    );
  }
  return value;
}

export function MoveToKnowledgeProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast();
  const [target, setTarget] = useState<MoveToKnowledgeTarget | null>(null);
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
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("新建文件夹");
  const [creatingFolderBusy, setCreatingFolderBusy] = useState(false);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const open = target !== null;

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), MODAL_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  const closeDialog = useCallback(() => {
    if (submitting) return;
    setTarget(null);
  }, [submitting]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDialog();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open, closeDialog]);

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

  const openMoveDialog = useCallback((next: MoveToKnowledgeTarget) => {
    setSelectedFolderId(null);
    setSubmitting(false);
    setTarget(next);
  }, []);

  const move = async () => {
    if (!target || !selectedBaseId || submitting) return;
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
      setTarget(null);
    } catch {
      showToast("移动失败，请稍后再试。", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const submitNewFolder = useCallback(async () => {
    if (!selectedBaseId || !newFolderName.trim() || creatingFolderBusy) return;
    setCreatingFolderBusy(true);
    try {
      const response = await fetch(`/api/knowledge-bases/${selectedBaseId}/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      if (!response.ok) throw new Error("create folder");
      const folder = (await response.json()) as { id?: string };
      invalidateWorkspaceResourcePrefix(`knowledge:contents:${selectedBaseId}:`);
      await loadFolders(selectedBaseId, true);
      if (folder.id) setSelectedFolderId(folder.id);
      setCreatingFolder(false);
      setNewFolderName("新建文件夹");
    } catch {
      showToast("新建文件夹失败，请稍后再试。", "error");
    } finally {
      setCreatingFolderBusy(false);
    }
  }, [selectedBaseId, newFolderName, creatingFolderBusy, loadFolders, showToast]);

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
    selectedFolderId !== null &&
    !submitting;

  return (
    <MoveToKnowledgeContext.Provider value={{ openMoveDialog }}>
      {children}
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
            onClick={closeDialog}
          />
          <section className="mewmo-move-knowledge__panel">
            <div className="mewmo-move-knowledge__head">
              <h2 id="mewmo-move-knowledge-title">移动到知识库</h2>
              <button
                type="button"
                className="mewmo-move-knowledge__close"
                aria-label="关闭"
                onClick={closeDialog}
              >
                <PrototypeIcon name="close" size={19} className="mewmo-icon-close" />
              </button>
            </div>

            <p className="mewmo-move-knowledge__source">
              将「{target?.title || "未命名内容"}」加入目标知识库
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
                      {creatingFolder ? (
                        <input
                          ref={newFolderInputRef}
                          className="mewmo-move-knowledge__new-folder-input"
                          value={newFolderName}
                          autoFocus
                          onFocus={(event) => event.currentTarget.select()}
                          onChange={(event) => setNewFolderName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void submitNewFolder();
                            } else if (event.key === "Escape") {
                              event.preventDefault();
                              setCreatingFolder(false);
                              setNewFolderName("新建文件夹");
                            }
                          }}
                          disabled={creatingFolderBusy}
                          placeholder="文件夹名称"
                        />
                      ) : (
                        <button
                          type="button"
                          className="mewmo-move-knowledge__row mewmo-move-knowledge__new-folder"
                          onClick={() => {
                            setNewFolderName("新建文件夹");
                            setCreatingFolder(true);
                          }}
                        >
                          <span className="mewmo-card-menu__icon">
                            <PrototypeIcon name="plus" size={16} dual />
                          </span>
                          <span>新建文件夹</span>
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="mewmo-move-knowledge__actions">
              <button
                type="button"
                className="mewmo-button mewmo-button--ghost"
                onClick={closeDialog}
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
    </MoveToKnowledgeContext.Provider>
  );
}

function flattenFolders(folders: KnowledgeFolderNode[]): KnowledgeFolderNode[] {
  return folders.flatMap((folder) => [
    folder,
    ...flattenFolders(folder.children),
  ]);
}
