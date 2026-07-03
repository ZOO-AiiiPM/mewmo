"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { FloatingMenu, FloatingMenuButton } from "../ui/FloatingMenu";
import { PrototypeIcon } from "./PrototypeIcon";

interface ReaderToolbarProps {
  title: string;
  onToggleList?: () => void;
  listCollapsed?: boolean;
  actions?: ReactNode;
  menuKind?: "notes" | "clips";
}

export function ReaderToolbar({ title, onToggleList, listCollapsed = false, actions, menuKind = "notes" }: ReaderToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="mewmo-reader-toolbar">
      <div className="mewmo-reader-toolbar__nav" aria-label="Reader navigation">
        <button type="button" className="mewmo-icon-button" aria-label="上一篇">
          <PrototypeIcon name="chev-left" size={20} />
        </button>
        <button type="button" className="mewmo-icon-button" aria-label="下一篇">
          <PrototypeIcon name="chev-right" size={20} />
        </button>
      </div>
      <div className="mewmo-reader-toolbar__title" title={title}>{title}</div>
      <div className="mewmo-reader-toolbar__tools">
        {onToggleList && (
          <button type="button" className="mewmo-icon-button" onClick={onToggleList} aria-label={listCollapsed ? "显示列表" : "收起列表"}>
            <PrototypeIcon name={listCollapsed ? "contract" : "expand"} size={20} />
          </button>
        )}
        {actions}
        <div className="mewmo-reader-toolbar__menu-wrap">
          <button type="button" className="mewmo-icon-button" onClick={() => setMenuOpen((value) => !value)} aria-label="更多">
            <PrototypeIcon name="more-vertical" size={20} />
          </button>
          <FloatingMenu open={menuOpen} className="mewmo-reader-menu">
            {menuKind === "notes" ? (
              <>
                <FloatingMenuButton><PrototypeIcon name="trash" size={15} /> 删除</FloatingMenuButton>
                <FloatingMenuButton><PrototypeIcon name="pin" size={15} /> 置顶</FloatingMenuButton>
                <FloatingMenuButton><PrototypeIcon name="share" size={15} /> 分享</FloatingMenuButton>
                <FloatingMenuButton><PrototypeIcon name="export" size={15} /> 导出</FloatingMenuButton>
              </>
            ) : (
              <>
                <FloatingMenuButton><PrototypeIcon name="trash" size={15} /> 删除</FloatingMenuButton>
                <FloatingMenuButton><PrototypeIcon name="sync" size={15} /> 刷新</FloatingMenuButton>
                <FloatingMenuButton><PrototypeIcon name="copy" size={15} /> 复制链接</FloatingMenuButton>
                <FloatingMenuButton><PrototypeIcon name="external" size={15} /> 浏览器打开</FloatingMenuButton>
              </>
            )}
          </FloatingMenu>
        </div>
      </div>
    </header>
  );
}
