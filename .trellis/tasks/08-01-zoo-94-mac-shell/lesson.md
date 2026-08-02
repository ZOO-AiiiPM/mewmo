# Lessons: ZOO-94 Mac Shell 与导航

This file captures raw observations from this task. Keep evidence and uncertainty visible; a later curation pass promotes durable guidance into `.trellis/spec/`.

## Observations

- `NavigationSplitView` plus `List(selection:)`, `.redacted`, `ContentUnavailableView`, and `.toolbar` cover the Shell without a custom split view or state framework.
- `Mewmo-Tests` must explicitly include `Sources/MacShell`; keeping the file behind `#if os(macOS)` preserves the shared iOS source tree without shipping a partial iOS shell.
- ZOO-90 dark tokens are neutral blue-gray rather than mathematically equal RGB channels; the focused guard therefore permits a maximum channel spread of 9 while rejecting warm drift.
- The generated app launched with both `-mac-shell-theme light` and `-mac-shell-theme dark`; Window Server reported the expected 1240 x 760pt default window. This AO session lacks Screen Recording and Assistive Access, so pixel screenshot and accessibility-tree inspection could not run here.
- ZOO-122 review corrected the scope: ZOO-90 §4/§12 tab strip is part of this Shell. The implementation keeps descriptors in memory only; account-scoped restore, logout clearing, and unavailable-tab recovery remain explicitly unimplemented.
- XcodeGen snapshots individual Swift files into `Mewmo.xcodeproj`; adding `MacShellWorkspace.swift` under an already-listed source directory still requires `make generate` before the test target sees it.
- After the tab-strip update, both light/dark launches succeeded. Window Server restored a prior 1116 x 685pt window (above the 990 x 480pt minimum); this session still cannot capture pixels or inspect the accessibility tree.
