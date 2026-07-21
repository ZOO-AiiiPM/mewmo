"use client";

import {
  cloneElement,
  isValidElement,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
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

function FloatingSubmenu({
  label,
  icon,
  children,
  onOpen,
}: {
  label: string;
  icon: "library";
  children: ReactNode;
  onOpen?: () => void;
}) {
  const itemRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState({ left: false, up: false });

  const openSubmenu = useCallback(() => {
    const item = itemRef.current;
    const submenu = submenuRef.current;
    if (!item || !submenu || typeof window === "undefined") return;

    const itemRect = item.getBoundingClientRect();
    const submenuRect = submenu.getBoundingClientRect();
    const submenuWidth = submenuRect.width || submenu.offsetWidth;
    const submenuHeight = submenuRect.height || submenu.offsetHeight;
    const gutter = 8;
    const left = itemRect.right + 4 + submenuWidth + gutter > window.innerWidth;
    const up = itemRect.top - 6 + submenuHeight + gutter > window.innerHeight;

    setPlacement((current) =>
      current.left === left && current.up === up ? current : { left, up },
    );
    onOpen?.();
  }, [onOpen]);

  const submenu = isValidElement(children)
    ? cloneElement(children, { ref: submenuRef } as {
        ref: Ref<HTMLDivElement>;
      })
    : children;

  return (
    <div
      ref={itemRef}
      className={`mewmo-floating-menu__item acct-menu__item acct-menu__has-sub ${placement.left ? "acct-menu__has-sub--left" : ""} ${placement.up ? "acct-menu__has-sub--up" : ""}`}
      role="menuitem"
      tabIndex={0}
      aria-haspopup="menu"
      onMouseEnter={openSubmenu}
      onFocus={openSubmenu}
      onClick={(event) => {
        if ((event.target as Element).closest(".acct-submenu")) return;
        itemRef.current?.focus();
        openSubmenu();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || event.key !== "ArrowRight")
          return;
        event.preventDefault();
        openSubmenu();
        submenuRef.current
          ?.querySelector<HTMLElement>(
            "button:not(:disabled), [role='menuitem'][tabindex='0']",
          )
          ?.focus();
      }}
    >
      <span className="mewmo-floating-menu__icon">
        <PrototypeIcon name={icon} size={16} />
      </span>
      <span>{label}</span>
      <PrototypeIcon name="caret" size={12} className="acct-chev" />
      {submenu}
    </div>
  );
}

export function MoveToKnowledgeMenuItem({
  target,
}: {
  target: MoveToKnowledgeTarget;
}) {
  const { showToast } = useToast();
  const closeMenu = useFloatingMenuClose();
  const [bases, setBases] = useState<KnowledgeBaseOption[]>([]);
  const [basesState, setBasesState] = useState<LoadState>("idle");
  const [foldersByBase, setFoldersByBase] = useState<
    Record<string, KnowledgeFolderNode[]>
  >({});
  const [folderStates, setFolderStates] = useState<Record<string, LoadState>>(
    {},
  );
  const [submittingTarget, setSubmittingTarget] = useState("");

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

  return (
    <FloatingSubmenu
      label="移动到知识库"
      icon="library"
      onOpen={() => void loadBases()}
    >
      <div
        className="acct-submenu mewmo-knowledge-cascade"
        role="menu"
        aria-label="知识库"
      >
        <p className="mewmo-knowledge-cascade__label">知识库</p>
        {basesState === "loading" && <MenuStatus text="正在加载..." />}
        {basesState === "error" && <MenuStatus text="加载失败，再次展开重试" />}
        {basesState === "ready" && bases.length === 0 && (
          <MenuStatus text="暂无知识库" />
        )}
        {bases.map((base) => (
          <KnowledgeBaseMenu
            key={base.id}
            base={base}
            folders={foldersByBase[base.id] ?? []}
            state={folderStates[base.id] ?? "idle"}
            submittingTarget={submittingTarget}
            onOpen={() => void loadFolders(base.id)}
            onMove={(folderId) => void move(base.id, folderId)}
          />
        ))}
      </div>
    </FloatingSubmenu>
  );
}

function KnowledgeBaseMenu({
  base,
  folders,
  state,
  submittingTarget,
  onOpen,
  onMove,
}: {
  base: KnowledgeBaseOption;
  folders: KnowledgeFolderNode[];
  state: LoadState;
  submittingTarget: string;
  onOpen: () => void;
  onMove: (folderId: string | null) => void;
}) {
  const flatFolders = useMemo(() => flattenFolders(folders), [folders]);

  return (
    <FloatingSubmenu label={base.title} icon="library" onOpen={onOpen}>
      <div
        className="acct-submenu mewmo-knowledge-cascade mewmo-knowledge-cascade--destinations"
        role="menu"
        aria-label="文件夹"
      >
        <p className="mewmo-knowledge-cascade__label">文件夹</p>
        <DestinationRow
          label="知识库根级"
          depth={0}
          busy={submittingTarget === `${base.id}:root`}
          disabled={Boolean(submittingTarget)}
          onClick={() => onMove(null)}
        />
        {state === "loading" && <MenuStatus text="正在加载..." />}
        {state === "error" && <MenuStatus text="加载失败，再次展开重试" />}
        {state === "ready" && flatFolders.length === 0 && (
          <MenuStatus text="暂无其他文件夹" />
        )}
        {flatFolders.map((folder) => (
          <DestinationRow
            key={folder.id}
            label={folder.name}
            depth={folder.depth + 1}
            busy={submittingTarget === `${base.id}:${folder.id}`}
            disabled={Boolean(submittingTarget)}
            onClick={() => onMove(folder.id)}
          />
        ))}
      </div>
    </FloatingSubmenu>
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
      className="mewmo-knowledge-cascade__row"
      style={{ paddingLeft: 10 + depth * 12 }}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="mewmo-floating-menu__icon">
        <PrototypeIcon name="folder" size={16} dual />
      </span>
      <span>{busy ? "移动中..." : label}</span>
    </button>
  );
}

function MenuStatus({ text }: { text: string }) {
  return <p className="mewmo-knowledge-cascade__status">{text}</p>;
}

function flattenFolders(folders: KnowledgeFolderNode[]): KnowledgeFolderNode[] {
  return folders.flatMap((folder) => [
    folder,
    ...flattenFolders(folder.children),
  ]);
}
