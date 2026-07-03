"use client";

import type { ReactNode, Ref } from "react";
import { useEffect, useRef, useState } from "react";
import { FloatingMenu, FloatingMenuButton } from "../ui/FloatingMenu";
import { useToast } from "../ui/ToastProvider";

interface ListColumnProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  bodyRef?: Ref<HTMLDivElement>;
  searchPlaceholder?: string;
  clipUrlInput?: boolean;
  onSubmitClipUrl?: (url: string) => void;
}

export function ListColumn({
  title,
  action,
  children,
  bodyRef,
  searchPlaceholder = "Search current list...",
  clipUrlInput = false,
  onSubmitClipUrl,
}: ListColumnProps) {
  const { showToast } = useToast();
  const [titleMenuOpen, setTitleMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [clipInputOpen, setClipInputOpen] = useState(false);
  const [clipUrl, setClipUrl] = useState("");
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const clipWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointer(event: MouseEvent) {
      if (searchOpen && searchWrapRef.current && !searchWrapRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
      if (clipInputOpen && clipWrapRef.current && !clipWrapRef.current.contains(event.target as Node)) {
        setClipInputOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointer);
    return () => document.removeEventListener("mousedown", handlePointer);
  }, [clipInputOpen, searchOpen]);

  const submitClip = () => {
    const url = clipUrl.trim();
    if (!url) return;
    onSubmitClipUrl?.(url);
    showToast("Clip URL queued for the dogfood save path.", "success");
    setClipUrl("");
    setClipInputOpen(false);
  };

  return (
    <section className={`mewmo-list-column ${searchOpen ? "mewmo-list-column--searching" : ""} ${clipInputOpen ? "mewmo-list-column--clip-input" : ""}`}>
      <div className="mewmo-list-column__bar">
        <button type="button" className="mewmo-list-title" onClick={() => setTitleMenuOpen((value) => !value)}>
          <span>{title}</span>
          <span aria-hidden="true">⌄</span>
        </button>
        <FloatingMenu open={titleMenuOpen} className="mewmo-list-title-menu">
          <div className="mewmo-menu-label">Sort</div>
          <FloatingMenuButton>Recently updated ✓</FloatingMenuButton>
          <FloatingMenuButton>Newest first</FloatingMenuButton>
          <div className="mewmo-menu-separator" />
          <div className="mewmo-menu-label">Jump</div>
          <FloatingMenuButton>Notes</FloatingMenuButton>
          <FloatingMenuButton>Clips</FloatingMenuButton>
          <FloatingMenuButton>Articles</FloatingMenuButton>
        </FloatingMenu>
        <div className="mewmo-list-column__spacer" />
        {action}
        {clipUrlInput && (
          <button type="button" className="mewmo-icon-button mewmo-list-column__clip-button" onClick={() => setClipInputOpen(true)} aria-label="Add clip URL">
            +
          </button>
        )}
        <button type="button" className="mewmo-icon-button mewmo-list-column__search-button" onClick={() => setSearchOpen(true)} aria-label="Search list">
          /
        </button>

        <div className="mewmo-list-search" ref={searchWrapRef}>
          <input
            autoFocus={searchOpen}
            type="search"
            placeholder={searchPlaceholder}
            onKeyDown={(event) => {
              if (event.key === "Escape") setSearchOpen(false);
            }}
          />
        </div>

        <div className="mewmo-clip-url" ref={clipWrapRef}>
          <input
            autoFocus={clipInputOpen}
            type="url"
            value={clipUrl}
            placeholder="Paste a link and press Enter..."
            onChange={(event) => setClipUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setClipInputOpen(false);
              if (event.key === "Enter") submitClip();
            }}
          />
          <button type="button" onClick={submitClip} aria-label="Queue clip URL">→</button>
        </div>
      </div>
      <div ref={bodyRef} className="mewmo-list-column__body">
        {children}
      </div>
    </section>
  );
}
