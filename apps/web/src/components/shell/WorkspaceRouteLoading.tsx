export function WorkspaceRouteLoading() {
  return (
    <div className="mewmo-workspace mewmo-workspace-route-loading" aria-label="正在加载工作区">
      <aside className="mewmo-workspace-route-loading__list" aria-hidden="true">
        <span className="mewmo-workspace-route-loading__line mewmo-workspace-route-loading__line--title" />
        {Array.from({ length: 5 }, (_, index) => (
          <span key={index} className="mewmo-workspace-route-loading__card" />
        ))}
      </aside>
      <section className="mewmo-workspace-route-loading__reader" aria-hidden="true">
        <span className="mewmo-workspace-route-loading__line mewmo-workspace-route-loading__line--heading" />
        <span className="mewmo-workspace-route-loading__line" />
        <span className="mewmo-workspace-route-loading__line" />
        <span className="mewmo-workspace-route-loading__line mewmo-workspace-route-loading__line--short" />
      </section>
    </div>
  );
}
