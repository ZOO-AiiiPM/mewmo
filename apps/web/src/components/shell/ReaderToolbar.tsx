"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { FloatingMenu, FloatingMenuButton } from "../ui/FloatingMenu";

interface ReaderToolbarProps {
  title: string;
  onToggleList?: () => void;
  listCollapsed?: boolean;
  actions?: ReactNode;
}

export function ReaderToolbar({ title, onToggleList, listCollapsed = false, actions }: ReaderToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="mewmo-reader-toolbar">
      <div className="mewmo-reader-toolbar__nav" aria-label="Reader navigation">
        <button type="button" className="mewmo-icon-button" aria-label="Previous item">‹</button>
        <button type="button" className="mewmo-icon-button" aria-label="Next item">›</button>
      </div>
      <div className="mewmo-reader-toolbar__title" title={title}>{title}</div>
      <div className="mewmo-reader-toolbar__tools">
        {onToggleList && (
          <button type="button" className="mewmo-icon-button" onClick={onToggleList} aria-label={listCollapsed ? "Show list" : "Hide list"}>
            {listCollapsed ? "⊞" : "⊟"}
          </button>
        )}
        {actions}
        <div className="mewmo-reader-toolbar__menu-wrap">
          <button type="button" className="mewmo-icon-button" onClick={() => setMenuOpen((value) => !value)} aria-label="Reader menu">
            ···
          </button>
          <FloatingMenu open={menuOpen} className="mewmo-reader-menu">
            <FloatingMenuButton>Copy link</FloatingMenuButton>
            <FloatingMenuButton>Open source</FloatingMenuButton>
            <FloatingMenuButton danger>Delete</FloatingMenuButton>
          </FloatingMenu>
        </div>
      </div>
    </header>
  );
}
