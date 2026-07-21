export function WorkspaceRouteLoading() {
  return (
    <div className="mewmo-workspace mewmo-workspace-route-loading" aria-label="正在加载工作区">
      <aside className="mewmo-workspace-route-loading__list" aria-hidden="true">
        <span className="mewmo-skeleton-block mewmo-workspace-route-loading__heading" />
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className={`mewmo-workspace-route-loading__card${index % 2 === 0 ? " mewmo-workspace-route-loading__card--cover" : ""}`}
          >
            <span className="mewmo-skeleton-block mewmo-workspace-route-loading__card-title" />
            <span className="mewmo-skeleton-block mewmo-workspace-route-loading__card-line" />
            <span className="mewmo-skeleton-block mewmo-workspace-route-loading__card-line mewmo-workspace-route-loading__card-line--mid" />
            {index % 2 === 0 ? (
              <span className="mewmo-skeleton-block mewmo-workspace-route-loading__card-cover" />
            ) : (
              <div className="mewmo-workspace-route-loading__card-thumbs">
                <span className="mewmo-skeleton-block mewmo-workspace-route-loading__card-thumb" />
                <span className="mewmo-skeleton-block mewmo-workspace-route-loading__card-thumb" />
              </div>
            )}
            <span className="mewmo-skeleton-block mewmo-workspace-route-loading__card-meta" />
          </div>
        ))}
      </aside>
      <section className="mewmo-workspace-route-loading__reader" aria-hidden="true">
        <span className="mewmo-skeleton-block mewmo-workspace-route-loading__reader-title" />
        <span className="mewmo-skeleton-block mewmo-workspace-route-loading__reader-line mewmo-workspace-route-loading__reader-line--full" />
        <span className="mewmo-skeleton-block mewmo-workspace-route-loading__reader-line mewmo-workspace-route-loading__reader-line--wide" />
        <span className="mewmo-skeleton-block mewmo-workspace-route-loading__media" />
        <span className="mewmo-skeleton-block mewmo-workspace-route-loading__reader-line mewmo-workspace-route-loading__reader-line--mid" />
        <span className="mewmo-skeleton-block mewmo-workspace-route-loading__reader-line mewmo-workspace-route-loading__reader-line--short" />
      </section>
    </div>
  );
}
