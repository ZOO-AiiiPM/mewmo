import { ListContentSkeleton } from "./ListContentSkeleton";
import { ReaderContentSkeleton } from "./ReaderContentSkeleton";

/** Full workspace chrome in loading form — no bare canvas layer. */
export function WorkspaceRouteLoading() {
  return (
    <div
      className="mewmo-workspace mewmo-workspace-route-loading"
      aria-busy="true"
      aria-label="正在加载工作区"
    >
      <aside className="mewmo-list-column" aria-hidden="true">
        <div className="mewmo-list-column__bar">
          <span className="mewmo-skeleton-block mewmo-workspace-route-loading__heading" />
          <span className="mewmo-list-column__spacer" />
          <span className="mewmo-skeleton-block mewmo-workspace-route-loading__bar-action" />
        </div>
        <div className="mewmo-list-column__body">
          <ListContentSkeleton active variant="mixed" label="正在加载列表" />
        </div>
      </aside>
      <section className="mewmo-reader-surface" aria-hidden="true">
        <div className="mewmo-reader-toolbar">
          <span className="mewmo-skeleton-block mewmo-workspace-route-loading__toolbar-title" />
        </div>
        <div className="mewmo-reader-scroll">
          <ReaderContentSkeleton active showTitle label="正在加载内容" />
        </div>
      </section>
    </div>
  );
}
