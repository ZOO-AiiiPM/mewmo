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

const deferredMessage = "This area is not connected in the dogfood slice yet.";

const collectionEntries: NavEntry[] = [
  { kind: "link", href: "/notes", label: "Notes", icon: "N" },
  { kind: "link", href: "/clips", label: "Clips", icon: "C" },
  { kind: "deferred", label: "PDF", icon: "P", badge: "Later" },
  { kind: "deferred", label: "Books", icon: "B", badge: "Later" },
];

const subscriptionEntries: NavEntry[] = [
  { kind: "link", href: "/feeds", label: "Articles", icon: "A" },
  { kind: "link", href: "/feeds", label: "Media", icon: "M" },
  { kind: "deferred", label: "Video", icon: "V", badge: "Later" },
  { kind: "deferred", label: "Podcast", icon: "O", badge: "Later" },
];

const tagEntries = [
  { label: "Reading", color: "#4f93e8" },
  { label: "Design", color: "#e88478" },
  { label: "Product", color: "#4caf72" },
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
        <Link href="/notes" className="mewmo-sidebar__brand" aria-label="mewmo home">
          <span className="mewmo-sidebar__logo" aria-hidden="true">m</span>
          <span>mewmo</span>
        </Link>
        <button type="button" className="mewmo-icon-button" onClick={toggleAllGroups} aria-label="Expand or collapse all groups">
          {allCollapsed ? "⌄" : "⌃"}
        </button>
        <button type="button" className="mewmo-icon-button" onClick={onToggleCollapsed} aria-label="Collapse sidebar">
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      <nav className="mewmo-sidebar__nav" aria-label="Workspace">
        <SidebarButton icon="H" label="Home" onClick={defer} />
        <SidebarButton icon="T" label="Today" onClick={defer} />

        <SidebarGroup
          id="collection"
          title="Collection"
          icon="I"
          collapsed={Boolean(collapsedGroups.collection)}
          onToggle={toggleGroup}
          menuOpen={openMenu === "collection"}
          onMenuToggle={() => setOpenMenu(openMenu === "collection" ? null : "collection")}
        >
          {collectionEntries.map((entry) => renderEntry(entry, pathname, defer))}
        </SidebarGroup>

        <SidebarGroup
          id="subscription"
          title="Subscription"
          icon="R"
          collapsed={Boolean(collapsedGroups.subscription)}
          onToggle={toggleGroup}
          menuOpen={openMenu === "subscription"}
          onMenuToggle={() => setOpenMenu(openMenu === "subscription" ? null : "subscription")}
        >
          {subscriptionEntries.map((entry) => renderEntry(entry, pathname, defer))}
        </SidebarGroup>

        <SidebarGroup
          id="knowledge"
          title="Knowledge Base"
          icon="K"
          collapsed={Boolean(collapsedGroups.knowledge)}
          onToggle={toggleGroup}
          menuOpen={openMenu === "knowledge"}
          onMenuToggle={() => setOpenMenu(openMenu === "knowledge" ? null : "knowledge")}
        >
          <SidebarButton icon="D" label="Product design" onClick={defer} badge="Later" muted />
          <SidebarButton icon="T" label="Technical notes" onClick={defer} badge="Later" muted />
        </SidebarGroup>

        <SidebarGroup
          id="tags"
          title="Tags"
          icon="#"
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

        <SidebarButton icon="X" label="Trash" onClick={defer} />
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
          <div className="mewmo-menu-label">Appearance</div>
          <FloatingMenuButton onClick={() => setTheme("system")}>System {theme === "system" ? "✓" : ""}</FloatingMenuButton>
          <FloatingMenuButton onClick={() => setTheme("dark")}>Dark {theme === "dark" ? "✓" : ""}</FloatingMenuButton>
          <FloatingMenuButton onClick={() => setTheme("light")}>Light {theme === "light" ? "✓" : ""}</FloatingMenuButton>
          <div className="mewmo-menu-separator" />
          <FloatingMenuButton onClick={defer}>Import</FloatingMenuButton>
          <FloatingMenuButton onClick={defer}>Export</FloatingMenuButton>
          <div className="mewmo-menu-separator" />
          <div className="mewmo-sync-state">Sync: waiting for dogfood backend</div>
        </FloatingMenu>
      </div>
    </aside>
  );
}

function renderEntry(entry: NavEntry, pathname: string, defer: () => void) {
  if (entry.kind === "deferred") {
    return <SidebarButton key={entry.label} icon={entry.icon} label={entry.label} badge={entry.badge} onClick={defer} muted />;
  }
  return (
    <SidebarLink
      key={`${entry.href}-${entry.label}`}
      href={entry.href}
      icon={entry.icon}
      label={entry.label}
      active={pathname === entry.href || pathname.startsWith(`${entry.href}/`)}
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
          <span className="mewmo-nav-row__icon">{icon}</span>
          <span>{title}</span>
        </button>
        <button
          type="button"
          className={`mewmo-row-action ${menuOpen ? "mewmo-row-action--open" : ""}`}
          onClick={onMenuToggle}
          aria-label={`${title} actions`}
        >
          ···
        </button>
        <FloatingMenu open={menuOpen} className="mewmo-row-menu">
          <FloatingMenuButton>Rename</FloatingMenuButton>
          <FloatingMenuButton>Refresh</FloatingMenuButton>
          <FloatingMenuButton danger>Delete</FloatingMenuButton>
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
      <span className="mewmo-nav-row__icon">{icon}</span>
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
      {children ?? <span className="mewmo-nav-row__icon">{icon}</span>}
      <span className="mewmo-nav-row__label">{label}</span>
      {badge && <span className="mewmo-nav-row__badge">{badge}</span>}
    </button>
  );
}
