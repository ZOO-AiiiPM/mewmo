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
        <button type="button" className="mewmo-icon-button" aria-label="上一篇">‹</button>
        <button type="button" className="mewmo-icon-button" aria-label="下一篇">›</button>
      </div>
      <div className="mewmo-reader-toolbar__title" title={title}>{title}</div>
      <div className="mewmo-reader-toolbar__tools">
        {onToggleList && (
          <button type="button" className="mewmo-icon-button" onClick={onToggleList} aria-label={listCollapsed ? "显示列表" : "收起列表"}>
            {listCollapsed ? "⊞" : "⊟"}
          </button>
        )}
        {actions}
        <div className="mewmo-reader-toolbar__menu-wrap">
          <button type="button" className="mewmo-icon-button" onClick={() => setMenuOpen((value) => !value)} aria-label="更多">
            ···
          </button>
          <FloatingMenu open={menuOpen} className="mewmo-reader-menu">
            <FloatingMenuButton>复制链接</FloatingMenuButton>
            <FloatingMenuButton>打开来源</FloatingMenuButton>
            <FloatingMenuButton danger>删除</FloatingMenuButton>
          </FloatingMenu>
        </div>
      </div>
    </header>
  );
}
