# Codebase Research

Baseline: `origin/main@ede90619`.

- `apps/web/src/components/shell/AppShell.tsx`: shell composition, sidebar collapse/peek, optional AI rail and width constraints.
- `apps/web/src/components/shell/Sidebar.tsx`: navigation hierarchy, feeds/knowledge drill-in, selection and account controls.
- `apps/web/src/components/shell/ListColumn.tsx`: list toolbar, quick switch, search and clip URL entry behavior.
- `apps/web/src/app/globals.css`: dark/light tokens and concrete shell/list/reader styling.
- `apps/web/src/app/(app)/notes`, `clips`, `feeds`, `feed-entries`: page ownership and state branches.
- `.trellis/spec/dev-apple.md`: macOS 14+/iOS 17+, shared SwiftUI sources, Apple v1 excludes AI.

User-owned Apple deltas not derivable from Web: light mode is grayscale-only; Mac adds a top `+` tab strip for switching among multiple pages. Tabs restore after normal relaunch and clear on logout/account switch. These must be labeled Apple enhancements in the final spec.

The implementation worker must refresh line anchors against its rebased HEAD rather than copying stale line numbers from this note.
