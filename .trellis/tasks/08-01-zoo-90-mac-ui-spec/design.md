# Design

## Deliverable

唯一规范文件为 `.trellis/spec/apple/mac-ui.md`。如 Apple spec 尚无索引，则新增 `.trellis/spec/apple/index.md`，并从 `.trellis/spec/dev-apple.md` 链接；禁止复制出第二份 token 表。

## Evidence Model

- 结构事实：`AppShell`、`Sidebar`、`ListColumn`、notes/clips/feeds 页面和 reader/editor 组件。
- 视觉事实：`apps/web/src/app/globals.css` 及组件 class。
- 行为事实：组件事件处理、loading/empty/error 分支和现有测试。
- 每条规则标注 `Web parity`、`Semantic parity`、`macOS native` 或 `Apple enhancement`。

## Spec Shape

1. Scope and terminology
2. Window and column model
3. Theme/design tokens, including the grayscale-only light palette
4. Top tab strip and per-tab page state
5. Navigation and selection
6. Notes state matrix
7. Clips state matrix
8. Feeds/feed entries state matrix
9. Toolbar, menu, keyboard and focus
10. Loading, empty, error, offline and stale states
11. Accessibility and motion
12. Downstream acceptance checklist
13. Source anchors and drift-check commands

## Compatibility

The spec targets macOS 14+ and the shared SwiftUI architecture established by ZOO-87. It describes behavior without coupling downstream code to React, Tailwind or CSS class names.

The tab strip is an Apple-only product enhancement. It is an in-window workspace tab model, not macOS multi-window system tabbing and not a Web parity claim. Each tab owns its route/page identity and navigation selection so switching tabs does not overwrite another tab's context.

Persist only versioned, Codable tab descriptors and the active-tab id, scoped by authenticated account. Restore them after normal relaunch. Logout/account switch clears the previous scope. A missing or deleted content target restores as an unavailable placeholder that can be closed; one invalid descriptor must not discard the remaining workspace.

## Risks

- Web values can drift after this audit. Mitigation: source anchors and drift-check commands.
- Pixel copying can conflict with native macOS ergonomics. Mitigation: classify every mapping and prefer native focus/menu/window behavior.
- AI shell code is present on Web but excluded from Apple v1. Mitigation: explicitly mark it non-target behavior.
- Restored content may have been deleted or become inaccessible. Mitigation: versioned descriptors, per-tab tolerant decoding and a closeable unavailable state.
