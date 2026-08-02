# ZOO-94 Mac Shell 实施计划

1. 复核 `MewmoRootView`、macOS entry、`project.yml` 与 ZOO-90 `mac-ui.md`，保持 iOS entry 不变。
2. 在 `Sources/MacShell` 新建纯值类型 workspace tab state，集中实现 local descriptor 的新建、切换、关闭、循环和编号选择；不实现持久化。
3. 更新 macOS-only `MacShellView.swift`，在三栏上方渲染可滚动 tab strip，并把 section、列表选择和 search query 绑定到 active tab。
4. 扩展 toolbar keyboard shortcuts：`Cmd-T`、`Cmd-W`、`Ctrl-Tab`、`Ctrl-Shift-Tab`、`Cmd-1...9`。
5. 让既有 macOS XCTest target 编译新 state 文件，新增 tab transition focused tests。
6. 运行 `make -C apps/apple test`、`make -C apps/apple verify`、`git diff --check`。
7. 启动生成的 Mac app，以 light/dark 两种 launch preference 和主要窗口尺寸检查 tab strip 与三栏，无重叠或截断。
8. 将原始观察追加到 `lesson.md`，精确暂存、提交并推送到现有 ZOO-94 PR。

## Rollback

若 Shell 导致 macOS target 构建失败，恢复为仅在 `MewmoRootView` 的 macOS 分支引用 Shell；不修改已落地的数据、认证或图片缓存模块。
