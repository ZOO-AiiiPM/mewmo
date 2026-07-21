"use client";

import type { CSSProperties } from "react";
import { useDeferredVisibility } from "../../lib/use-deferred-visibility";

interface ReaderContentSkeletonProps {
  active?: boolean;
  label?: string;
  showTitle?: boolean;
  /** Shared 0–1 progress for one continuous left→right sweep. */
  progress?: number;
}

export function ReaderContentSkeleton({
  active = true,
  label = "正在加载内容",
  showTitle = false,
  progress = 0,
}: ReaderContentSkeletonProps) {
  const visible = useDeferredVisibility(active);
  if (!visible) return null;

  return (
    <div
      className="mewmo-reader-content-skeleton mewmo-skeleton-sweep"
      style={{ "--skeleton-p": String(progress) } as CSSProperties}
      aria-busy="true"
      aria-label={label}
    >
      {showTitle ? (
        <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__title" />
      ) : null}
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__meta" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--full" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--wide" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--mid" />
      <span className="mewmo-reader-content-skeleton__gap" aria-hidden="true" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__media" />
      <span className="mewmo-reader-content-skeleton__gap" aria-hidden="true" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--full" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--wide" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--short" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--tiny" />
    </div>
  );
}
