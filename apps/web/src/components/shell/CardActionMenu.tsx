"use client";

import { useRef } from "react";
import {
  MoveToKnowledgeMenuItem,
  type MoveToKnowledgeTarget,
} from "../knowledge/MoveToKnowledgeMenuItem";
import { PopoverMenu } from "../ui/FloatingMenu";
import { PrototypeIcon } from "./PrototypeIcon";

type CardActionKind = "notes" | "clips" | "feed";

interface CardActionMenuProps {
  kind: CardActionKind;
  open: boolean;
  ariaLabel: string;
  pinned?: boolean;
  favoriteActive?: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete?: () => void;
  onFavorite?: () => void;
  onTogglePin?: () => void;
  onShare?: () => void;
  onExport?: () => void;
  onRefresh?: () => void;
  onCopyLink?: () => void;
  href?: string;
  moveToKnowledgeTarget?: MoveToKnowledgeTarget | undefined;
}

export function CardActionMenu({
  kind,
  open,
  ariaLabel,
  pinned = false,
  favoriteActive = false,
  onOpenChange,
  onDelete,
  onFavorite,
  onTogglePin,
  onShare,
  onExport,
  onRefresh,
  onCopyLink,
  href,
  moveToKnowledgeTarget,
}: CardActionMenuProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  const run = (callback?: () => void) => {
    callback?.();
    onOpenChange(false);
  };

  const menu = (
    <PopoverMenu
      open={open}
      anchorRef={buttonRef}
      onOpenChange={onOpenChange}
      boundary="main"
      className="mewmo-card-menu"
    >
      {moveToKnowledgeTarget && (
        <MoveToKnowledgeMenuItem target={moveToKnowledgeTarget} />
      )}
      {kind === "feed" ? (
        <>
          <button
            type="button"
            className="mewmo-card-menu__item"
            onClick={() => run(onFavorite)}
          >
            <span className="mewmo-card-menu__icon">
              <PrototypeIcon name="bookmark" size={16} dual />
            </span>
            <span>{favoriteActive ? "已收藏" : "收藏"}</span>
          </button>
          <button
            type="button"
            className="mewmo-card-menu__item"
            onClick={() => run(onCopyLink)}
          >
            <span className="mewmo-card-menu__icon">
              <PrototypeIcon name="copy" size={16} />
            </span>
            <span>复制链接</span>
          </button>
        </>
      ) : kind === "notes" ? (
        <>
          <button
            type="button"
            className="mewmo-card-menu__item mewmo-card-menu__item--danger"
            onClick={() => run(onDelete)}
          >
            <span className="mewmo-card-menu__icon">
              <PrototypeIcon name="trash" size={16} />
            </span>
            <span>删除</span>
          </button>
          <button
            type="button"
            className="mewmo-card-menu__item"
            onClick={() => run(onTogglePin)}
          >
            <span className="mewmo-card-menu__icon">
              <PrototypeIcon name="pin" size={16} />
            </span>
            <span>{pinned ? "取消置顶" : "置顶"}</span>
          </button>
          <button
            type="button"
            className="mewmo-card-menu__item"
            onClick={() => run(onShare)}
          >
            <span className="mewmo-card-menu__icon">
              <PrototypeIcon name="share" size={16} />
            </span>
            <span>分享</span>
          </button>
          <button
            type="button"
            className="mewmo-card-menu__item"
            onClick={() => run(onExport)}
          >
            <span className="mewmo-card-menu__icon">
              <PrototypeIcon name="export" size={16} />
            </span>
            <span>导出</span>
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="mewmo-card-menu__item mewmo-card-menu__item--danger"
            onClick={() => run(onDelete)}
          >
            <span className="mewmo-card-menu__icon">
              <PrototypeIcon name="trash" size={16} />
            </span>
            <span>删除</span>
          </button>
          <button
            type="button"
            className="mewmo-card-menu__item"
            onClick={() => run(onRefresh)}
          >
            <span className="mewmo-card-menu__icon">
              <PrototypeIcon name="sync" size={16} />
            </span>
            <span>刷新</span>
          </button>
          <button
            type="button"
            className="mewmo-card-menu__item"
            onClick={() => run(onCopyLink)}
          >
            <span className="mewmo-card-menu__icon">
              <PrototypeIcon name="copy" size={16} />
            </span>
            <span>复制链接</span>
          </button>
          <a
            className="mewmo-card-menu__item"
            href={href}
            target="_blank"
            rel="noreferrer"
            onClick={() => onOpenChange(false)}
          >
            <span className="mewmo-card-menu__icon">
              <PrototypeIcon name="external" size={16} />
            </span>
            <span>浏览器打开</span>
          </a>
        </>
      )}
    </PopoverMenu>
  );

  return (
    <div className="mewmo-list-card__action">
      <button
        ref={buttonRef}
        type="button"
        className="mewmo-row-action-card"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenChange(!open);
        }}
        aria-label={ariaLabel}
        aria-expanded={open}
      >
        <PrototypeIcon name="more-horizontal" size={16} />
      </button>
      {menu}
    </div>
  );
}
