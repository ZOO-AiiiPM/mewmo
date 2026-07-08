"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { FloatingMenu, FloatingMenuButton } from "../ui/FloatingMenu";
import { useToast } from "../ui/ToastProvider";
import {
  buildKnowledgeFolderTree,
  canCreateKnowledgeSubfolder,
  knowledgeFolderPadding,
  type KnowledgeFolderNode,
} from "../../lib/knowledge-tree";
import { useTheme } from "../../lib/theme";
import {
  getRememberedFeedTypeHref,
  getRememberedKnowledgeBaseHref,
  useRememberedWorkspaceHref,
  type WorkspaceSection,
} from "../../lib/workspace-memory";
import { PrototypeIcon, type PrototypeIconName } from "./PrototypeIcon";

interface SidebarUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface SidebarProps {
  user?: SidebarUser | undefined;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onMouseEnter?: (() => void) | undefined;
  onMouseLeave?: (() => void) | undefined;
}

type NavEntry =
  | { kind: "link"; href: string; label: string; icon: PrototypeIconName; badge?: string }
  | { kind: "deferred"; label: string; icon: PrototypeIconName; badge?: string };

const deferredMessage = "这个区域暂未开放。";

const collectionEntries: NavEntry[] = [
  { kind: "link", href: "/notes", label: "笔记", icon: "note" },
  { kind: "link", href: "/clips", label: "剪藏", icon: "bookmark" },
  { kind: "deferred", label: "PDF", icon: "pdf", badge: "待开发" },
  { kind: "deferred", label: "电子书", icon: "shelf", badge: "待开发" },
];

type FeedType = "article" | "media" | "video" | "podcast";

const feedTypes: Array<{ type: FeedType; label: string; icon: PrototypeIconName; deferred?: boolean }> = [
  { type: "article", label: "文章", icon: "doc" },
  { type: "media", label: "媒体", icon: "media" },
  { type: "video", label: "视频", icon: "video", deferred: true },
  { type: "podcast", label: "播客", icon: "mic", deferred: true },
];
const FEED_ICON_PRELOAD_TIMEOUT_MS = 450;
const preloadedFeedIcons = new Set<string>();

interface SidebarFeed {
  id: string;
  title: string;
  url: string;
  favicon: string | null;
  type: FeedType;
  unreadCount?: number;
  lastFetchedAt?: string | null;
}

interface SidebarKnowledgeBase {
  id: string;
  title: string;
  icon?: string | null;
}

interface SidebarKnowledgeFolder {
  id: string;
  name: string;
  parentId?: string | null;
  depth: number;
  position?: number | null;
}

interface SidebarKnowledgeTree extends SidebarKnowledgeBase {
  folders?: SidebarKnowledgeFolder[];
}

type KnowledgeMenuState =
  | { type: "entry"; id: string }
  | { type: "root"; id: string }
  | { type: "folder"; id: string; depth: number };

type DeleteConfirmState =
  | { type: "knowledge-base"; item: SidebarKnowledgeBase }
  | { type: "knowledge-folder"; item: KnowledgeFolderNode }
  | { type: "feed"; item: SidebarFeed };

type TextPromptState =
  | { type: "create-knowledge-base"; title: string; initialValue: string }
  | { type: "rename-knowledge-base"; title: string; initialValue: string; item: SidebarKnowledgeBase }
  | { type: "rename-feed"; title: string; initialValue: string; item: SidebarFeed };

type EditingKnowledgeFolderState =
  | { type: "create"; base: SidebarKnowledgeBase; parent: KnowledgeFolderNode | null; value: string }
  | { type: "rename"; base: SidebarKnowledgeBase; folder: KnowledgeFolderNode; value: string };

const tagEntries = [
  { label: "读书", color: "#4f93e8" },
  { label: "设计", color: "#e88478" },
  { label: "产品", color: "#4caf72" },
  { label: "数据层", color: "#a874e0" },
  { label: "AI", color: "#e0a93a" },
];

const accentSwatches = [
  { label: "单色", value: "", mono: true },
  { label: "靛蓝", value: "#3b6cff" },
  { label: "翠绿", value: "#05c270" },
  { label: "朱砂", value: "#ff4d3d" },
  { label: "琥珀", value: "#ffb01f" },
  { label: "紫", value: "#8b5cf6" },
  { label: "品红", value: "#f5408a" },
];

