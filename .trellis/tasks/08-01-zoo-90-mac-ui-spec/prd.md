# ZOO-90 Mac Web UI 对照规范

## Goal

把当前 Web 工作区的结构、视觉 token、交互状态和键盘行为整理成可追溯的 macOS SwiftUI 实现规范，使 ZOO-94/96/97 不需要凭截图重新做产品决策。

## Confirmed Facts

- Apple v1 不包含 AI；Mac 端的信息架构和视觉语言与 Web 一致，同时遵循 macOS 原生窗口、菜单、焦点和键盘行为。
- 浅色模式不沿用 Web 认证页等位置的暖黄/米色倾向，统一改为 neutral grayscale：白、黑与不同层级灰色；灰色承担原暖黄色的层级和强调作用。
- Apple Mac 端在 Web 信息架构上新增顶部 tab strip；用户可通过 `+` 新建 tab，并在多个页面之间切换。
- tabs 在 App 正常重启后恢复；退出登录或切换账号时清空，禁止跨账号恢复页面状态。
- Web 工作区以 sidebar + list column + detail/reader/editor 组成，核心业务面是 notes、clips、feeds/feed entries。
- Web 的深浅主题、颜色、字体、宽度和状态样式以当前源码为事实源，不以截图或口头描述为事实源。
- 本 Issue 只产出规范，不编写 SwiftUI 业务界面，也不修改 Web UI。

## Requirements

1. 盘点工作区 shell、导航、列表、详情、阅读器和笔记编辑器的结构与响应式行为。
2. 提取深色主题 token，并为浅色模式定义纯黑白灰映射：颜色、字体、字号、间距、分栏宽度、边框、圆角、hover/selected/focus 等状态；禁止暖黄、米色和奶油色 token。
3. 覆盖 notes、clips、feeds/feed entries 的 loading、empty、error、selected、offline/stale 表现；不得把未实现行为写成现状。
4. 对每个 Web 行为标注 SwiftUI 映射：视觉一致、语义一致或改用 macOS 原生行为，并说明依据。
5. 明确窗口最小尺寸、三栏收缩、toolbar、菜单、焦点、键盘导航和 VoiceOver 验收项。
6. 每项事实回链到 `origin/main` 的源码文件与行号；易漂移值必须标明重新核对方法。
7. 规范作为单一真相源落入 `.trellis/spec/apple/mac-ui.md`，并从 Apple spec 索引到该文件。
8. 定义顶部 tab strip：`+` 新建、激活态、标题/图标、切换、关闭、溢出、键盘操作以及每个 tab 独立页面状态；明确这是 Apple enhancement，不伪装成 Web 现状。
9. 持久化可恢复的 tab descriptors，而不是视图对象；恢复失败或目标内容已删除时显示可关闭的 unavailable state，不得导致启动失败。

## Acceptance Criteria

- [ ] 深色 token 有源码锚点；浅色 token 有明确黑白灰映射，视觉审查中不存在暖黄、米色或奶油色主色。
- [ ] shell、notes、clips、feeds/feed entries 各自有结构、状态矩阵和验收清单。
- [ ] 至少覆盖紧凑、常规、宽屏三种 Mac 窗口档位，且不把 Web breakpoint 生搬为 macOS 行为。
- [ ] 键盘、焦点、菜单、toolbar、可访问性和 reduced motion 有明确规则。
- [ ] AI/chat、iPhone/iPad 完整 UI、SwiftUI 实现及 Web 重构被明确排除。
- [ ] 顶部 tab strip 有完整状态图和验收清单：新建、切换、关闭、溢出、键盘访问和独立页面状态。
- [ ] 正常重启恢复 tabs 和 active tab；退出登录或切换账号后不恢复前一账号 tabs。
- [ ] 无效、已删除或无法解码的 tab 可降级为 unavailable state，其余 tabs 继续恢复。
- [ ] ZOO-94/96/97 可只引用本规范实施，不需要重新决定布局和状态语义。
- [ ] 文档中的文件名、token 和组件名均可在最新 `origin/main` 验证。

## Out of Scope

- SwiftUI 业务界面或 preview 实现。
- Web UI 重构、截图基线和设计稿制作。
- iPhone/iPad 完整交互规范。
- AI、聊天侧栏和 AI 浮动入口。
- 数据层、认证、同步和图片缓存实现。
