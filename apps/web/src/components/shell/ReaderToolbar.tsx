"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { PopoverMenu } from "../ui/FloatingMenu";
import { PrototypeIcon } from "./PrototypeIcon";

interface ReaderToolbarProps {
  title: string;
  titleVisible?: boolean;
  onTitleClick?: () => void;
  onToggleList?: () => void;
  listCollapsed?: boolean;
  actions?: ReactNode;
  showMenu?: boolean;
  menuKind?: "notes" | "clips" | "feed";
  pinned?: boolean | undefined;
  onDelete?: (() => void) | undefined;
  onTogglePin?: (() => void) | undefined;
  onShare?: (() => void) | undefined;
  onExport?: (() => void) | undefined;
  onRefresh?: (() => void) | undefined;
  onCopyLink?: (() => void) | undefined;
  onFavorite?: (() => void) | undefined;
  favoriteActive?: boolean | undefined;
}

export function ReaderToolbar({
  title,
  titleVisible = false,
  onTitleClick,
  onToggleList,
  listCollapsed = false,
  actions,
  showMenu = true,
  menuKind = "notes",
  pinned = false,
  onDelete,
  onTogglePin,
  onShare,
  onExport,
  onRefresh,
  onCopyLink,
  onFavorite,
  favoriteActive = false,
}: ReaderToolbarProps) {
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const runMenuAction = (action?: () => void) => {
    action?.();
    setMenuOpen(false);
  };

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
      <button
        type="button"
        className={`mewmo-reader-toolbar__title ${titleVisible ? "mewmo-reader-toolbar__title--visible" : ""}`}
        title={titleVisible ? "回到顶部" : title}
        onClick={onTitleClick}
        disabled={!titleVisible || !onTitleClick}
        aria-label={titleVisible ? "回到顶部" : title}
      >
        {title}
      </button>
      <div className="mewmo-reader-toolbar__tools">
        {onToggleList && (
          <button
            type="button"
            className="mewmo-icon-button"
            onClick={onToggleList}
            aria-label={listCollapsed ? "显示列表" : "收起列表"}
          >
            <PrototypeIcon
              name={listCollapsed ? "fullscreen-contract" : "fullscreen-expand"}
              size={20}
            />
          </button>
        )}
        {actions}
        <div className="mewmo-reader-toolbar__menu-wrap" hidden={!showMenu}>
          <button
            ref={menuButtonRef}
            type="button"
            className={`mewmo-icon-button ${menuOpen ? "mewmo-icon-button--active" : ""}`}
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((value) => !value);
            }}
            aria-label="更多"
            aria-expanded={menuOpen}
          >
            <PrototypeIcon name="more-vertical" size={20} />
          </button>
          <PopoverMenu
            open={menuOpen}
            anchorRef={menuButtonRef}
            onOpenChange={setMenuOpen}
            boundary="main"
            className="mewmo-card-menu mewmo-reader-menu"
          >
              {menuKind === "notes" ? (
                <>
                  <button
                    type="button"
                    className="mewmo-card-menu__item mewmo-card-menu__item--danger"
                    onClick={() => runMenuAction(onDelete)}
                  >
                    <span className="mewmo-card-menu__icon">
                      <PrototypeIcon name="trash" size={16} />
                    </span>
                    <span>删除</span>
                  </button>
                  <button
                    type="button"
                    className="mewmo-card-menu__item"
                    onClick={() => runMenuAction(onTogglePin)}
                  >
                    <span className="mewmo-card-menu__icon">
                      <PrototypeIcon name="pin" size={16} />
                    </span>
                    <span>{pinned ? "取消置顶" : "置顶"}</span>
                  </button>
                  <button
                    type="button"
                    className="mewmo-card-menu__item"
                    onClick={() => runMenuAction(onShare)}
                  >
                    <span className="mewmo-card-menu__icon">
                      <PrototypeIcon name="share" size={16} />
                    </span>
                    <span>分享</span>
                  </button>
                  <button
                    type="button"
                    className="mewmo-card-menu__item"
                    onClick={() => runMenuAction(onExport)}
                  >
                    <span className="mewmo-card-menu__icon">
                      <PrototypeIcon name="export" size={16} />
                    </span>
                    <span>导出</span>
                  </button>
                </>
              ) : menuKind === "feed" ? (
                <>
                  <button
                    type="button"
                    className="mewmo-card-menu__item"
                    onClick={() => runMenuAction(onFavorite)}
                  >
                    <span className="mewmo-card-menu__icon">
                      <PrototypeIcon name="bookmark" size={16} />
                    </span>
                    <span>{favoriteActive ? "已收藏" : "收藏"}</span>
                  </button>
                  <button
                    type="button"
                    className="mewmo-card-menu__item"
                    onClick={() => runMenuAction(onCopyLink)}
                  >
                    <span className="mewmo-card-menu__icon">
                      <PrototypeIcon name="copy" size={16} />
                    </span>
                    <span>复制链接</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="mewmo-card-menu__item mewmo-card-menu__item--danger"
                    onClick={() => runMenuAction(onDelete)}
                  >
                    <span className="mewmo-card-menu__icon">
                      <PrototypeIcon name="trash" size={16} />
                    </span>
                    <span>删除</span>
                  </button>
                  <button
                    type="button"
                    className="mewmo-card-menu__item"
                    onClick={() => runMenuAction(onRefresh)}
                  >
                    <span className="mewmo-card-menu__icon">
                      <PrototypeIcon name="sync" size={16} />
                    </span>
                    <span>刷新</span>
                  </button>
                  <button
                    type="button"
                    className="mewmo-card-menu__item"
                    onClick={() => runMenuAction(onCopyLink)}
                  >
                    <span className="mewmo-card-menu__icon">
                      <PrototypeIcon name="copy" size={16} />
                    </span>
                    <span>复制链接</span>
                  </button>
                </>
              )}
          </PopoverMenu>
        </div>
      </div>
    </header>
  );
}
