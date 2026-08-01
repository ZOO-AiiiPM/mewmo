# ZOO-87 Apple 工程与构建矩阵

## Goal

建立可重复生成、可在 macOS / iPhone / iPad 三个 destination 编译的 Apple 工程。本任务只解决**工程结构与构建入口**，不做任何业务能力。

## Scope 与 Out of Scope

### In Scope

- 在 `apps/apple/` 使用 **XcodeGen**（`project.yml`）声明 Apple 工程。
- **macOS** app target（编译成 `.app`）+ **universal iOS** app target（同时支持 iPhone / iPad device family）。
- **共享源码目录**：macOS 与 iOS 目标复用同一套 SwiftUI 业务源码，按平台用 `#if os(...)` 处理差异。
- **平台 composition root**（每个目标一个入口，组装最小 SwiftUI App 生命周期）。
- **最小 SwiftUI 启动壳**：仅一个根视图，证明工程能编译运行，不含任何业务 UI。
- 本地构建 / 测试命令 + `README.md`。
- **三 destination 的无签名构建验证**（macOS、iPhone simulator、iPad simulator）。
- 生成的 `.xcodeproj` **不算**手工配置真相源，由 `xcodegen generate` 生成并可重复执行。

### Out of Scope（明确不做）

SwiftData 业务模型、网络客户端、Keychain、认证、同步、图片缓存、业务 UI、AI、发布/签名。

## Acceptance Criteria（可验证）

- `xcodegen generate` 在干净 clone 上**可重复执行**（幂等，生成成功且不产生漂移）。
- macOS 目标可无签名编译通过。
- iPhone simulator 目标可无签名编译通过。
- iPad simulator 目标可无签名编译通过。
- iOS 目标 `TARGETED_DEVICE_FAMILY` 同时包含 iPhone(1) 与 iPad(2)。
- 生成的 `.xcodeproj` 加入 `.gitignore`；`project.yml` 是唯一工程真相源。
- `README.md` 包含本地生成、构建三 destination 的精确命令。
- 提供可脚本化的本地构建命令（如 `make build` / 脚本），一次跑通三 destination。
- CI 门禁不因新增 `apps/apple/` 而失败（Apple 构建在 Linux CI 上不可行，需让涉 Apple 的验证在本地/macOS 完成，`apps/apple` 不进 turbo 的 `pnpm` 域）。

## Confirmed facts

- 本 worktree 在 clean 分支 `codex/issue-ZOO-87-apple-build-matrix`，工作树干净，可安全提交。
- 本地环境：Xcode 26.6，Swift 6.3.3，XcodeGen 2.45.4。
- CI 跑在 ubuntu-latest，无法执行 `xcodebuild`；Apple 目标不该被纳入 `pnpm lint/build/test` turbo 管线的 Linux 构建域。
