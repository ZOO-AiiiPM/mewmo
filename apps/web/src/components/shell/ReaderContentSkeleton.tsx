"use client";

interface ReaderContentSkeletonProps {
  active?: boolean;
  label?: string;
  showTitle?: boolean;
}

/** Full-page reader placeholder: title + meta + body lines fill the scroll area. */
export function ReaderContentSkeleton({
  active = true,
  label = "正在加载内容",
  showTitle = true,
}: ReaderContentSkeletonProps) {
  if (!active) return null;

  return (
    <div
      className="mewmo-reader-content-skeleton"
      aria-busy="true"
      aria-label={label}
    >
      {showTitle ? (
        <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__title" />
      ) : null}
      <div className="mewmo-reader-content-skeleton__meta-row" aria-hidden="true">
        <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__meta-chip" />
        <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__meta-chip mewmo-reader-content-skeleton__meta-chip--mid" />
        <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__meta-chip mewmo-reader-content-skeleton__meta-chip--short" />
      </div>
      <span className="mewmo-reader-content-skeleton__gap" aria-hidden="true" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--full" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--full" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--wide" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--mid" />
      <span className="mewmo-reader-content-skeleton__gap" aria-hidden="true" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__media" />
      <span className="mewmo-reader-content-skeleton__gap" aria-hidden="true" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--full" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--full" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--wide" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--full" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--mid" />
      <span className="mewmo-reader-content-skeleton__gap" aria-hidden="true" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--full" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--wide" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--full" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--short" />
      <span className="mewmo-reader-content-skeleton__gap" aria-hidden="true" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--full" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--full" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--wide" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--mid" />
      <span className="mewmo-skeleton-block mewmo-reader-content-skeleton__line mewmo-reader-content-skeleton__line--tiny" />
    </div>
  );
}
