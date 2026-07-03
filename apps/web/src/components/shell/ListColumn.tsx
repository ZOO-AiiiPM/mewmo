"use client";

import Link from "next/link";
import type { ReactNode, Ref } from "react";
import { useEffect, useRef, useState } from "react";
import { FloatingMenu, FloatingMenuButton } from "../ui/FloatingMenu";
import { useToast } from "../ui/ToastProvider";
import { PrototypeIcon } from "./PrototypeIcon";

export type ListSortMode = "updated" | "created";

interface ListColumnProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  bodyRef?: Ref<HTMLDivElement>;
  searchPlaceholder?: string;
  clipUrlInput?: boolean;
  onSubmitClipUrl?: (url: string) => void;
  onSearchChange?: (query: string) => void;
  sortMode?: ListSortMode;
  onSortChange?: (mode: ListSortMode) => void;
}

export function ListColumn({
  title,
  action,
  children,
  bodyRef,
  searchPlaceholder = "搜索当前列表...",
  clipUrlInput = false,
  onSubmitClipUrl,
  onSearchChange,
  sortMode = "updated",
  onSortChange,
}: ListColumnProps) {
  const { showToast } = useToast();
  const [titleMenuOpen, setTitleMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [clipInputOpen, setClipInputOpen] = useState(false);
  const [clipUrl, setClipUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const clipWrapRef = useRef<HTMLDivElement>(null);
  const titleWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointer(event: MouseEvent) {
      const target = event.target as Node;
      if (searchOpen && searchWrapRef.current && !searchWrapRef.current.contains(target)) {
        closeSearch();
      }
      if (clipInputOpen && clipWrapRef.current && !clipWrapRef.current.contains(target)) {
        setClipInputOpen(false);
      }
      if (titleMenuOpen && titleWrapRef.current && !titleWrapRef.current.contains(target)) {
        setTitleMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointer);
    return () => document.removeEventListener("mousedown", handlePointer);
  }, [clipInputOpen, searchOpen, titleMenuOpen]);

  const closeSearch = () => {
    setSearchOpen(false);
    setSearchQuery("");
    onSearchChange?.("");
  };

  const submitClip = () => {
    const url = clipUrl.trim();
    if (!url) return;
    onSubmitClipUrl?.(url);
    showToast("已加入剪藏。", "success");
    setClipUrl("");
    setClipInputOpen(false);
  };

  const changeSort = (mode: ListSortMode) => {
    onSortChange?.(mode);
    setTitleMenuOpen(false);
  };

  return (
    <section className={`mewmo-list-column ${searchOpen ? "mewmo-list-column--searching" : ""} ${clipInputOpen ? "mewmo-list-column--clip-input" : ""}`}>
      <div className="mewmo-list-column__bar">
        <div className="mewmo-list-title-wrap" ref={titleWrapRef}>
          <button
            type="button"
            className={`mewmo-list-title ${titleMenuOpen ? "mewmo-list-title--open" : ""}`}
            onClick={() => setTitleMenuOpen((value) => !value)}
          >
            <span>{title}</span>
            <PrototypeIcon name="caret" size={13} className="mewmo-list-title__caret" />
          </button>
          <FloatingMenu open={titleMenuOpen} className="mewmo-list-title-menu">
            <div className="mewmo-menu-label">排序</div>
            <FloatingMenuButton onClick={() => changeSort("updated")}>
              <span>最近更新</span>
              {sortMode === "updated" && <PrototypeIcon name="check" size={14} />}
            </FloatingMenuButton>
            <FloatingMenuButton onClick={() => changeSort("created")}>
              <span>最新创建</span>
              {sortMode === "created" && <PrototypeIcon name="check" size={14} />}
            </FloatingMenuButton>
            <div className="mewmo-menu-separator" />
            <div className="mewmo-menu-label">快速切换</div>
            <Link href="/notes" className="mewmo-floating-menu__item" onClick={() => setTitleMenuOpen(false)}>
              <PrototypeIcon name="note" size={15} /> 笔记
            </Link>
            <Link href="/clips" className="mewmo-floating-menu__item" onClick={() => setTitleMenuOpen(false)}>
              <PrototypeIcon name="bookmark" size={15} /> 剪藏
            </Link>
          </FloatingMenu>
        </div>
        <div className="mewmo-list-column__spacer" />
        {action}
        {clipUrlInput && (
          <button type="button" className="mewmo-icon-button mewmo-list-column__clip-button" onClick={() => setClipInputOpen(true)} aria-label="添加剪藏">
            <PrototypeIcon name="plus" size={17} />
          </button>
        )}
        <button type="button" className="mewmo-icon-button mewmo-list-column__search-button" onClick={() => setSearchOpen(true)} aria-label="搜索列表">
          <PrototypeIcon name="search" size={17} />
        </button>

        <div className="mewmo-list-search" ref={searchWrapRef}>
          <span className="mewmo-list-field">
            <PrototypeIcon name="search" size={16} />
            <input
              autoFocus={searchOpen}
              type="search"
              value={searchQuery}
              placeholder={searchPlaceholder}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                onSearchChange?.(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") closeSearch();
              }}
            />
          </span>
        </div>

        <div className="mewmo-clip-url" ref={clipWrapRef}>
          <span className="mewmo-list-field">
            <PrototypeIcon name="plus" size={16} />
            <input
              autoFocus={clipInputOpen}
              type="url"
              value={clipUrl}
              placeholder="粘贴链接，回车收藏..."
              onChange={(event) => setClipUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setClipInputOpen(false);
                if (event.key === "Enter") submitClip();
              }}
            />
          </span>
          <button type="button" onClick={submitClip} aria-label="保存剪藏链接">
            <PrototypeIcon name="chev-right" size={16} />
          </button>
        </div>
      </div>
      <div ref={bodyRef} className="mewmo-list-column__body">
        {children}
      </div>
    </section>
  );
}
