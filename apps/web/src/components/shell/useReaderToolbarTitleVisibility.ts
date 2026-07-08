"use client";

import { useCallback, useEffect, useState, type RefObject } from "react";
import { shouldRevealReaderToolbarTitle } from "../../lib/reader-toolbar-state";

interface UseReaderToolbarTitleVisibilityInput {
  scrollRef: RefObject<HTMLElement | null>;
  threshold?: number;
}

export function useReaderToolbarTitleVisibility({
  scrollRef,
  threshold = 18,
}: UseReaderToolbarTitleVisibilityInput) {
  const [toolbarTitleVisible, setToolbarTitleVisible] = useState(false);

  const updateToolbarTitleVisibility = useCallback(() => {
    const reader = scrollRef.current;
    if (!reader) {
      setToolbarTitleVisible(false);
      return;
    }

    const sourceTitle = reader.querySelector<HTMLElement>(
      ".mewmo-note-title-editor, .mewmo-document h1",
    );
    const sourceTitleRect = sourceTitle?.getBoundingClientRect();
    const readerRect = reader.getBoundingClientRect();

    setToolbarTitleVisible(
      shouldRevealReaderToolbarTitle({
        scrollTop: reader.scrollTop,
        sourceTitleBottom: sourceTitleRect?.bottom ?? null,
        viewportTop: readerRect.top,
        threshold,
      }),
    );
  }, [scrollRef, threshold]);

  useEffect(() => {
    const reader = scrollRef.current;
    if (!reader) return;

    const animationFrame = window.requestAnimationFrame(updateToolbarTitleVisibility);
    reader.addEventListener("scroll", updateToolbarTitleVisibility, { passive: true });
    window.addEventListener("resize", updateToolbarTitleVisibility);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      reader.removeEventListener("scroll", updateToolbarTitleVisibility);
      window.removeEventListener("resize", updateToolbarTitleVisibility);
    };
  }, [scrollRef, updateToolbarTitleVisibility]);

  return { toolbarTitleVisible, updateToolbarTitleVisibility };
}
