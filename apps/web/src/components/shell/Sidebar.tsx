"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { FloatingMenu, FloatingMenuButton } from "../ui/FloatingMenu";
import { useToast } from "../ui/ToastProvider";
import { useTheme } from "../../lib/theme";
import { MewmoLogo, PrototypeIcon, type PrototypeIconName } from "./PrototypeIcon";

interface SidebarUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface SidebarProps {
  user?: SidebarUser | undefined;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onMouseLeave?: (() => void) | undefined;
}

type NavEntry =
  | { kind: "link"; href: string; label: string; icon: PrototypeIconName; badge?: string }
  | { kind: "deferred"; label: string; icon: PrototypeIconName; badge?: string };

const deferredMessage = "这个区域还没有接入 2.0 dogfood 功能。";

const collectionEntries: NavEntry[] = [
  { kind: "link", href: "/notes", label: "笔记", icon: "note" },
  { kind: "link", href: "/clips", label: "剪藏", icon: "bookmark" },
  { kind: "deferred", label: "PDF", icon: "pdf", badge: "待开发" },
  { kind: "deferred", label: "电子书", icon: "shelf", badge: "待开发" },
];

const subscriptionEntries: NavEntry[] = [
  { kind: "link", href: "/feeds", label: "文章", icon: "doc" },
  { kind: "link", href: "/feeds", label: "媒体", icon: "media" },
  { kind: "deferred", label: "视频", icon: "video", badge: "待开发" },
  { kind: "deferred", label: "播客", icon: "mic", badge: "待开发" },
];

const tagEntries = [
  { label: "读书", color: "#4f93e8" },
  { label: "设计", color: "#e88478" },
  { label: "产品", color: "#4caf72" },
  { label: "数据层", color: "#a874e0" },
  { label: "AI", color: "#e0a93a" },
];

export function Sidebar({ user, collapsed = false, onToggleCollapsed, onMouseLeave }: SidebarProps) {
  const pathname = usePathname();
  const { showToast } = useToast();
  const { theme, setTheme } = useTheme();
  const [allCollapsed, setAllCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);

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

  const defer = () => showToast(deferredMessage, "success");

  return (
    <aside className="mewmo-sidebar" onMouseLeave={onMouseLeave}>
      <div className="mewmo-sidebar__bar">
        <Link href="/notes" className="mewmo-sidebar__brand" aria-label="mewmo 首页">
          <span className="mewmo-sidebar__logo" aria-hidden="true">
            <MewmoLogo className="mewmo-sidebar__logo-cat" />
          </span>
          <span>mewmo</span>
        </Link>
        <button type="button" className="mewmo-icon-button" onClick={toggleAllGroups} aria-label="展开或收起所有分组">
          <PrototypeIcon name="caret" size={18} className={allCollapsed ? "mewmo-icon-rotated" : ""} />
        </button>
        <button type="button" className="mewmo-icon-button" onClick={onToggleCollapsed} aria-label="收起侧栏">
          <PrototypeIcon name={collapsed ? "chev-right" : "chev-left"} size={18} />
        </button>
      </div>

      <nav className="mewmo-sidebar__nav" aria-label="Workspace">
        <SidebarButton icon="home" label="首页" onClick={defer} />
        <SidebarButton icon="calendar" label="今天" onClick={defer} />

        <SidebarGroup
          id="collection"
          title="收集箱"
          icon="inbox"
          collapsed={Boolean(collapsedGroups.collection)}
          onToggle={toggleGroup}
          menuOpen={openMenu === "collection"}
          onMenuToggle={() => setOpenMenu(openMenu === "collection" ? null : "collection")}
        >
          {collectionEntries.map((entry) => renderEntry(entry, pathname, defer))}
        </SidebarGroup>

        <SidebarGroup
          id="subscription"
          title="订阅"
          icon="rss"
          collapsed={Boolean(collapsedGroups.subscription)}
          onToggle={toggleGroup}
          menuOpen={openMenu === "subscription"}
          onMenuToggle={() => setOpenMenu(openMenu === "subscription" ? null : "subscription")}
        >
          {subscriptionEntries.map((entry) => renderEntry(entry, pathname, defer))}
        </SidebarGroup>

        <SidebarGroup
          id="knowledge"
          title="知识库"
          icon="library"
          collapsed={Boolean(collapsedGroups.knowledge)}
          onToggle={toggleGroup}
          menuOpen={openMenu === "knowledge"}
          onMenuToggle={() => setOpenMenu(openMenu === "knowledge" ? null : "knowledge")}
        >
          <SidebarButton icon="book" label="产品设计" onClick={defer} badge="待开发" muted />
          <SidebarButton icon="book" label="技术笔记" onClick={defer} badge="待开发" muted />
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

        <SidebarButton icon="trash" label="废纸篓" onClick={defer} />
      </nav>

      <div className="mewmo-sidebar__footer">
        <button type="button" className="mewmo-account" onClick={() => setAccountOpen((value) => !value)}>
          {user?.image ? <img src={user.image} alt="" /> : <span>{initial}</span>}
          <span className="mewmo-account__copy">
            <strong>{displayName}</strong>
            <small>{displayEmail}</small>
          </span>
        </button>
        <FloatingMenu open={accountOpen} className="mewmo-account-menu">
          <div className="mewmo-menu-label">外观模式</div>
          <FloatingMenuButton onClick={() => setTheme("system")}>
            跟随系统 {theme === "system" && <PrototypeIcon name="check" size={14} />}
          </FloatingMenuButton>
          <FloatingMenuButton onClick={() => setTheme("dark")}>
            深色模式 {theme === "dark" && <PrototypeIcon name="check" size={14} />}
          </FloatingMenuButton>
          <FloatingMenuButton onClick={() => setTheme("light")}>
            浅色模式 {theme === "light" && <PrototypeIcon name="check" size={14} />}
          </FloatingMenuButton>
          <div className="mewmo-menu-separator" />
          <FloatingMenuButton onClick={defer}>导入</FloatingMenuButton>
          <FloatingMenuButton onClick={defer}>导出</FloatingMenuButton>
          <div className="mewmo-menu-separator" />
          <div className="mewmo-sync-state">同步：已接入最小 dogfood API</div>
        </FloatingMenu>
      </div>
    </aside>
  );
}

