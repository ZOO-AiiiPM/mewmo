"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  extractClipBodyHtml,
  isLightNeutralInlineColor,
  isNeutralInlineColor,
  sanitizeClipHtml,
} from "../../lib/clip-content";

interface ClipContentRendererProps {
  html: string;
  sourceUrl: string;
  contentKey: string;
  loading?: boolean;
}

export function ClipContentRenderer({
  html,
  sourceUrl,
  contentKey,
  loading = false,
}: ClipContentRendererProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const contentHtml = useMemo(() => {
    if (!html) return "";
    return sanitizeClipHtml(extractClipBodyHtml(html), sourceUrl, {
      proxyImages: true,
    });
  }, [html, sourceUrl]);

  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;

    const applyInlineColors = () => {
      const isDark = document.documentElement.classList.contains("dark");
      root.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
        if (element.dataset.origColor === undefined) {
          element.dataset.origColor = element.style.color || "";
        }
        if (element.dataset.origBackground === undefined) {
          element.dataset.origBackground = element.style.background || "";
        }
        if (element.dataset.origBackgroundColor === undefined) {
          element.dataset.origBackgroundColor = element.style.backgroundColor || "";
        }
        const originalColor = element.dataset.origColor || "";
        const originalBackground = element.dataset.origBackground || "";
        const originalBackgroundColor =
          element.dataset.origBackgroundColor || "";
        element.style.color =
          isDark && isNeutralInlineColor(originalColor) ? "" : originalColor;
        element.style.background =
          isDark && isLightNeutralInlineColor(originalBackground)
            ? "transparent"
            : originalBackground;
        element.style.backgroundColor =
          isDark && isLightNeutralInlineColor(originalBackgroundColor)
            ? "transparent"
            : originalBackgroundColor;
      });
    };

    applyInlineColors();
    const themeObserver = new MutationObserver(applyInlineColors);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    const contentObserver = new MutationObserver(applyInlineColors);
    contentObserver.observe(root, { childList: true, subtree: true });

    return () => {
      themeObserver.disconnect();
      contentObserver.disconnect();
    };
  }, [contentKey, contentHtml]);

  if (loading && !contentHtml) {
    return (
      <div className="mewmo-empty-state" aria-live="polite">
        <span className="mewmo-spinner" aria-hidden="true" />
        <p>正在加载正文...</p>
      </div>
    );
  }

  if (!contentHtml) {
    return <p className="mewmo-clip-prose__empty">暂无正文内容</p>;
  }

  return (
    <div
      ref={contentRef}
      className="mewmo-clip-prose"
      dangerouslySetInnerHTML={{ __html: contentHtml }}
    />
  );
}
