"use client";

export type ListSkeletonVariant = "text" | "media" | "mixed";

interface ListContentSkeletonProps {
  active?: boolean;
  label?: string;
  count?: number;
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
  count = 6,
  variant = "text",
}: ListContentSkeletonProps) {
  if (!active) return null;

  return (
    <div
      className={`mewmo-list-content-skeleton mewmo-list-content-skeleton--${variant}`}
      aria-busy="true"
      aria-label={label}
    >
      {Array.from({ length: count }, (_, index) => {
        const media = cardMediaKind(variant, index);
        return (
          <div
            key={index}
            className={`mewmo-list-content-skeleton__card${
              media === "cover"
                ? " mewmo-list-content-skeleton__card--cover"
                : media === "thumbs"
                  ? " mewmo-list-content-skeleton__card--thumbs"
                  : ""
            }`}
          >
            <span className="mewmo-skeleton-block mewmo-list-content-skeleton__title" />
            <span className="mewmo-skeleton-block mewmo-list-content-skeleton__preview" />
            <span className="mewmo-skeleton-block mewmo-list-content-skeleton__preview mewmo-list-content-skeleton__preview--short" />
            {media === "cover" ? (
              <span className="mewmo-skeleton-block mewmo-list-content-skeleton__cover" />
            ) : null}
            {media === "thumbs" ? (
              <div className="mewmo-list-content-skeleton__thumbs" aria-hidden="true">
                <span className="mewmo-skeleton-block mewmo-list-content-skeleton__thumb" />
                <span className="mewmo-skeleton-block mewmo-list-content-skeleton__thumb" />
              </div>
            ) : null}
            <div className="mewmo-list-content-skeleton__meta-row" aria-hidden="true">
              <span className="mewmo-skeleton-block mewmo-list-content-skeleton__meta mewmo-list-content-skeleton__meta--icon" />
              <span className="mewmo-skeleton-block mewmo-list-content-skeleton__meta mewmo-list-content-skeleton__meta--source" />
              <span className="mewmo-skeleton-block mewmo-list-content-skeleton__meta mewmo-list-content-skeleton__meta--time" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
