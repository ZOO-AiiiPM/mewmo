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

type View =
  | { kind: "bases" }
  | { kind: "folders"; baseId: string; baseTitle: string };

function reflowPopover() {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    window.dispatchEvent(new Event("resize"));
  });
}

export function MoveToKnowledgeMenuItem({
  target,
}: {
  target: MoveToKnowledgeTarget;
}) {
  const { showToast } = useToast();
  const closeMenu = useFloatingMenuClose();
  const [expanded, setExpanded] = useState(false);
  const [view, setView] = useState<View>({ kind: "bases" });
  const [bases, setBases] = useState<KnowledgeBaseOption[]>([]);
  const [basesState, setBasesState] = useState<LoadState>("idle");
  const [foldersByBase, setFoldersByBase] = useState<
    Record<string, KnowledgeFolderNode[]>
  >({});
  const [folderStates, setFolderStates] = useState<Record<string, LoadState>>(
    {},
  );
  const [submittingTarget, setSubmittingTarget] = useState("");

  useEffect(() => {
    if (expanded) reflowPopover();
  }, [expanded, view, basesState, folderStates]);

  const loadBases = useCallback(async () => {
    if (basesState === "loading" || basesState === "ready") return;
    setBasesState("loading");
    try {
      const response = await fetch("/api/knowledge-bases");
      if (!response.ok) throw new Error("load");
      const data = (await response.json()) as KnowledgeBaseOption[];
      setBases(Array.isArray(data) ? data : []);
      setBasesState("ready");
    } catch {
      setBasesState("error");
      showToast("知识库加载失败，请稍后再试。", "error");
    }
  }, [basesState, showToast]);

  const loadFolders = useCallback(
    async (baseId: string) => {
      const state = folderStates[baseId] ?? "idle";
      if (state === "loading" || state === "ready") return;
      setFolderStates((current) => ({ ...current, [baseId]: "loading" }));
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
    [folderStates, showToast],
  );

  const openCard = () => {
    setExpanded(true);
    setView({ kind: "bases" });
    void loadBases();
  };

  const collapseCard = () => {
    setExpanded(false);
    setView({ kind: "bases" });
  };

  const openFolders = (base: KnowledgeBaseOption) => {
    setView({ kind: "folders", baseId: base.id, baseTitle: base.title });
    void loadFolders(base.id);
  };

  const move = async (baseId: string, folderId: string | null) => {
    const destination = `${baseId}:${folderId ?? "root"}`;
    if (submittingTarget) return;
    setSubmittingTarget(destination);
    showToast("正在移动...", "loading");

    const item =
      target.kind === "note"
        ? { kind: target.kind, noteId: target.noteId }
        : target.kind === "clip"
          ? { kind: target.kind, clipId: target.clipId }
          : { kind: target.kind, feedEntryId: target.feedEntryId };

    try {
      const response = await fetch(
        `/api/knowledge-bases/${baseId}/items/import`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId, items: [item] }),
        },
      );
      if (response.status === 409) {
        showToast("这条内容已经在目标文件夹中。", "error");
        return;
      }
      if (!response.ok) throw new Error("move");
      invalidateWorkspaceResourcePrefix(`knowledge:contents:${baseId}:`);
      showToast("已移动到知识库", "success");
      closeMenu?.();
    } catch {
      showToast("移动失败，请稍后再试。", "error");
    } finally {
      setSubmittingTarget("");
    }
  };

  if (!expanded) {
    return (
      <button
        type="button"
        className="mewmo-card-menu__item"
        aria-haspopup="dialog"
        aria-expanded={false}
        onClick={openCard}
      >
        <span className="mewmo-card-menu__icon">
          <PrototypeIcon name="library" size={16} dual />
        </span>
        <span>移动到知识库</span>
      </button>
    );
  }

  const folderState =
    view.kind === "folders" ? (folderStates[view.baseId] ?? "idle") : "idle";
  const flatFolders =
    view.kind === "folders"
      ? flattenFolders(foldersByBase[view.baseId] ?? [])
      : [];

  return (
    <div
      className="mewmo-move-knowledge-card"
      role="dialog"
      aria-label="移动到知识库"
    >
      <div className="mewmo-move-knowledge-card__head">
        {view.kind === "folders" ? (
          <button
            type="button"
            className="mewmo-move-knowledge-card__nav"
            onClick={() => setView({ kind: "bases" })}
            aria-label="返回知识库列表"
          >
            <PrototypeIcon name="chev-left" size={16} />
          </button>
        ) : (
          <button
            type="button"
            className="mewmo-move-knowledge-card__nav"
            onClick={collapseCard}
            aria-label="收起"
          >
            <PrototypeIcon name="chev-left" size={16} />
          </button>
        )}
        <p className="mewmo-move-knowledge-card__title">
          {view.kind === "folders" ? view.baseTitle : "移动到知识库"}
        </p>
      </div>

      <div className="mewmo-move-knowledge-card__body">
        {view.kind === "bases" ? (
          <>
            <p className="mewmo-move-knowledge-card__label">选择知识库</p>
            {basesState === "loading" && <MenuStatus text="正在加载..." />}
            {basesState === "error" && (
              <button
                type="button"
                className="mewmo-move-knowledge-card__row"
                onClick={() => {
                  setBasesState("idle");
                  void loadBases();
                }}
              >
                <span>加载失败，点击重试</span>
              </button>
            )}
            {basesState === "ready" && bases.length === 0 && (
              <MenuStatus text="暂无知识库，请先创建一个" />
            )}
            {bases.map((base) => (
              <button
                key={base.id}
                type="button"
                className="mewmo-move-knowledge-card__row"
                onClick={() => openFolders(base)}
              >
                <span className="mewmo-card-menu__icon">
                  <PrototypeIcon name="library" size={16} dual />
                </span>
                <span>{base.title}</span>
                <PrototypeIcon
                  name="caret"
                  size={12}
                  className="mewmo-move-knowledge-card__chev"
                />
              </button>
            ))}
          </>
        ) : (
          <>
            <p className="mewmo-move-knowledge-card__label">选择文件夹</p>
            <button
              type="button"
              className="mewmo-move-knowledge-card__row"
              disabled={Boolean(submittingTarget)}
              onClick={() => void move(view.baseId, null)}
            >
              <span className="mewmo-card-menu__icon">
                <PrototypeIcon name="library" size={16} dual />
              </span>
              <span>
                {submittingTarget === `${view.baseId}:root`
                  ? "移动中..."
                  : "知识库根级"}
              </span>
            </button>
            {folderState === "loading" && <MenuStatus text="正在加载..." />}
            {folderState === "error" && (
              <button
                type="button"
                className="mewmo-move-knowledge-card__row"
                onClick={() => {
                  setFolderStates((current) => ({
                    ...current,
                    [view.baseId]: "idle",
                  }));
                  void loadFolders(view.baseId);
                }}
              >
                <span>加载失败，点击重试</span>
              </button>
            )}
            {folderState === "ready" && flatFolders.length === 0 && (
              <MenuStatus text="暂无其他文件夹" />
            )}
            {flatFolders.map((folder) => (
              <DestinationRow
                key={folder.id}
                label={folder.name}
                depth={folder.depth}
                busy={submittingTarget === `${view.baseId}:${folder.id}`}
                disabled={Boolean(submittingTarget)}
                onClick={() => void move(view.baseId, folder.id)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function DestinationRow({
  label,
  depth,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  depth: number;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="mewmo-move-knowledge-card__row"
      style={{ paddingLeft: 10 + depth * 12 }}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="mewmo-card-menu__icon">
        <PrototypeIcon name="folder" size={16} dual />
      </span>
      <span>{busy ? "移动中..." : label}</span>
    </button>
  );
}

function MenuStatus({ text }: { text: string }) {
  return <p className="mewmo-move-knowledge-card__status">{text}</p>;
}

function flattenFolders(folders: KnowledgeFolderNode[]): KnowledgeFolderNode[] {
  return folders.flatMap((folder) => [
    folder,
    ...flattenFolders(folder.children),
  ]);
}
