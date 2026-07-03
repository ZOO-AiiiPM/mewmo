"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { FloatingMenu, FloatingMenuButton } from "../ui/FloatingMenu";
import { useToast } from "../ui/ToastProvider";
import { useTheme } from "../../lib/theme";

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
  | { kind: "link"; href: string; label: string; icon: string; badge?: string }
  | { kind: "deferred"; label: string; icon: string; badge?: string };

const deferredMessage = "这个区域还没有接入 2.0 dogfood 功能。";

const collectionEntries: NavEntry[] = [
  { kind: "link", href: "/notes", label: "笔记", icon: "note" },
  { kind: "link", href: "/clips", label: "剪藏", icon: "clip" },
  { kind: "deferred", label: "PDF", icon: "pdf", badge: "待开发" },
  { kind: "deferred", label: "电子书", icon: "book", badge: "待开发" },
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
          <span className="mewmo-sidebar__logo" aria-hidden="true">m</span>
          <span>mewmo</span>
        </Link>
        <button type="button" className="mewmo-icon-button" onClick={toggleAllGroups} aria-label="展开或收起所有分组">
          {allCollapsed ? "⌄" : "⌃"}
        </button>
        <button type="button" className="mewmo-icon-button" onClick={onToggleCollapsed} aria-label="收起侧栏">
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      <nav className="mewmo-sidebar__nav" aria-label="Workspace">
        <SidebarButton icon="home" label="首页" onClick={defer} />
        <SidebarButton icon="today" label="今天" onClick={defer} />

        <SidebarGroup
          id="collection"
          title="收藏箱"
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
          <FloatingMenuButton onClick={() => setTheme("system")}>跟随系统 {theme === "system" ? "✓" : ""}</FloatingMenuButton>
          <FloatingMenuButton onClick={() => setTheme("dark")}>深色模式 {theme === "dark" ? "✓" : ""}</FloatingMenuButton>
          <FloatingMenuButton onClick={() => setTheme("light")}>浅色模式 {theme === "light" ? "✓" : ""}</FloatingMenuButton>
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
  icon: string;
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
          <span className="mewmo-nav-row__chevron">⌄</span>
          <span className="mewmo-nav-row__icon"><NavIcon name={icon} /></span>
          <span>{title}</span>
        </button>
        <button
          type="button"
          className={`mewmo-row-action ${menuOpen ? "mewmo-row-action--open" : ""}`}
          onClick={onMenuToggle}
          aria-label={`${title} actions`}
        >
          <MoreIcon />
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
  icon: string;
  active?: boolean;
  badge?: string | undefined;
}) {
  return (
    <Link href={href} className={`mewmo-nav-row mewmo-nav-row--sub ${active ? "mewmo-nav-row--active" : ""}`}>
      <span className="mewmo-nav-row__icon"><NavIcon name={icon} /></span>
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
  icon?: string | undefined;
  badge?: string | undefined;
  muted?: boolean;
  onClick?: (() => void) | undefined;
  children?: ReactNode | undefined;
}) {
  return (
    <button type="button" className={`mewmo-nav-row mewmo-nav-row--sub ${muted ? "mewmo-nav-row--muted" : ""}`} onClick={onClick}>
      {children ?? <span className="mewmo-nav-row__icon">{icon ? <NavIcon name={icon} /> : null}</span>}
      <span className="mewmo-nav-row__label">{label}</span>
      {badge && <span className="mewmo-nav-row__badge">{badge}</span>}
    </button>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </svg>
  );
}

function NavIcon({ name }: { name: string }) {
  const common = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

  if (name === "home") return <svg {...common}><path d="M3.5 11.5 12 4l8.5 7.5" /><path d="M6.5 10.5V20h11v-9.5" /></svg>;
  if (name === "today") return <svg {...common}><path d="M7 3v3M17 3v3" /><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 11h8M8 15h5" /></svg>;
  if (name === "inbox") return <svg {...common}><path d="M4 5h16l-2 10h-4a2 2 0 0 1-4 0H6L4 5Z" /><path d="M4 15v4h16v-4" /></svg>;
  if (name === "note") return <svg {...common}><path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M14 3v5h5M8 13h7M8 17h5" /></svg>;
  if (name === "clip") return <svg {...common}><path d="M8 12.5 13.5 7a3 3 0 0 1 4.2 4.2l-7 7a4.5 4.5 0 0 1-6.4-6.4l7.4-7.4" /></svg>;
  if (name === "pdf") return <svg {...common}><path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M14 3v5h5M8 14h8" /></svg>;
  if (name === "book") return <svg {...common}><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v18H7.5A2.5 2.5 0 0 0 5 22V4.5Z" /><path d="M5 19.5A2.5 2.5 0 0 1 7.5 17H20" /></svg>;
  if (name === "rss") return <svg {...common}><path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1.4" fill="currentColor" stroke="none" /></svg>;
  if (name === "doc") return <svg {...common}><path d="M6 3h12v18H6z" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>;
  if (name === "media") return <svg {...common}><rect x="4" y="5" width="16" height="14" rx="2" /><path d="m10 9 5 3-5 3V9Z" /></svg>;
  if (name === "video") return <svg {...common}><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></svg>;
  if (name === "mic") return <svg {...common}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>;
  if (name === "library") return <svg {...common}><path d="M4 19.5V5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-1.5Z" /><path d="M8 7h6M8 11h7" /></svg>;
  if (name === "tag") return <svg {...common}><path d="M4 5v6.5L12.5 20 20 12.5 11.5 4H5a1 1 0 0 0-1 1Z" /><circle cx="8" cy="8" r="1" /></svg>;
  if (name === "trash") return <svg {...common}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="7" /></svg>;
}