export function Sidebar({ user, collapsed = false, onToggleCollapsed, onMouseEnter, onMouseLeave }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { theme, setTheme, accent, setAccent } = useTheme();
  const { readerFont, setReaderFont, readerFontSize, setReaderFontSize } = useTheme();
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [feedDrawer, setFeedDrawer] = useState<FeedType | null>(null);
  const [feeds, setFeeds] = useState<SidebarFeed[]>([]);
  const [feedMenuId, setFeedMenuId] = useState<string | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState<SidebarKnowledgeBase[]>([]);
  const [knowledgeDrawer, setKnowledgeDrawer] = useState<SidebarKnowledgeBase | null>(null);
  const [knowledgeFolders, setKnowledgeFolders] = useState<KnowledgeFolderNode[]>([]);
  const [knowledgeMenu, setKnowledgeMenu] = useState<KnowledgeMenuState | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);
  const [textPrompt, setTextPrompt] = useState<TextPromptState | null>(null);
  const [textPromptValue, setTextPromptValue] = useState("");
  const [editingKnowledgeFolder, setEditingKnowledgeFolder] = useState<EditingKnowledgeFolderState | null>(null);
  const editingKnowledgeFolderBusyRef = useRef(false);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const feedMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const knowledgeMenuAnchorRef = useRef<HTMLButtonElement | null>(null);

  const initial = user?.name?.charAt(0)?.toUpperCase() ?? user?.email?.charAt(0)?.toUpperCase() ?? "U";
  const displayName = user?.name ?? user?.email?.split("@")[0] ?? "User";
  const displayEmail = user?.email ?? "user@mewmo.app";

  const toggleGroup = (id: string) => {
    setCollapsedGroups((value) => ({ ...value, [id]: !value[id] }));
  };

  const toggleAllGroups = () => {
    const next = !allCollapsed;
    setAllCollapsed(next);
    setCollapsedGroups({ collection: next, subscription: next, knowledge: next, tags: next });
  };

  const defer = () => showToast(deferredMessage, "error");
  const activeFeedType = (searchParams.get("type") as FeedType | null) ?? "article";
  const activeFeedId = searchParams.get("feedId");
  const effectiveActiveFeedId = activeFeedId ?? feeds[0]?.id ?? null;
  const feedDrawerMeta = feedTypes.find((item) => item.type === feedDrawer);
  const activeKnowledgeBaseId = searchParams.get("kbId");
  const activeKnowledgeFolderId = searchParams.get("folderId");
  const stageDrilled = Boolean(feedDrawer || knowledgeDrawer);
  const stageModeClass = feedDrawer
    ? "mewmo-sidebar__stage--feed"
    : knowledgeDrawer
      ? "mewmo-sidebar__stage--knowledge"
      : "";
  const rememberedWorkspaceHrefs: Record<WorkspaceSection, string> = {
    today: useRememberedWorkspaceHref("today", "/today"),
    notes: useRememberedWorkspaceHref("notes", "/notes"),
    clips: useRememberedWorkspaceHref("clips", "/clips"),
    feeds: useRememberedWorkspaceHref("feeds", "/feeds"),
    "knowledge-bases": useRememberedWorkspaceHref("knowledge-bases", "/knowledge-bases"),
  };

  useEffect(() => {
    if (pathname.startsWith("/feeds")) {
      setFeedDrawer(feedTypes.some((item) => item.type === activeFeedType) ? activeFeedType : "article");
      setKnowledgeDrawer(null);
      return;
    }
    setFeedDrawer(null);
  }, [activeFeedType, pathname]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/knowledge-bases")
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => {
        if (!cancelled) setKnowledgeBases(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setKnowledgeBases([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pathname.startsWith("/knowledge-bases")) {
      setKnowledgeDrawer(null);
      setKnowledgeMenu(null);
      return;
    }

    if (!activeKnowledgeBaseId) return;
    const base = knowledgeBases.find((item) => item.id === activeKnowledgeBaseId);
    if (!base) return;
    void openKnowledgeBase(base, { navigate: false });
  }, [activeKnowledgeBaseId, knowledgeBases, pathname]);

  useEffect(() => {
    if (!feedDrawer || feedTypes.find((item) => item.type === feedDrawer)?.deferred) return;

    let cancelled = false;
    fetch(`/api/feeds?type=${feedDrawer}`)
      .then((response) => (response.ok ? response.json() : []))
      .then(async (data) => {
        const nextFeeds = Array.isArray(data) ? data : [];
        await preloadFeedIcons(nextFeeds);
        if (!cancelled) setFeeds(nextFeeds);
      })
      .catch(() => {
        if (!cancelled) setFeeds([]);
      });

    return () => {
      cancelled = true;
    };
  }, [feedDrawer]);

  const openFeedType = (type: FeedType) => {
    const meta = feedTypes.find((item) => item.type === type);
    setKnowledgeDrawer(null);
    if (meta?.deferred) {
      setFeedDrawer(type);
      router.push(getRememberedFeedTypeHref(type, `/feeds?type=${type}`), { scroll: false });
      showToast(`${meta.label}订阅还在路上`, "error");
      return;
    }
    setFeedDrawer(type);
    router.push(getRememberedFeedTypeHref(type, `/feeds?type=${type}`), { scroll: false });
  };

  const openAddFeed = () => {
    if (!feedDrawer) {
      router.push("/feeds?add=1");
      setOpenMenu(null);
      return;
    }
    router.push(`/feeds?type=${feedDrawer}&add=1`);
    setOpenMenu(null);
  };

  const reloadKnowledgeBases = async () => {
    const response = await fetch("/api/knowledge-bases");
    if (!response.ok) return;
    const data = await response.json();
    setKnowledgeBases(Array.isArray(data) ? data : []);
  };

  const loadKnowledgeTree = async (base: SidebarKnowledgeBase) => {
    const response = await fetch(`/api/knowledge-bases/${base.id}`);
    if (!response.ok) {
      setKnowledgeFolders([]);
      return;
    }
    const data = (await response.json()) as SidebarKnowledgeTree;
    setKnowledgeFolders(buildKnowledgeFolderTree(data.folders ?? []));
  };

  const openKnowledgeBase = async (
    base: SidebarKnowledgeBase,
    options: { navigate?: boolean } = {},
  ) => {
    setFeedDrawer(null);
    setKnowledgeDrawer(base);
    setKnowledgeMenu(null);
    await loadKnowledgeTree(base);
    if (options.navigate !== false) {
      router.push(getRememberedKnowledgeBaseHref(base.id, `/knowledge-bases?kbId=${base.id}`), {
        scroll: false,
      });
    }
  };

  const openTextPrompt = (prompt: TextPromptState) => {
    setTextPrompt(prompt);
    setTextPromptValue(prompt.initialValue);
    setOpenMenu(null);
    setKnowledgeMenu(null);
    setFeedMenuId(null);
    setAccountOpen(false);
  };

  const closeTextPrompt = () => {
    setTextPrompt(null);
    setTextPromptValue("");
  };

  const createKnowledgeBaseNow = async (title: string) => {
    const response = await fetch("/api/knowledge-bases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, icon: "book" }),
    });
    if (response.ok) {
      const base = (await response.json()) as SidebarKnowledgeBase;
      setKnowledgeBases((current) => [...current, base]);
      await openKnowledgeBase(base);
      showToast("已新建知识库", "success");
    }
  };

  const createKnowledgeBase = async () => {
    openTextPrompt({
      type: "create-knowledge-base",
      title: "新建知识库",
      initialValue: "未命名知识库",
    });
  };

  const startEditingKnowledgeFolder = (state: EditingKnowledgeFolderState) => {
    setEditingKnowledgeFolder(state);
    setKnowledgeMenu(null);
  };

  const createKnowledgeFolder = async (parent?: KnowledgeFolderNode | null) => {
    if (!knowledgeDrawer) return;
    startEditingKnowledgeFolder({
      type: "create",
      base: knowledgeDrawer,
      parent: parent ?? null,
      value: "",
    });
  };

  const createKnowledgeFolderNow = async (
    base: SidebarKnowledgeBase,
    parent: KnowledgeFolderNode | null,
    name: string,
  ) => {
    const response = await fetch(`/api/knowledge-bases/${base.id}/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId: parent?.id ?? null }),
    });
    if (response.ok) {
      await loadKnowledgeTree(base);
      showToast("已新建文件夹", "success");
    } else {
      showToast("无法再创建更深层级", "error");
    }
  };

  const renameKnowledgeBase = async (base: SidebarKnowledgeBase) => {
    openTextPrompt({
      type: "rename-knowledge-base",
      title: "重命名知识库",
      initialValue: base.title,
      item: base,
    });
  };

  const renameKnowledgeBaseNow = async (base: SidebarKnowledgeBase, title: string) => {
    if (!title || title === base.title) return;
    const response = await fetch(`/api/knowledge-bases/${base.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (response.ok) {
      setKnowledgeBases((current) => current.map((item) => (item.id === base.id ? { ...item, title } : item)));
      setKnowledgeDrawer((current) => (current?.id === base.id ? { ...current, title } : current));
      showToast("已重命名知识库", "success");
    }
  };

  const deleteKnowledgeBaseNow = async (base: SidebarKnowledgeBase) => {
    const response = await fetch(`/api/knowledge-bases/${base.id}`, { method: "DELETE" });
    if (response.ok) {
      setKnowledgeBases((current) => current.filter((item) => item.id !== base.id));
      if (knowledgeDrawer?.id === base.id) setKnowledgeDrawer(null);
      router.push("/notes");
      showToast("已删除知识库", "success");
    }
    setKnowledgeMenu(null);
  };

  const deleteKnowledgeBase = (base: SidebarKnowledgeBase) => {
    setDeleteConfirm({ type: "knowledge-base", item: base });
    setKnowledgeMenu(null);
  };

  const openKnowledgeImport = (folderId?: string | null) => {
    if (!knowledgeDrawer) return;
    const params = new URLSearchParams({ kbId: knowledgeDrawer.id, import: "1" });
    if (folderId) params.set("folderId", folderId);
    router.push(`/knowledge-bases?${params.toString()}`);
    setKnowledgeMenu(null);
  };

  const openKnowledgeLocalImport = (kind: "file" | "folder", folderId?: string | null) => {
    if (!knowledgeDrawer) return;
    const params = new URLSearchParams({ kbId: knowledgeDrawer.id, localImport: kind });
    if (folderId) params.set("folderId", folderId);
    router.push(`/knowledge-bases?${params.toString()}`);
    setKnowledgeMenu(null);
  };

  const renameKnowledgeFolder = async (folder: KnowledgeFolderNode) => {
    if (!knowledgeDrawer) return;
    startEditingKnowledgeFolder({
      type: "rename",
      base: knowledgeDrawer,
      folder,
      value: folder.name,
    });
  };

  const renameKnowledgeFolderNow = async (
    base: SidebarKnowledgeBase,
    folder: KnowledgeFolderNode,
    name: string,
  ) => {
    if (!name || name === folder.name) return;
    const response = await fetch(`/api/knowledge-bases/${base.id}/folders/${folder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (response.ok) {
      await loadKnowledgeTree(base);
      showToast("已重命名文件夹", "success");
    }
  };

  const updateEditingKnowledgeFolderValue = (value: string) => {
    setEditingKnowledgeFolder((current) => (current ? { ...current, value } : current));
  };

  const cancelEditingKnowledgeFolder = () => {
    setEditingKnowledgeFolder(null);
  };

  const finishEditingKnowledgeFolder = async () => {
    const current = editingKnowledgeFolder;
    if (!current || editingKnowledgeFolderBusyRef.current) return;

    const value = current.value.trim();
    setEditingKnowledgeFolder(null);
    if (!value) return;

    editingKnowledgeFolderBusyRef.current = true;
    try {
      if (current.type === "create") {
        await createKnowledgeFolderNow(current.base, current.parent, value);
      } else {
        await renameKnowledgeFolderNow(current.base, current.folder, value);
      }
    } finally {
      editingKnowledgeFolderBusyRef.current = false;
    }
  };

  const deleteKnowledgeFolderNow = async (folder: KnowledgeFolderNode) => {
    if (!knowledgeDrawer) return;
    const response = await fetch(`/api/knowledge-bases/${knowledgeDrawer.id}/folders/${folder.id}`, {
      method: "DELETE",
    });
    if (response.ok) {
      await loadKnowledgeTree(knowledgeDrawer);
      showToast("已删除文件夹", "success");
    }
    setKnowledgeMenu(null);
  };

  const deleteKnowledgeFolder = (folder: KnowledgeFolderNode) => {
    setDeleteConfirm({ type: "knowledge-folder", item: folder });
    setKnowledgeMenu(null);
  };

  const exportKnowledgeFolder = () => {
    showToast("已准备导出到本地", "success");
    setKnowledgeMenu(null);
  };

  const refreshFeed = async (feed: SidebarFeed) => {
    showToast("检查该订阅更新...", "loading");
    setFeedMenuId(null);
    const response = await fetch(`/api/feeds/${feed.id}/refresh`, { method: "POST" }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { created?: number } | null;
    if (response?.ok && (data?.created ?? 0) > 0) {
      showToast(`已抓取 ${data?.created ?? 0} 篇新文章`, "success");
      window.dispatchEvent(new CustomEvent("mewmo:feed-refreshed", { detail: { feedId: feed.id, type: feed.type } }));
    } else if (response?.ok) {
      showToast("已检查该订阅，暂无新文章", "success");
      window.dispatchEvent(new CustomEvent("mewmo:feed-refreshed", { detail: { feedId: feed.id, type: feed.type } }));
    } else {
      showToast("检查订阅更新失败", "error");
    }
  };

  const renameFeed = async (feed: SidebarFeed) => {
    openTextPrompt({
      type: "rename-feed",
      title: "重命名订阅源",
      initialValue: feed.title,
      item: feed,
    });
  };

  const renameFeedNow = async (feed: SidebarFeed, nextTitle: string) => {
    if (!nextTitle || nextTitle === feed.title) return;
    const response = await fetch(`/api/feeds/${feed.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: nextTitle }),
    });
    if (response.ok) {
      setFeeds((current) => current.map((item) => (item.id === feed.id ? { ...item, title: nextTitle } : item)));
      showToast("已重命名订阅源", "success");
    }
  };

  const deleteFeedNow = async (feed: SidebarFeed) => {
    const response = await fetch(`/api/feeds/${feed.id}`, { method: "DELETE" });
    if (response.ok) {
      setFeeds((current) => current.filter((item) => item.id !== feed.id));
      showToast("已删除订阅源", "success");
    }
    setFeedMenuId(null);
  };

  const deleteFeed = (feed: SidebarFeed) => {
    setDeleteConfirm({ type: "feed", item: feed });
    setFeedMenuId(null);
  };

  const confirmTitle =
    deleteConfirm?.type === "knowledge-base"
      ? `删除知识库「${deleteConfirm.item.title}」？`
      : deleteConfirm?.type === "knowledge-folder"
        ? `删除文件夹「${deleteConfirm.item.name}」？`
        : deleteConfirm?.type === "feed"
          ? `删除订阅源「${deleteConfirm.item.title}」？`
          : "";

  const runDeleteConfirm = async () => {
    const current = deleteConfirm;
    if (!current) return;
    setDeleteConfirm(null);
    if (current.type === "knowledge-base") await deleteKnowledgeBaseNow(current.item);
    if (current.type === "knowledge-folder") await deleteKnowledgeFolderNow(current.item);
    if (current.type === "feed") await deleteFeedNow(current.item);
  };

  const runTextPromptConfirm = async () => {
    const current = textPrompt;
    const value = textPromptValue.trim();
    if (!current || !value) return;
    closeTextPrompt();
    if (current.type === "create-knowledge-base") await createKnowledgeBaseNow(value);
    if (current.type === "rename-knowledge-base") await renameKnowledgeBaseNow(current.item, value);
    if (current.type === "rename-feed") await renameFeedNow(current.item, value);
  };

  return (
    <>
    <aside className="mewmo-sidebar" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
      <div className="mewmo-sidebar__bar">
        <Link href="/notes" className="mewmo-sidebar__brand" aria-label="mewmo 首页">
          <span className="mewmo-sidebar__logo" aria-hidden="true">
            <PrototypeIcon name="mewmo-logo" size={22} className="mewmo-sidebar__logo-cat" />
          </span>
          <span>mewmo</span>
        </Link>
        <button type="button" className="mewmo-icon-button" onClick={toggleAllGroups} aria-label="展开或收起所有分组">
          <PrototypeIcon name={allCollapsed ? "groups-expand" : "groups-collapse"} size={18} />
        </button>
        <button type="button" className="mewmo-icon-button" onClick={onToggleCollapsed} aria-label="收起侧栏">
          <PrototypeIcon name={collapsed ? "sidebar-expand" : "sidebar-collapse"} size={18} />
        </button>
      </div>

      <div className={`mewmo-sidebar__stage ${stageDrilled ? "mewmo-sidebar__stage--drilled" : ""} ${stageModeClass}`}>
      <nav className="mewmo-sidebar__nav" aria-label="Workspace">
        <SidebarButton icon="home" label="首页" onClick={defer} />
        <SidebarLink
          href={rememberedWorkspaceHrefs.today}
          icon="calendar"
          label="今天"
          active={pathname.startsWith("/today")}
        />

        <SidebarGroup
          id="collection"
          title="收集箱"
          icon="inbox"
          collapsed={Boolean(collapsedGroups.collection)}
          onToggle={toggleGroup}
        >
          {collectionEntries.map((entry) =>
            renderEntry(entry, pathname, defer, rememberedWorkspaceHrefs),
          )}
        </SidebarGroup>

        <SidebarGroup
          id="subscription"
          title="订阅"
          icon="rss"
          collapsed={Boolean(collapsedGroups.subscription)}
          onToggle={toggleGroup}
          menuOpen={openMenu === "subscription"}
          onMenuToggle={() => setOpenMenu(openMenu === "subscription" ? null : "subscription")}
          menu={
            <FloatingMenuButton icon="plus" onClick={openAddFeed}>
              新增
            </FloatingMenuButton>
          }
        >
          {feedTypes.map((entry) => (
            <SidebarButton
              key={entry.type}
              icon={entry.icon}
              label={entry.label}
              badge={entry.deferred ? "待开发" : undefined}
              muted={Boolean(entry.deferred)}
              active={pathname.startsWith("/feeds") && activeFeedType === entry.type}
              onClick={() => openFeedType(entry.type)}
            />
          ))}
        </SidebarGroup>

        <SidebarGroup
          id="knowledge"
          title="知识库"
          icon="library"
          collapsed={Boolean(collapsedGroups.knowledge)}
          onToggle={toggleGroup}
          menuOpen={openMenu === "knowledge"}
          onMenuToggle={() => setOpenMenu(openMenu === "knowledge" ? null : "knowledge")}
          menu={
            <FloatingMenuButton icon="plus" onClick={() => void createKnowledgeBase()}>
              新建
            </FloatingMenuButton>
          }
        >
          {knowledgeBases.length === 0 ? (
            <>
              <SidebarButton icon="book" label="产品设计" onClick={() => void reloadKnowledgeBases()} muted />
              <SidebarButton icon="book" label="技术笔记" onClick={() => void reloadKnowledgeBases()} muted />
            </>
          ) : (
            knowledgeBases.map((base) => (
              <div key={base.id} className="mewmo-knowledge-base-row">
                <button
                  type="button"
                  className={`mewmo-nav-row mewmo-nav-row--sub ${activeKnowledgeBaseId === base.id ? "mewmo-nav-row--active" : ""}`}
                  onClick={() => void openKnowledgeBase(base)}
                >
                  <span className="mewmo-nav-row__icon">
                    <PrototypeIcon name={iconName(base.icon)} dual filled={activeKnowledgeBaseId === base.id} />
                  </span>
                  <span className="mewmo-nav-row__label">{base.title}</span>
                </button>
                <button
                  ref={(node) => {
                    if (knowledgeMenu?.type === "entry" && knowledgeMenu.id === base.id) {
                      knowledgeMenuAnchorRef.current = node;
                    }
                  }}
                  type="button"
                  className={`mewmo-row-action ${knowledgeMenu?.type === "entry" && knowledgeMenu.id === base.id ? "mewmo-row-action--open" : ""}`}
                  onClick={() => setKnowledgeMenu(knowledgeMenu?.type === "entry" && knowledgeMenu.id === base.id ? null : { type: "entry", id: base.id })}
                  aria-label={`${base.title} actions`}
                >
                  <PrototypeIcon name="more-horizontal" size={16} />
                </button>
                <FloatingMenu
                  open={knowledgeMenu?.type === "entry" && knowledgeMenu.id === base.id}
                  anchorRef={knowledgeMenuAnchorRef}
                  onOpenChange={(open) => setKnowledgeMenu(open ? { type: "entry", id: base.id } : null)}
                  className="mewmo-row-menu"
                >
                  <FloatingMenuButton icon="pen-new-square" onClick={() => void renameKnowledgeBase(base)}>
                    重命名
                  </FloatingMenuButton>
                  <FloatingMenuButton icon="trash" danger onClick={() => void deleteKnowledgeBase(base)}>
                    删除
                  </FloatingMenuButton>
                </FloatingMenu>
              </div>
            ))
          )}
        </SidebarGroup>

        <SidebarGroup
          id="tags"
          title="标签"
          icon="tag"
          collapsed={Boolean(collapsedGroups.tags)}
          onToggle={toggleGroup}
          menuOpen={openMenu === "tags"}
          onMenuToggle={() => setOpenMenu(openMenu === "tags" ? null : "tags")}
        >
          {tagEntries.map((tag) => (
            <SidebarButton key={tag.label} label={tag.label} onClick={defer}>
              <span className="mewmo-tag-dot" style={{ backgroundColor: tag.color }} />
            </SidebarButton>
          ))}
        </SidebarGroup>

        <SidebarLink
          href="/trash"
          icon="trash"
          label="废纸篓"
          active={pathname.startsWith("/trash")}
        />
      </nav>
      <div className="mewmo-feed-pane">
        {feedDrawerMeta && (
          <>
            <div className="mewmo-feed-pane__head">
              <button
                type="button"
                className="mewmo-nav-row mewmo-nav-row--group mewmo-feed-pane__back"
                onClick={() => {
                  setFeedMenuId(null);
                  setFeedDrawer(null);
                }}
                aria-label="返回主导航"
              >
                <span className="mewmo-nav-row__chevron"><PrototypeIcon name="caret" size={14} /></span>
                <span className="mewmo-nav-row__icon"><PrototypeIcon name={feedDrawerMeta.icon} dual /></span>
                <span className="mewmo-nav-row__label">{feedDrawerMeta.label}</span>
              </button>
            </div>
            {feedDrawerMeta.deferred ? (
              <div className="mewmo-feed-empty">
                <PrototypeIcon name={feedDrawerMeta.icon} size={38} />
                <span>{feedDrawerMeta.label}订阅还在路上</span>
              </div>
            ) : feeds.length === 0 ? (
              <div className="mewmo-feed-empty">
                <PrototypeIcon name="rss" size={38} />
                <span>还没有订阅源</span>
              </div>
            ) : (
              <div className="mewmo-feed-source-list">
                {feeds.map((feed) => (
                  <div key={feed.id} className="mewmo-feed-source-row">
                    <Link
                      href={`/feeds?type=${feed.type}&feedId=${feed.id}`}
                      scroll={false}
                      className={`mewmo-nav-row mewmo-nav-row--sub ${effectiveActiveFeedId === feed.id ? "mewmo-nav-row--active" : ""}`}
                    >
                      <span className="mewmo-favicon">
                        <FeedSiteIcon feed={feed} />
                      </span>
                      <span className="mewmo-nav-row__label">{feed.title}</span>
                    </Link>
                    <button
                      ref={(node) => {
                        if (feedMenuId === feed.id) feedMenuAnchorRef.current = node;
                      }}
                      type="button"
                      className={`mewmo-row-action ${feedMenuId === feed.id ? "mewmo-row-action--open" : ""}`}
                      onClick={() => setFeedMenuId(feedMenuId === feed.id ? null : feed.id)}
                      aria-label={`${feed.title} actions`}
                    >
                      <PrototypeIcon name="more-horizontal" size={16} />
                    </button>
                    <FloatingMenu
                      open={feedMenuId === feed.id}
                      anchorRef={feedMenuAnchorRef}
                      onOpenChange={(open) => setFeedMenuId(open ? feed.id : null)}
                      className="mewmo-row-menu mewmo-feed-source-menu"
                    >
                      <FloatingMenuButton icon="pen-new-square" onClick={() => void renameFeed(feed)}>
                        重命名
                      </FloatingMenuButton>
                      <FloatingMenuButton icon="sync" onClick={() => void refreshFeed(feed)}>
                        刷新
                      </FloatingMenuButton>
                      <FloatingMenuButton icon="trash" danger onClick={() => void deleteFeed(feed)}>
                        删除
                      </FloatingMenuButton>
                    </FloatingMenu>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <div className="mewmo-knowledge-pane">
        {knowledgeDrawer && (
          <>
            <div className="mewmo-knowledge-root-row">
              <button
                type="button"
                className="mewmo-nav-row mewmo-nav-row--group mewmo-knowledge-pane__back"
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest(".mewmo-knowledge-pane__chevron")) {
                    setKnowledgeDrawer(null);
                    setKnowledgeMenu(null);
                    return;
                  }
                  setKnowledgeDrawer(null);
                  setKnowledgeMenu(null);
                }}
              >
                <span className="mewmo-nav-row__chevron mewmo-knowledge-pane__chevron">
                  <PrototypeIcon name="caret" size={14} />
                </span>
                <span className="mewmo-nav-row__icon">
                  <PrototypeIcon name={iconName(knowledgeDrawer.icon)} dual />
                </span>
                <span className="mewmo-nav-row__label">{knowledgeDrawer.title}</span>
              </button>
              <button
                ref={(node) => {
                  if (knowledgeMenu?.type === "root") knowledgeMenuAnchorRef.current = node;
                }}
                type="button"
                className={`mewmo-row-action ${knowledgeMenu?.type === "root" ? "mewmo-row-action--open" : ""}`}
                onClick={() => {
                  setKnowledgeMenu(knowledgeMenu?.type === "root" ? null : { type: "root", id: knowledgeDrawer.id });
                }}
                aria-label={`${knowledgeDrawer.title} actions`}
              >
                <PrototypeIcon name="more-horizontal" size={16} />
              </button>
            </div>
            <FloatingMenu
              open={knowledgeMenu?.type === "root"}
              anchorRef={knowledgeMenuAnchorRef}
              onOpenChange={(open) => setKnowledgeMenu(open ? { type: "root", id: knowledgeDrawer.id } : null)}
              className="mewmo-row-menu"
            >
              <FloatingMenuButton icon="plus" onClick={() => void createKnowledgeFolder(null)}>
                新建文件夹
              </FloatingMenuButton>
              <FloatingMenuButton icon="folder" onClick={() => openKnowledgeLocalImport("folder")}>
                从本地文件夹导入
              </FloatingMenuButton>
              <FloatingMenuButton icon="export" onClick={exportKnowledgeFolder}>
                导出到本地
              </FloatingMenuButton>
            </FloatingMenu>
            <div className="mewmo-knowledge-tree">
              {knowledgeFolders.map((folder) => (
                <KnowledgeFolderRows
                  key={folder.id}
                  folder={folder}
                  activeFolderId={activeKnowledgeFolderId}
                  knowledgeMenu={knowledgeMenu}
                  editingKnowledgeFolder={editingKnowledgeFolder}
                  menuAnchorRef={knowledgeMenuAnchorRef}
                  onMenuChange={setKnowledgeMenu}
                  onEditingValueChange={updateEditingKnowledgeFolderValue}
                  onCommitEditing={() => void finishEditingKnowledgeFolder()}
                  onCancelEditing={cancelEditingKnowledgeFolder}
                  onSelect={(selected) => {
                    router.push(`/knowledge-bases?kbId=${knowledgeDrawer.id}&folderId=${selected.id}`, {
                      scroll: false,
                    });
                  }}
                  onCreateFolder={(selected) => void createKnowledgeFolder(selected)}
                  onImportInbox={(selected) => openKnowledgeImport(selected.id)}
                  onImportLocalFile={(selected) => openKnowledgeLocalImport("file", selected.id)}
                  onImportLocalFolder={(selected) => openKnowledgeLocalImport("folder", selected.id)}
                  onExport={exportKnowledgeFolder}
                  onRename={(selected) => void renameKnowledgeFolder(selected)}
                  onDelete={(selected) => void deleteKnowledgeFolder(selected)}
                />
              ))}
              {editingKnowledgeFolder?.type === "create" && editingKnowledgeFolder.parent === null && (
                <KnowledgeFolderNameInput
                  value={editingKnowledgeFolder.value}
                  depth={0}
                  placeholder="新建文件夹"
                  onValueChange={updateEditingKnowledgeFolderValue}
                  onCommit={() => void finishEditingKnowledgeFolder()}
                  onCancel={cancelEditingKnowledgeFolder}
                />
              )}
            </div>
          </>
        )}
      </div>
      </div>

      <div className="mewmo-sidebar__footer">
        <button ref={accountButtonRef} type="button" className="mewmo-account" onClick={() => setAccountOpen((value) => !value)}>
          {user?.image ? <img src={user.image} alt="" /> : <span>{initial}</span>}
          <span className="mewmo-account__copy">
            <strong>{displayName}</strong>
            <small>{displayEmail}</small>
          </span>
        </button>
        <FloatingMenu
          open={accountOpen}
          anchorRef={accountButtonRef}
          onOpenChange={setAccountOpen}
          className="mewmo-account-menu"
          placement="top"
        >
          <AccountSubmenu label="主题色" icon="palette">
            <div className="acct-submenu acct-submenu--color">
              <div className="acct-sub__swatches">
                {accentSwatches.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className={`sw ${item.mono ? "sw--mono" : ""} ${accent === item.value ? "on" : ""}`}
                    data-accent={item.value}
                    title={item.label}
                    style={
                      item.value
                        ? ({ "--c": item.value } as CSSProperties)
                        : undefined
                    }
                    onClick={() => setAccent(item.value)}
                  />
                ))}
              </div>
            </div>
          </AccountSubmenu>
          <AccountSubmenu label="外观模式" icon="appearance">
            <div className="acct-submenu">
              <AccountSubmenuRow icon="monitor" active={theme === "system"} onClick={() => setTheme("system")}>
                跟随系统
              </AccountSubmenuRow>
              <AccountSubmenuRow icon="moon" active={theme === "dark"} onClick={() => setTheme("dark")}>
                深色模式
              </AccountSubmenuRow>
              <AccountSubmenuRow icon="sun" active={theme === "light"} onClick={() => setTheme("light")}>
                浅色模式
              </AccountSubmenuRow>
            </div>
          </AccountSubmenu>
          <AccountSubmenu label="字体字号" icon="font-size">
            <div className="acct-submenu">
              <div className="acct-sub__label">字体</div>
              <AccountSubmenuRow
                data-font="sans"
                glyph="Aa"
                glyphStyle={{ fontFamily: "ui-sans-serif, system-ui, 'PingFang SC', sans-serif" }}
                active={readerFont === "sans"}
                onClick={() => setReaderFont("sans")}
              >
                无衬线
              </AccountSubmenuRow>
              <AccountSubmenuRow
                data-font="serif"
                glyph="Aa"
                glyphStyle={{ fontFamily: "'Songti SC', 'Noto Serif SC', Georgia, serif" }}
                active={readerFont === "serif"}
                onClick={() => setReaderFont("serif")}
              >
                衬线
              </AccountSubmenuRow>
              <AccountSubmenuRow
                data-font="mono"
                glyph="Aa"
                glyphStyle={{ fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace" }}
                active={readerFont === "mono"}
                onClick={() => setReaderFont("mono")}
              >
                等宽
              </AccountSubmenuRow>
              <div className="acct-sub__sep" />
              <div className="acct-sub__label">字号</div>
              <AccountSubmenuRow
                data-fontsize="small"
                glyph="A"
                glyphStyle={{ fontSize: 11 }}
                active={readerFontSize === "small"}
                onClick={() => setReaderFontSize("small")}
              >
                小
              </AccountSubmenuRow>
              <AccountSubmenuRow
                data-fontsize="default"
                glyph="A"
                glyphStyle={{ fontSize: 13.5 }}
                active={readerFontSize === "default"}
                onClick={() => setReaderFontSize("default")}
              >
                默认
              </AccountSubmenuRow>
              <AccountSubmenuRow
                data-fontsize="large"
                glyph="A"
                glyphStyle={{ fontSize: 16.5 }}
                active={readerFontSize === "large"}
                onClick={() => setReaderFontSize("large")}
              >
                大
              </AccountSubmenuRow>
            </div>
          </AccountSubmenu>
          <div className="mewmo-menu-separator" />
          <FloatingMenuButton icon="info" onClick={defer}>帮助和支持</FloatingMenuButton>
          <AccountSubmenu label="导入导出" icon="import-export">
            <div className="acct-submenu">
              <AccountSubmenuRow icon="import" onClick={defer}>导入</AccountSubmenuRow>
              <AccountSubmenuRow icon="export" onClick={defer}>导出</AccountSubmenuRow>
            </div>
          </AccountSubmenu>
          <div className="mewmo-menu-separator" />
          <FloatingMenuButton icon="logout" onClick={defer}>登出</FloatingMenuButton>
        </FloatingMenu>
      </div>
    </aside>
    <ConfirmDialog
      open={Boolean(deleteConfirm)}
      title={confirmTitle}
      description="删除后会从当前工作区移除。"
      confirmLabel="删除"
      cancelLabel="取消"
      onCancel={() => setDeleteConfirm(null)}
      onConfirm={() => void runDeleteConfirm()}
    />
    <ConfirmDialog
      open={Boolean(textPrompt)}
      title={textPrompt?.title ?? ""}
      confirmLabel="确认"
      cancelLabel="取消"
      onCancel={closeTextPrompt}
      onConfirm={() => void runTextPromptConfirm()}
    >
      <label className="mewmo-prompt-field">
        <span>名称</span>
        <input
          className="mewmo-prompt-input"
          value={textPromptValue}
          autoFocus
          onChange={(event) => setTextPromptValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void runTextPromptConfirm();
          }}
        />
      </label>
    </ConfirmDialog>
    </>
  );
}

function AccountSubmenu({
  label,
  icon,
  children,
}: {
  label: string;
  icon: PrototypeIconName;
  children: ReactNode;
}) {
  const itemRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState({ left: false, up: false });

  const updateSubmenuPlacement = useCallback(() => {
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

    setPlacement((current) => (current.left === left && current.up === up ? current : { left, up }));
  }, []);

  const submenu = isValidElement(children)
    ? cloneElement(children, { ref: submenuRef } as { ref: Ref<HTMLDivElement> })
    : children;

  return (
    <div
      ref={itemRef}
      className={`mewmo-floating-menu__item acct-menu__item acct-menu__has-sub ${placement.left ? "acct-menu__has-sub--left" : ""} ${placement.up ? "acct-menu__has-sub--up" : ""}`}
      onMouseEnter={updateSubmenuPlacement}
      onFocusCapture={updateSubmenuPlacement}
    >
      <span className="mewmo-floating-menu__icon acct-ic">
        <PrototypeIcon name={icon} size={16} />
      </span>
      <span>{label}</span>
      <PrototypeIcon name="caret" size={12} className="acct-chev" />
      {submenu}
    </div>
  );
}

function AccountSubmenuRow({
  children,
  icon,
  glyph,
  glyphStyle,
  active = false,
  onClick,
  "data-font": dataFont,
  "data-fontsize": dataFontSize,
}: {
  children: ReactNode;
  icon?: PrototypeIconName;
  glyph?: string;
  glyphStyle?: CSSProperties;
  active?: boolean;
  onClick?: () => void;
  "data-font"?: string;
  "data-fontsize"?: string;
}) {
  return (
    <button
      type="button"
      data-font={dataFont}
      data-fontsize={dataFontSize}
      className={`acct-sub__row ${active ? "active" : ""}`}
      onClick={onClick}
    >
      {icon ? (
        <span className="acct-ic">
          <PrototypeIcon name={icon} size={16} />
        </span>
      ) : (
        <span className="acct-sub__glyph" style={glyphStyle}>{glyph}</span>
      )}
      <span>{children}</span>
      {active && (
        <span className="acct-check">
          <PrototypeIcon name="check" size={14} />
        </span>
      )}
    </button>
  );
}

function renderEntry(
  entry: NavEntry,
  pathname: string,
  defer: () => void,
  rememberedWorkspaceHrefs: Record<WorkspaceSection, string>,
) {
  if (entry.kind === "deferred") {
    return <SidebarButton key={entry.label} icon={entry.icon} label={entry.label} badge={entry.badge} onClick={defer} muted />;
  }
  const section = workspaceSectionForEntryHref(entry.href);
  const href = section ? rememberedWorkspaceHrefs[section] : entry.href;
  const active =
    entry.href === "/feeds"
      ? pathname.startsWith("/feeds") && entry.label === "文章"
      : pathname === entry.href || pathname.startsWith(`${entry.href}/`);
  return (
    <SidebarLink
      key={`${entry.href}-${entry.label}`}
      href={href}
      icon={entry.icon}
      label={entry.label}
      active={active}
      badge={entry.badge}
    />
  );
}

function workspaceSectionForEntryHref(href: string): WorkspaceSection | null {
  if (href === "/today") return "today";
  if (href === "/notes") return "notes";
  if (href === "/clips") return "clips";
  if (href === "/feeds") return "feeds";
  if (href === "/knowledge-bases") return "knowledge-bases";
  return null;
}

function KnowledgeFolderRows({
  folder,
  activeFolderId,
  knowledgeMenu,
  editingKnowledgeFolder,
  menuAnchorRef,
  onMenuChange,
  onEditingValueChange,
  onCommitEditing,
  onCancelEditing,
  onSelect,
  onCreateFolder,
  onImportInbox,
  onImportLocalFile,
  onImportLocalFolder,
  onExport,
  onRename,
  onDelete,
}: {
  folder: KnowledgeFolderNode;
  activeFolderId: string | null;
  knowledgeMenu: KnowledgeMenuState | null;
  editingKnowledgeFolder: EditingKnowledgeFolderState | null;
  menuAnchorRef: RefObject<HTMLButtonElement | null>;
  onMenuChange: (menu: KnowledgeMenuState | null) => void;
  onEditingValueChange: (value: string) => void;
  onCommitEditing: () => void;
  onCancelEditing: () => void;
  onSelect: (folder: KnowledgeFolderNode) => void;
  onCreateFolder: (folder: KnowledgeFolderNode) => void;
  onImportInbox: (folder: KnowledgeFolderNode) => void;
  onImportLocalFile: (folder: KnowledgeFolderNode) => void;
  onImportLocalFolder: (folder: KnowledgeFolderNode) => void;
  onExport: () => void;
  onRename: (folder: KnowledgeFolderNode) => void;
  onDelete: (folder: KnowledgeFolderNode) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const menuOpen = knowledgeMenu?.type === "folder" && knowledgeMenu.id === folder.id;
  const hasChildren = folder.children.length > 0;
  const canCreateChild = canCreateKnowledgeSubfolder(folder.depth);
  const editingThisFolder =
    editingKnowledgeFolder?.type === "rename" && editingKnowledgeFolder.folder.id === folder.id;
  const creatingChild =
    editingKnowledgeFolder?.type === "create" && editingKnowledgeFolder.parent?.id === folder.id;

  return (
    <div className={`mewmo-knowledge-folder-wrap ${collapsed ? "mewmo-knowledge-folder-wrap--collapsed" : ""}`}>
      <div className="mewmo-knowledge-folder-row">
        {editingThisFolder ? (
          <KnowledgeFolderNameInput
            value={editingKnowledgeFolder.value}
            depth={folder.depth}
            active={activeFolderId === folder.id}
            onValueChange={onEditingValueChange}
            onCommit={onCommitEditing}
            onCancel={onCancelEditing}
          />
        ) : (
          <>
            <button
              type="button"
              className={`mewmo-nav-row mewmo-knowledge-folder ${activeFolderId === folder.id ? "mewmo-nav-row--active" : ""}`}
              style={
                {
                  paddingLeft: knowledgeFolderPadding(folder.depth),
                  "--knowledge-folder-depth": folder.depth,
                } as CSSProperties
              }
              data-depth={folder.depth}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest(".mewmo-knowledge-folder-chev")) {
                  setCollapsed((value) => !value);
                  return;
                }
                onSelect(folder);
              }}
            >
              {hasChildren && (
                <span className="mewmo-nav-row__chevron mewmo-knowledge-folder-chev">
                  <PrototypeIcon name="caret" size={13} />
                </span>
              )}
              <span className="mewmo-nav-row__icon">
                <PrototypeIcon name="folder" size={18} dual filled={activeFolderId === folder.id} />
              </span>
              <span className="mewmo-nav-row__label">{folder.name}</span>
            </button>
            <button
              ref={(node) => {
                if (menuOpen) menuAnchorRef.current = node;
              }}
              type="button"
              className={`mewmo-row-action ${menuOpen ? "mewmo-row-action--open" : ""}`}
              onClick={() => onMenuChange(menuOpen ? null : { type: "folder", id: folder.id, depth: folder.depth })}
              aria-label={`${folder.name} actions`}
            >
              <PrototypeIcon name="more-horizontal" size={16} />
            </button>
            <FloatingMenu
              open={menuOpen}
              anchorRef={menuAnchorRef}
              onOpenChange={(open) => onMenuChange(open ? { type: "folder", id: folder.id, depth: folder.depth } : null)}
              className="mewmo-row-menu"
            >
              {canCreateChild && (
                <FloatingMenuButton icon="plus" onClick={() => onCreateFolder(folder)}>
                  新建文件夹
                </FloatingMenuButton>
              )}
              <FloatingMenuButton icon="inbox" onClick={() => onImportInbox(folder)}>
                从收藏箱导入
              </FloatingMenuButton>
              <FloatingMenuButton icon="import" onClick={() => onImportLocalFile(folder)}>
                从本地文件导入
              </FloatingMenuButton>
              <FloatingMenuButton icon="folder" onClick={() => onImportLocalFolder(folder)}>
                从本地文件夹导入
              </FloatingMenuButton>
              <FloatingMenuButton icon="export" onClick={onExport}>
                导出到本地
              </FloatingMenuButton>
              <div className="mewmo-menu-separator" />
              <FloatingMenuButton icon="pen-new-square" onClick={() => onRename(folder)}>
                重命名
              </FloatingMenuButton>
              <FloatingMenuButton icon="trash" danger onClick={() => onDelete(folder)}>
                删除
              </FloatingMenuButton>
            </FloatingMenu>
          </>
        )}
      </div>
      {creatingChild && (
        <KnowledgeFolderNameInput
          value={editingKnowledgeFolder.value}
          depth={folder.depth + 1}
          placeholder="新建文件夹"
          onValueChange={onEditingValueChange}
          onCommit={onCommitEditing}
          onCancel={onCancelEditing}
        />
      )}
      {hasChildren && !collapsed && (
        <div className="mewmo-knowledge-folder-children">
          {folder.children.map((child) => (
            <KnowledgeFolderRows
              key={child.id}
              folder={child}
              activeFolderId={activeFolderId}
              knowledgeMenu={knowledgeMenu}
              editingKnowledgeFolder={editingKnowledgeFolder}
              menuAnchorRef={menuAnchorRef}
              onMenuChange={onMenuChange}
              onEditingValueChange={onEditingValueChange}
              onCommitEditing={onCommitEditing}
              onCancelEditing={onCancelEditing}
              onSelect={onSelect}
              onCreateFolder={onCreateFolder}
              onImportInbox={onImportInbox}
              onImportLocalFile={onImportLocalFile}
              onImportLocalFolder={onImportLocalFolder}
              onExport={onExport}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function KnowledgeFolderNameInput({
  value,
  depth,
  placeholder = "文件夹名称",
  active = false,
  onValueChange,
  onCommit,
  onCancel,
}: {
  value: string;
  depth: number;
  placeholder?: string;
  active?: boolean;
  onValueChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, []);

  return (
    <div
      className={`mewmo-nav-row mewmo-knowledge-folder mewmo-knowledge-folder--editing ${active ? "mewmo-nav-row--active" : ""}`}
      style={
        {
          paddingLeft: knowledgeFolderPadding(depth),
          "--knowledge-folder-depth": depth,
        } as CSSProperties
      }
      data-depth={depth}
    >
      <span className="mewmo-nav-row__icon">
        <PrototypeIcon name="folder" size={18} dual filled={active} />
      </span>
      <input
        ref={inputRef}
        className="mewmo-knowledge-folder-name-input"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onValueChange(event.target.value)}
        onBlur={() => {
          if (skipBlurCommitRef.current) return;
          onCommit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            skipBlurCommitRef.current = true;
            onCommit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            skipBlurCommitRef.current = true;
            onCancel();
          }
        }}
      />
    </div>
  );
}

function iconName(value: string | null | undefined): PrototypeIconName {
  if (value === "library" || value === "book") return value;
  return "book";
}

function feedSiteIcon(feed: SidebarFeed): string {
  if (feed.favicon) return feed.favicon;
  try {
    const url = new URL(feed.url);
    return `${url.origin}/favicon.ico`;
  } catch {
    return "";
  }
}

function googleFeedIcon(feed: SidebarFeed): string {
  try {
    const hostname = new URL(feed.url).hostname.replace(/^www\./, "");
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
  } catch {
    return "";
  }
}

function faviconServiceIcon(feed: SidebarFeed): string {
  try {
    const hostname = new URL(feed.url).hostname.replace(/^www\./, "");
    return `https://favicon.im/${encodeURIComponent(hostname)}?larger=true`;
  } catch {
    return "";
  }
}

function feedIconCandidates(feed: SidebarFeed): string[] {
  return [feedSiteIcon(feed), faviconServiceIcon(feed), googleFeedIcon(feed)].filter(Boolean);
}

async function preloadFeedIcons(feeds: SidebarFeed[]): Promise<void> {
  await Promise.allSettled(
    feeds.map((feed) => {
      const src = feedIconCandidates(feed)[0];
      return src ? preloadFeedIcon(src) : Promise.resolve();
    }),
  );
}

function preloadFeedIcon(src: string): Promise<void> {
  if (preloadedFeedIcons.has(src) || typeof Image === "undefined") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const image = new Image();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      preloadedFeedIcons.add(src);
      resolve();
    };
    const timer = window.setTimeout(finish, FEED_ICON_PRELOAD_TIMEOUT_MS);
    image.decoding = "async";
    image.onload = finish;
    image.onerror = finish;
    image.src = src;
    if (image.complete) finish();
  });
}

function feedDomainInitial(feed: SidebarFeed): string {
  try {
    return new URL(feed.url).hostname.replace(/^www\./, "").charAt(0).toUpperCase();
  } catch {
    return feed.title.charAt(0).toUpperCase();
  }
}

function FeedSiteIcon({ feed }: { feed: SidebarFeed }) {
  const [fallbackIndex, setFallbackIndex] = useState(0);
  const candidates = feedIconCandidates(feed);
  const src = candidates[fallbackIndex];
  if (!src) return <span>{feedDomainInitial(feed)}</span>;

  return (
    <img
      key={src}
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      onError={() => setFallbackIndex((index) => index + 1)}
    />
  );
}

function SidebarGroup({
  id,
  title,
  icon,
  collapsed,
  onToggle,
  menuOpen,
  onMenuToggle,
  menu,
  children,
}: {
  id: string;
  title: string;
  icon: PrototypeIconName;
  collapsed: boolean;
  onToggle: (id: string) => void;
  menuOpen?: boolean;
  onMenuToggle?: () => void;
  menu?: ReactNode;
  children: ReactNode;
}) {
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const hasMenu = Boolean(onMenuToggle);

  return (
    <div className={`mewmo-sidebar__group ${collapsed ? "mewmo-sidebar__group--collapsed" : ""}`}>
      <div className="mewmo-sidebar__group-head">
        <button type="button" className="mewmo-nav-row mewmo-nav-row--group" onClick={() => onToggle(id)}>
          <span className="mewmo-nav-row__chevron"><PrototypeIcon name="caret" size={14} /></span>
          <span className="mewmo-nav-row__icon"><PrototypeIcon name={icon} dual /></span>
          <span>{title}</span>
        </button>
        {hasMenu && (
          <>
            <button
              ref={menuButtonRef}
              type="button"
              className={`mewmo-row-action ${menuOpen ? "mewmo-row-action--open" : ""}`}
              onClick={onMenuToggle}
              aria-label={`${title} actions`}
            >
              <PrototypeIcon name="more-horizontal" size={16} />
            </button>
            <FloatingMenu
              open={Boolean(menuOpen)}
              anchorRef={menuButtonRef}
              onOpenChange={(open) => {
                if (open !== Boolean(menuOpen)) onMenuToggle?.();
              }}
              className="mewmo-row-menu"
            >
              {menu ?? (
                <>
                  <FloatingMenuButton icon="pen-new-square">重命名</FloatingMenuButton>
                  <FloatingMenuButton icon="sync">刷新</FloatingMenuButton>
                  <FloatingMenuButton icon="trash" danger>删除</FloatingMenuButton>
                </>
              )}
            </FloatingMenu>
          </>
        )}
      </div>
      <div className="mewmo-sidebar__group-body">{children}</div>
    </div>
  );
}

function SidebarLink({
  href,
  label,
  icon,
  active,
  badge,
}: {
  href: string;
  label: string;
  icon: PrototypeIconName;
  active?: boolean;
  badge?: string | undefined;
}) {
  return (
    <Link href={href} scroll={false} className={`mewmo-nav-row mewmo-nav-row--sub ${active ? "mewmo-nav-row--active" : ""}`}>
      <span className="mewmo-nav-row__icon"><PrototypeIcon name={icon} dual filled={Boolean(active)} /></span>
      <span className="mewmo-nav-row__label">{label}</span>
      {badge && <span className="mewmo-nav-row__badge">{badge}</span>}
    </Link>
  );
}

function SidebarButton({
  label,
  icon,
  badge,
  muted = false,
  active = false,
  onClick,
  children,
}: {
  label: string;
  icon?: PrototypeIconName | undefined;
  badge?: string | undefined;
  muted?: boolean;
  active?: boolean;
  onClick?: (() => void) | undefined;
  children?: ReactNode | undefined;
}) {
  return (
    <button type="button" className={`mewmo-nav-row mewmo-nav-row--sub ${active ? "mewmo-nav-row--active" : ""} ${muted ? "mewmo-nav-row--muted" : ""}`} onClick={onClick}>
      {children ?? <span className="mewmo-nav-row__icon">{icon ? <PrototypeIcon name={icon} dual filled={active} /> : null}</span>}
      <span className="mewmo-nav-row__label">{label}</span>
      {badge && <span className="mewmo-nav-row__badge">{badge}</span>}
    </button>
  );
}
