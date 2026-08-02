# ZOO-94 最小方案调研

## 结论

使用 SwiftUI 原生 `NavigationSplitView`、`List(selection:)`、`.redacted`、`ContentUnavailableView` 和 `.toolbar`。它们已覆盖三栏、自带选择/焦点、加载骨架、空态和键盘快捷键，不需要自定义 split view、状态框架或第三方依赖。

| 问题 | 候选 | 决定 | 原因 |
| --- | --- | --- | --- |
| 三栏 Shell | `NavigationSplitView` / 手写 `HSplitView` | `NavigationSplitView` | 原生支持 sidebar/content/detail 和 column width；减少折叠、焦点与可访问性代码。 |
| 空态 | `ContentUnavailableView` / 自绘空态 | `ContentUnavailableView` | macOS 14+ 可用，统一系统语义与辅助功能。 |
| loading/toolbar | `.redacted` + `.toolbar` / 自定义 shimmer 与命令层 | 原生 modifiers | placeholder 和快捷键已由框架处理；Shell 无须引入动画或全局 command store。 |

## Sources

- Apple: [NavigationSplitView](https://developer.apple.com/documentation/swiftui/navigationsplitview) - 三栏容器与 `navigationSplitViewColumnWidth` API。
- Apple: [ContentUnavailableView](https://developer.apple.com/documentation/swiftui/contentunavailableview) - 原生空态视图。
- Apple: [toolbar(content:)](https://developer.apple.com/documentation/swiftui/view/toolbar(content:)) - 原生 toolbar placement 与 commands 入口。
- 项目: `.trellis/spec/apple/mac-ui.md` - ZOO-90 的 206/312/460pt、深浅 token 与状态映射。

## Scope Guard

官方组件满足当前 Shell，不为未来 tab restore、真实数据或业务命令提前建立 model/store。后续需要这些能力时再以 ZOO-90 规范为输入扩展。
