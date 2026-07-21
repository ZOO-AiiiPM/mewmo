export type ListSkeletonVariant = "text" | "media" | "mixed";

interface ListContentSkeletonProps {
  active?: boolean;
  label?: string;
  count?: number;
  /** text: notes; media: clips/feeds; mixed: today/knowledge/trash */
  variant?: ListSkeletonVariant;
}

type SkeletonMedia = "none" | "cover" | "thumbs";

const mediaPatterns: Record<ListSkeletonVariant, readonly SkeletonMedia[]> = {
  text: ["none", "none", "thumbs", "none", "none", "none"],
  media: ["cover", "none", "cover", "none", "none", "cover"],
  mixed: ["none", "cover", "thumbs", "none", "cover", "none"],
};

function cardMediaKind(
  variant: ListSkeletonVariant,
  index: number,
): SkeletonMedia {
  const pattern = mediaPatterns[variant];
  return pattern[index % pattern.length] ?? "none";
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
      role="status"
      aria-busy="true"
      aria-label={label}
    >
      {Array.from({ length: count }, (_, index) => {
        const media = cardMediaKind(variant, index);
        const showsSourceIcon = variant !== "text";

        return (
          <div key={index} className="mewmo-list-card-wrap" aria-hidden="true">
            <div className="mewmo-list-card mewmo-list-card--skeleton">
              <div className="mewmo-list-card__title">
                <i className="mewmo-skeleton-block mewmo-list-card-skeleton__title" />
              </div>

              <div className="mewmo-list-card-skeleton__preview">
                <i className="mewmo-skeleton-block mewmo-list-card-skeleton__line" />
                <i className="mewmo-skeleton-block mewmo-list-card-skeleton__line mewmo-list-card-skeleton__line--short" />
              </div>

              {media === "cover" ? (
                <div className="mewmo-list-card__cover mewmo-skeleton-block" />
              ) : null}

              {media === "thumbs" ? (
                <div className="mewmo-list-card__thumbs">
                  <i className="mewmo-list-card__thumb mewmo-skeleton-block" />
                  <i className="mewmo-list-card__thumb mewmo-skeleton-block" />
                </div>
              ) : null}

              <div
                className={
                  showsSourceIcon
                    ? "mewmo-list-card__source mewmo-list-card-skeleton__meta"
                    : "mewmo-list-card__meta mewmo-list-card-skeleton__meta"
                }
              >
                {showsSourceIcon ? (
                  <i className="mewmo-skeleton-block mewmo-list-card-skeleton__source-icon" />
                ) : null}
                <i className="mewmo-skeleton-block mewmo-list-card-skeleton__source" />
                <i className="mewmo-skeleton-block mewmo-list-card-skeleton__time" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
