"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type RefObject,
} from "react";

import {
  activeTocIndexFromHeadingTops,
  tocScrollTopForHeading,
  type NoteTocItem,
} from "../../lib/note-toc";

const TOC_JUMP_LOCK_MS = 1_800;
const TOC_HEADING_TOP_GAP = 18;

interface ReaderTocProps {
  items: NoteTocItem[];
  scrollRef: RefObject<HTMLElement | null>;
  headingSelector: string;
  ariaLabel: string;
  minItems?: number;
}

export function ReaderToc({
  items,
  scrollRef,
  headingSelector,
  ariaLabel,
  minItems = 1,
}: ReaderTocProps) {
  const tocJumpRef = useRef<{
    index: number;
    targetTop: number;
    timeout: ReturnType<typeof setTimeout>;
  } | null>(null);
  const [activeToc, setActiveToc] = useState(0);

  const getRenderedHeadings = useCallback(() => {
    const reader = scrollRef.current;
    if (!reader) return [];
    return Array.from(reader.querySelectorAll<HTMLElement>(headingSelector));
  }, [headingSelector, scrollRef]);

  const getScrollContentTopOffset = useCallback(() => {
    const reader = scrollRef.current;
    if (!reader) return 0;
    const paddingTop = Number.parseFloat(window.getComputedStyle(reader).paddingTop) || 0;
    return paddingTop + TOC_HEADING_TOP_GAP;
  }, [scrollRef]);

  const settlePendingJump = useCallback(() => {
    const pendingJump = tocJumpRef.current;
    if (!pendingJump) return;
    clearTimeout(pendingJump.timeout);
    tocJumpRef.current = null;
    setActiveToc(pendingJump.index);
  }, []);

  const updateTocFromScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || items.length < minItems) return;

    const pendingJump = tocJumpRef.current;
    if (pendingJump) {
      setActiveToc(pendingJump.index);
      if (Math.abs(el.scrollTop - pendingJump.targetTop) <= 2) {
        settlePendingJump();
      }
      return;
    }

    const headings = getRenderedHeadings();
    if (headings.length === 0) return;

    const readerTop = el.getBoundingClientRect().top;
    const activeIndex = activeTocIndexFromHeadingTops({
      containerTop: readerTop,
      headingTops: headings.map((heading) => heading.getBoundingClientRect().top),
      topOffset: getScrollContentTopOffset(),
    });
    setActiveToc(Math.min(items.length - 1, activeIndex));
  }, [getRenderedHeadings, getScrollContentTopOffset, items.length, minItems, scrollRef, settlePendingJump]);

  useEffect(() => {
    setActiveToc(0);
    if (tocJumpRef.current) {
      clearTimeout(tocJumpRef.current.timeout);
      tocJumpRef.current = null;
    }
  }, [items]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || items.length < minItems) return;

    updateTocFromScroll();
    el.addEventListener("scroll", updateTocFromScroll, { passive: true });
    el.addEventListener("scrollend", settlePendingJump);
    return () => {
      el.removeEventListener("scroll", updateTocFromScroll);
      el.removeEventListener("scrollend", settlePendingJump);
    };
  }, [items.length, minItems, scrollRef, settlePendingJump, updateTocFromScroll]);

  useEffect(() => {
    return () => {
      if (tocJumpRef.current) clearTimeout(tocJumpRef.current.timeout);
    };
  }, []);

  const previewTocSelection = (event: MouseEvent<HTMLButtonElement>, index: number) => {
    event.preventDefault();
    setActiveToc(index);
  };

  const jumpToToc = (index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const heading = getRenderedHeadings()[index];
    if (!heading) return;

    const readerRect = el.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    const targetTop = tocScrollTopForHeading({
      containerTop: readerRect.top,
      headingTop: headingRect.top,
      maxScrollTop: el.scrollHeight - el.clientHeight,
      scrollTop: el.scrollTop,
      topOffset: getScrollContentTopOffset(),
    });
    if (tocJumpRef.current) clearTimeout(tocJumpRef.current.timeout);
    tocJumpRef.current = {
      index,
      targetTop,
      timeout: setTimeout(() => {
        settlePendingJump();
      }, TOC_JUMP_LOCK_MS),
    };
    setActiveToc(index);
    el.scrollTo({
      top: targetTop,
      behavior: "smooth",
    });
  };

  if (items.length < minItems) return null;

  return (
    <nav className="mewmo-doc-toc" aria-label={ariaLabel}>
      <div className="mewmo-doc-toc__bars">
        {items.map((item, index) => (
          <button
            key={`${item.id}-bar`}
            type="button"
            className={`mewmo-doc-toc__bar ${activeToc === index ? "mewmo-doc-toc__bar--active" : ""}`}
            style={{ width: `${item.level === 1 ? 22 : item.level === 2 ? 15 : 10}px` }}
            onMouseDown={(event) => previewTocSelection(event, index)}
            onClick={() => jumpToToc(index)}
            aria-label={item.title}
          />
        ))}
      </div>
      <div className="mewmo-doc-toc__links">
        {items.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className={`mewmo-doc-toc__link mewmo-doc-toc__link--level-${item.level} ${activeToc === index ? "mewmo-doc-toc__link--active" : ""}`}
            onMouseDown={(event) => previewTocSelection(event, index)}
            onClick={() => jumpToToc(index)}
          >
            {item.title}
          </button>
        ))}
      </div>
    </nav>
  );
}
