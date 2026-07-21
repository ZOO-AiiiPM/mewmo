"use client";

import { useEffect, useRef, useState } from "react";

import {
  MoveToKnowledgeMenuItem,
  type MoveToKnowledgeTarget,
} from "../knowledge/MoveToKnowledgeMenuItem";
import { PopoverMenu } from "../ui/FloatingMenu";
import { PrototypeIcon } from "./PrototypeIcon";

interface FeedArticleMenuProps {
  disabled?: boolean;
  favoriteActive?: boolean;
  onFavorite?: (() => void) | undefined;
  onCopyLink?: (() => void) | undefined;
  moveToKnowledgeTarget?: MoveToKnowledgeTarget | undefined;
}

export function FeedArticleMenu({
  disabled = false,
  favoriteActive = false,
  onFavorite,
  onCopyLink,
  moveToKnowledgeTarget,
}: FeedArticleMenuProps) {
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (disabled) setMenuOpen(false);
  }, [disabled]);

  const runMenuAction = (action?: () => void) => {
    action?.();
    setMenuOpen(false);
  };

  return (
    <div className="mewmo-reader-toolbar__menu-wrap">
      <button
        ref={menuButtonRef}
        type="button"
        className={`mewmo-icon-button ${menuOpen ? "mewmo-icon-button--active" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          setMenuOpen((value) => !value);
        }}
        aria-label="更多文章操作"
        aria-expanded={menuOpen}
        disabled={disabled}
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
        {moveToKnowledgeTarget && (
          <MoveToKnowledgeMenuItem target={moveToKnowledgeTarget} />
        )}
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
      </PopoverMenu>
    </div>
  );
}
