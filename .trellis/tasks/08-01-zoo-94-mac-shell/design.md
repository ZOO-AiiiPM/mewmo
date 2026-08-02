# ZOO-94 Mac Shell 设计

## Boundary

`MewmoRootView` 继续作为跨平台入口：macOS 编译 `MacShellView`，iOS 保留既有占位页。Shell 只保存视图本地的 section、列表选择、搜索词、preview state 与主题偏好；没有 repository、网络请求或持久化模型。

## Composition

- `MacShellView.swift` 用 `#if os(macOS)` 收敛 macOS 专属代码，避免 iOS target 获得半成品界面。
- `NavigationSplitView` 的三个 column 分别承载 `List(selection:)` sidebar、可过滤的 mock 列表、detail 容器。原生 split view 负责侧栏显示/隐藏与键盘选择。
- `MacShellPreviewState` 驱动 loaded、loading 与 empty。loading 行/详情调用 `.redacted(reason: .placeholder)`，empty 使用 `ContentUnavailableView`。
- `MacShellPalette` 将 dark/light 的中性 token 集中在同一个文件；SwiftUI `Color` 由 `UInt32` RGB 值构造，避免分散固定颜色。主题菜单通过 `@AppStorage` 和 `.preferredColorScheme` 切换 system/light/dark。
- `MacAppMain` 在 `WindowGroup` 设置默认尺寸与 `.windowResizability(.contentMinSize)`；Shell 自身声明最小尺寸，确保 206 + 312 + 460pt 阅读区地板。

## Interaction

toolbar 只提供本 issue 可独立验收的命令：`Cmd-N` 选择第一条本地预览项，`Cmd-F` 聚焦列表搜索，菜单切换 preview state 与主题。没有业务新增、保存、删除或同步语义。

## Test Shape

将 `Sources/MacShell` 加入既有 `Mewmo-Tests` target。focused XCTest 断言导航 local mock 具有稳定的首选选择，并断言深浅 palette 的 RGB token 为中性灰。视图本身由实际 macOS launch 检查深浅主题和窗口尺寸。

## Deferred

top tab strip、账号 scoped tab restore、真实 loading/error/offline 状态、导航 drill-in 与业务 toolbar 均不在此 diff；现有 ZOO-90 规范仍是它们的行为真相源。
