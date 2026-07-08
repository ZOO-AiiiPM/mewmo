"use client";

import { usePathname } from "next/navigation";
import type { ReactNode, Ref } from "react";
import { useEffect, useRef, useState } from "react";
import { useRememberedWorkspaceHref } from "../../lib/workspace-memory";
import { FloatingMenu, FloatingMenuLink } from "../ui/FloatingMenu";
import { useToast } from "../ui/ToastProvider";
import { PrototypeIcon } from "./PrototypeIcon";

interface ListColumnProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  quickSwitch?: ReactNode;
  titleMenuLabel?: string;
  bodyRef?: Ref<HTMLDivElement>;
  searchPlaceholder?: string;
  clipUrlInput?: boolean;
  onSubmitClipUrl?: (url: string) => void;
  onSearchChange?: (query: string) => void;
}

function trimUrlToken(value: string) {
  return value.replace(/[),，。；;、]+$/u, "");
}

function extractClipboardUrl(text: string) {
  const explicitUrl = text.match(/https?:\/\/[^\s<>"']+/iu)?.[0];
  if (explicitUrl) return trimUrlToken(explicitUrl);

  const tokens = text
    .split(/\s+/u)
    .map((token) => trimUrlToken(token.trim()))
    .filter(Boolean);

  for (const token of tokens) {
    if (token.includes("@")) continue;
    if (/^(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>"']*)?$/iu.test(token)) {
      return `https://${token}`;
    }
  }

  return null;
}

export function ListColumn({
  title,
  action,
  children,
  quickSwitch,
  titleMenuLabel = "快速切换",
  bodyRef,
  searchPlaceholder = "搜索当前列表...",
  clipUrlInput = false,
  onSubmitClipUrl,
  onSearchChange,
}: ListColumnProps) {
  const { showToast } = useToast();
  const pathname = usePathname();
  const [titleMenuOpen, setTitleMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [clipInputOpen, setClipInputOpen] = useState(false);
  const [clipUrl, setClipUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const clipWrapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const clipInputRef = useRef<HTMLInputElement>(null);
  const titleButtonRef = useRef<HTMLButtonElement>(null);
  const rememberedNotesHref = useRememberedWorkspaceHref("notes", "/notes");
  const rememberedClipsHref = useRememberedWorkspaceHref("clips", "/clips");
  const isNotesSection = pathname === "/notes" || pathname.startsWith("/notes/");
  const isClipsSection = pathname === "/clips" || pathname.startsWith("/clips/");

  useEffect(() => {
    function handlePointer(event: MouseEvent) {
      const target = event.target as Node;
      if (searchOpen && searchWrapRef.current && !searchWrapRef.current.contains(target)) {
        closeSearch();
      }
      if (clipInputOpen && clipWrapRef.current && !clipWrapRef.current.contains(target)) {
        setClipInputOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointer);
    return () => document.removeEventListener("mousedown", handlePointer);
  }, [clipInputOpen, searchOpen]);

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

  const openClipInput = async () => {
    if (clipInputOpen) {
      setClipInputOpen(false);
      return;
    }
    closeSearch();
    setClipInputOpen(true);
    const clipboardText = await navigator.clipboard?.readText().catch(() => null);
    const clipboardUrl = clipboardText ? extractClipboardUrl(clipboardText) : null;
    if (clipboardUrl) setClipUrl(clipboardUrl);
  };

  useEffect(() => {
    if (!searchOpen) return;
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [searchOpen]);

  useEffect(() => {
    if (!clipInputOpen) return;
    const timer = window.setTimeout(() => {
      clipInputRef.current?.focus();
      clipInputRef.current?.select();
    }, 80);
    return () => window.clearTimeout(timer);
  }, [clipInputOpen]);

  return (
    <section className={`mewmo-list-column ${searchOpen ? "mewmo-list-column--searching" : ""} ${clipInputOpen ? "mewmo-list-column--clip-input" : ""}`}>
      <div className="mewmo-list-column__bar">
        <div className="mewmo-list-title-wrap">
          <button
            ref={titleButtonRef}
            type="button"
            className={`mewmo-list-title ${titleMenuOpen ? "mewmo-list-title--open" : ""}`}
            onClick={() => setTitleMenuOpen((value) => !value)}
            aria-haspopup="menu"
            aria-expanded={titleMenuOpen}
          >
            <span>{title}</span>
            <PrototypeIcon name="caret" size={13} className="mewmo-list-title__caret" />
          </button>
          <FloatingMenu
            open={titleMenuOpen}
            anchorRef={titleButtonRef}
            onOpenChange={setTitleMenuOpen}
            boundary="main"
            className="mewmo-list-title-menu"
          >
            <div className="mewmo-menu-label">{titleMenuLabel}</div>
            {quickSwitch ?? (
              <>
                {!isNotesSection && (
                  <FloatingMenuLink
                    href={rememberedNotesHref}
                    icon="note"
                    scroll={false}
                    onClick={() => setTitleMenuOpen(false)}
                  >
                    笔记
                  </FloatingMenuLink>
                )}
                {!isClipsSection && (
                  <FloatingMenuLink
                    href={rememberedClipsHref}
                    icon="bookmark"
                    scroll={false}
                    onClick={() => setTitleMenuOpen(false)}
                  >
                    剪藏
                  </FloatingMenuLink>
                )}
              </>
            )}
          </FloatingMenu>
        </div>
        <div className="mewmo-list-column__spacer" />
        {action}
        {clipUrlInput && (
          <>
            <button
              type="button"
              className={`mewmo-icon-button mewmo-list-column__clip-button ${clipInputOpen ? "mewmo-icon-button--active" : ""}`}
              onClick={() => void openClipInput()}
              aria-label="添加剪藏"
            >
              <PrototypeIcon name="plus" size={17} />
            </button>
            <div className="mewmo-clip-url" ref={clipWrapRef}>
              <span className="mewmo-clip-url__field">
                <PrototypeIcon name="plus" size={16} />
                <input
                  ref={clipInputRef}
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
              <button type="button" className="mewmo-clip-url__submit" onClick={submitClip} aria-label="保存剪藏链接">
                <PrototypeIcon name="chev-right" size={16} />
              </button>
            </div>
          </>
        )}
        <button type="button" className="mewmo-icon-button mewmo-list-column__search-button" onClick={() => {
          setClipInputOpen(false);
          setSearchOpen(true);
        }} aria-label="搜索列表">
          <PrototypeIcon name="search" size={17} />
        </button>

        <div className="mewmo-list-search" ref={searchWrapRef}>
          <span className="mewmo-list-field">
            <PrototypeIcon name="search" size={16} />
            <input
              ref={searchInputRef}
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

      </div>
      <div ref={bodyRef} className="mewmo-list-column__body">
        {children}
      </div>
    </section>
  );
}
