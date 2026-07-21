"use client";

import type { CSSProperties } from "react";
import { useDeferredVisibility } from "../../lib/use-deferred-visibility";

export type ListSkeletonVariant = "text" | "media" | "mixed";

interface ListContentSkeletonProps {
  active?: boolean;
  label?: string;
  count?: number;
  /** Shared 0–1 progress for one continuous left→right sweep. */
  progress?: number;
  /** text: notes-like; media: clip/feed with cover; mixed: today/knowledge */
  variant?: ListSkeletonVariant;
}

function cardMediaKind(
  variant: ListSkeletonVariant,
  index: number,
): "none" | "cover" | "thumbs" {
  if (variant === "media") return "cover";
  if (variant === "mixed") {
    if (index % 3 === 0) return "cover";
    if (index % 3 === 1) return "thumbs";
    return "none";
  }
  return index % 4 === 1 ? "thumbs" : "none";
}

export function ListContentSkeleton({
  active = true,
  label = "正在加载列表",
  count = 5,
  progress = 0,
  variant = "text",
}: ListContentSkeletonProps) {
  const visible = useDeferredVisibility(active);
  if (!visible) return null;

  return (
    <div
      className={`mewmo-list-content-skeleton mewmo-list-content-skeleton--${variant} mewmo-skeleton-sweep`}
      style={{ "--skeleton-p": String(progress) } as CSSProperties}
      aria-busy="true"
      aria-label={label}
    >
      {Array.from({ length: count }, (_, index) => {
        const media = cardMediaKind(variant, index);
        return (
          <div
            key={index}
            className={`mewmo-list-content-skeleton__card${media === "cover" ? " mewmo-list-content-skeleton__card--cover" : ""}`}
          >
            <span className="mewmo-skeleton-block mewmo-list-content-skeleton__title" />
            <span className="mewmo-skeleton-block mewmo-list-content-skeleton__line" />
            <span className="mewmo-skeleton-block mewmo-list-content-skeleton__line mewmo-list-content-skeleton__line--mid" />
            {media === "cover" ? (
              <span className="mewmo-skeleton-block mewmo-list-content-skeleton__cover" />
            ) : null}
            {media === "thumbs" ? (
              <div className="mewmo-list-content-skeleton__thumbs" aria-hidden="true">
                <span className="mewmo-skeleton-block mewmo-list-content-skeleton__thumb" />
                <span className="mewmo-skeleton-block mewmo-list-content-skeleton__thumb" />
                <span className="mewmo-skeleton-block mewmo-list-content-skeleton__thumb" />
              </div>
            ) : null}
            <span className="mewmo-skeleton-block mewmo-list-content-skeleton__meta" />
          </div>
        );
      })}
    </div>
  );
}
