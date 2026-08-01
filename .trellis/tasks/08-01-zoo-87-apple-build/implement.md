# ZOO-87 执行计划

## 序

本任务只做 Apple 工程结构与构建入口，不碰业务能力。全程在 `apps/apple/` 内新增文件；除 `.trellis/tasks/08-01-zoo-87-apple-build/` 任务目录外不触碰 `.trellis` 共享基础设施（遵循 ZOO-79 约定）。

## 步骤

1. 建立 `apps/apple/` 骨架：`project.yml`、`Makefile`、`README.md`、`.gitignore`。
2. 编写 SwiftUI 源码：
   - `Sources/MewmoApp.swift` — 共享最小根视图（无 `@main`）。
   - `Entry/macOS/MacAppMain.swift` — macOS `@main`。
   - `Entry/iOS/iOSAppMain.swift` — iOS `@main`。
   - `Resources/{macOS,iOS}` — 各平台 Assets（AppIcon 至少占位）。
3. `project.yml`：两个 target（macOS / universal iOS，iPhone+iPad），共享 `Sources/`，各自 entry 与 assets，`GENERATE_INFOPLIST_FILE=YES`，iOS 设 `TARGETED_DEVICE_FAMILY: "1,2"`。
4. 运行 `xcodegen generate`，本地生成 `.xcodeproj`。
5. 三 destination 无签名构建验证：
   - `make build-macos`
   - `make build-ios-iphone`
   - `make build-ios-ipad`
   每个都要通过。
6. **生成幂等性检查**：`xcodegen generate` 重复执行后 `git status` 不应出现对已跟踪生成物的漂移（生成物被 gitignore，重跑应无 diff）；用 `xcodegen dump` 或重新生成对比确认稳定。
7. `pnpm lint && pnpm test:unit` 等仓库 CI 门禁本地预览跑一遍（确保未破坏现有 mono 域；Apple 工程无 package.json，不应被纳入）。
8. 验收回填：确认 `apps/apple` 不在 turbo/pnpm 构建域内，不依赖 Linux CI。
9. 记录任务 journal，写 spec（若要沉淀），提交、push、建带 `ZOO-87` 的 PR，Linear 移到 In Review。

## 验证命令清单

- `xcodegen generate`（幂等）
- `make build-macos`
- `make build-ios-iphone`
- `make build-ios-ipad`
- `make verify`（生成幂等 + 三 destination 全绿）
- `pnpm lint && pnpm test:unit`（仓库 CI 门禁本地预览，确保不回归）

## 验收门（Definition of Done）

- `xcodegen generate` 幂等成功。
- macOS / iPhone simulator / iPad simulator 三处无签名编译通过。
- iOS `TARGETED_DEVICE_FAMILY` 含 1 与 2。
- 生成的 `.xcodeproj` 进 `.gitignore`，`project.yml` 为真相源。
- README 命令可复现。
- 仓库 CI 门禁不因本改动失败。
