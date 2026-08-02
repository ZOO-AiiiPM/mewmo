# ZOO-94 Mac Shell 实施计划

1. 复核 `MewmoRootView`、macOS entry、`project.yml` 与 ZOO-90 `mac-ui.md`，保持 iOS entry 不变。
2. 新建 macOS-only `Sources/MacShell/MacShellView.swift`，实现三栏 local preview、token、loading/empty 与基础 toolbar/键盘操作。
3. 将 macOS root 接到 Shell，并在 `WindowGroup` 声明默认/最小尺寸。
4. 让既有 macOS XCTest target 编译 `Sources/MacShell`，新增小型 token/mock focused test。
5. 运行 `make -C apps/apple test`、`make -C apps/apple verify`、`git diff --check`。
6. 启动生成的 Mac app，以 light/dark 两种 launch preference 和主要窗口尺寸检查三栏，无重叠或截断。
7. 将原始观察追加到 `lesson.md`，精确暂存、提交、推送并开一个以 `main` 为目标的 ZOO-94 PR。

## Rollback

若 Shell 导致 macOS target 构建失败，恢复为仅在 `MewmoRootView` 的 macOS 分支引用 Shell；不修改已落地的数据、认证或图片缓存模块。
