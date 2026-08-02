# ZOO-94 Mac Shell 与导航

## Goal

将现有 macOS 占位启动页替换为可运行的本地预览 Shell：原生三栏导航、纯中性灰深浅主题、窗口尺寸与基础 toolbar/键盘操作。它只为后续业务 UI 提供容器，不读取或写入真实数据。

## Requirements

- macOS target 使用 `NavigationSplitView` 呈现 sidebar、列表与详情三栏；复用 SwiftUI 原生的选择、折叠与焦点行为。
- 以 local mock preview data 驱动侧栏和列表；提供 loaded、loading skeleton 与 empty state，且可从 toolbar 切换以便验收。
- 深色 token 对齐 `.trellis/spec/apple/mac-ui.md`；浅色仅使用黑、白、灰，不出现暖黄、米色或奶油主色。
- 窗口默认约 1240 x 760pt，最小内容尺寸为 990 x 480pt；侧栏理想宽 206pt，列表理想宽 312pt。
- 提供基础 toolbar：新建本地预览、搜索焦点、预览状态/主题菜单；`Cmd-N` 与 `Cmd-F` 可触发对应本地操作。
- 顶部 workspace tab strip 必须支持 `+` 新建、点击切换、关闭、active 高亮与横向 overflow；`Cmd-T`、`Cmd-W`、`Ctrl-Tab`、`Ctrl-Shift-Tab`、`Cmd-1...9` 均操作本地 tabs。
- 每个 tab 独立保存 section、列表选择与 search query；切换后不得覆盖另一 tab 的 local state。
- 加入 focused tests，覆盖导航 mock、中性主题 token 与 tab state transition；保留 iPhone/iPad 现有占位页。

## Constraints

- 仅 macOS Shell。不得接 repository、网络、认证、同步、SwiftData、剪藏/笔记业务功能，或完整 iPhone/iPad UI。
- tab descriptor/state 仅在内存中使用；不实现账号 scoped 持久化/恢复、登出清除或 unavailable tab 降级，不能伪装为已有能力。
- 不实现业务菜单与真实错误/离线状态；它们属于后续 issue。
- 复用 SwiftUI、SF Symbols 和当前 XcodeGen 工程，不添加依赖或修改 Web 代码。

## Acceptance Criteria

- [ ] `Mewmo-Mac` 启动后显示可选择的 sidebar、列表和详情容器；所有内容来自本地 mock。
- [ ] loading 使用 `.redacted` skeleton，empty 使用原生 `ContentUnavailableView`，二者可由 toolbar 菜单验证。
- [ ] 两个主题都可由 toolbar 选择，浅色视觉上为纯黑白灰且正文在深浅主题均可读。
- [ ] 默认和最小窗口尺寸符合 1240 x 760pt / 990 x 480pt 约束，三栏在主要窗口尺寸无重叠或截断。
- [ ] toolbar 的新建预览与搜索焦点能通过 `Cmd-N`、`Cmd-F` 触发。
- [ ] 顶部 strip 的 `+`、切换、关闭、active 态、横向 overflow 与 tab keyboard shortcuts 可操作。
- [ ] tab 切换后，各自的 section、选择项与 search query 保持独立。
- [ ] 新增 focused test 全绿，`make -C apps/apple test`、`make -C apps/apple verify` 与 `git diff --check` 全绿。