function renderEntry(entry: NavEntry, pathname: string, defer: () => void) {
  if (entry.kind === "deferred") {
    return <SidebarButton key={entry.label} icon={entry.icon} label={entry.label} badge={entry.badge} onClick={defer} muted />;
  }
  const active =
    entry.href === "/feeds"
      ? pathname.startsWith("/feeds") && entry.label === "文章"
      : pathname === entry.href || pathname.startsWith(`${entry.href}/`);
  return (
    <SidebarLink
      key={`${entry.href}-${entry.label}`}
      href={entry.href}
      icon={entry.icon}
      label={entry.label}
      active={active}
      badge={entry.badge}
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
  children,
}: {
  id: string;
  title: string;
  icon: PrototypeIconName;
  collapsed: boolean;
  onToggle: (id: string) => void;
  menuOpen: boolean;
  onMenuToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`mewmo-sidebar__group ${collapsed ? "mewmo-sidebar__group--collapsed" : ""}`}>
      <div className="mewmo-sidebar__group-head">
        <button type="button" className="mewmo-nav-row mewmo-nav-row--group" onClick={() => onToggle(id)}>
          <span className="mewmo-nav-row__chevron"><PrototypeIcon name="caret" size={14} /></span>
          <span className="mewmo-nav-row__icon"><PrototypeIcon name={icon} dual /></span>
          <span>{title}</span>
        </button>
        <button
          type="button"
          className={`mewmo-row-action ${menuOpen ? "mewmo-row-action--open" : ""}`}
          onClick={onMenuToggle}
          aria-label={`${title} actions`}
        >
          <PrototypeIcon name="more-horizontal" size={16} />
        </button>
        <FloatingMenu open={menuOpen} className="mewmo-row-menu">
          <FloatingMenuButton>重命名</FloatingMenuButton>
          <FloatingMenuButton>刷新</FloatingMenuButton>
          <FloatingMenuButton danger>删除</FloatingMenuButton>
        </FloatingMenu>
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
    <Link href={href} className={`mewmo-nav-row mewmo-nav-row--sub ${active ? "mewmo-nav-row--active" : ""}`}>
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
  onClick,
  children,
}: {
  label: string;
  icon?: PrototypeIconName | undefined;
  badge?: string | undefined;
  muted?: boolean;
  onClick?: (() => void) | undefined;
  children?: ReactNode | undefined;
}) {
  return (
    <button type="button" className={`mewmo-nav-row mewmo-nav-row--sub ${muted ? "mewmo-nav-row--muted" : ""}`} onClick={onClick}>
      {children ?? <span className="mewmo-nav-row__icon">{icon ? <PrototypeIcon name={icon} dual /> : null}</span>}
      <span className="mewmo-nav-row__label">{label}</span>
      {badge && <span className="mewmo-nav-row__badge">{badge}</span>}
    </button>
  );
}
