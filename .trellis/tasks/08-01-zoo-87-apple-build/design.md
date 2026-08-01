# ZOO-87 技术设计：Apple 工程与构建矩阵

## 目标形态

在 `apps/apple/` 放一个由 XcodeGen 驱动的 Xcode 工程，一个 `.xcodeproj` 内含 **两个 target**：

| Target | Platform | Device family | 产物 | 入口 |
|--------|----------|---------------|------|------|
| `Mewmo-Mac` | `macOS` | - | `.app` | macOS composition root |
| `Mewmo-iOS` | `iOS` | iPhone(1) + iPad(2) | universal iOS `.app` | iOS composition root |

两个 target 共享同一个 `Sources/` 目录（纯 SwiftUI 业务代码 + 一个最小根视图），各自带平台特定 entry（`@main` App 结构）。平台差异用 `#if os(macOS) / os(iOS)` 在同一份源码里消解，避免代码重复。

## 目录结构

```
apps/apple/
├── project.yml                # XcodeGen 真相源（唯一手工配置入口）
├── Makefile                   # 本地生成/构建/验证入口
├── README.md                  # 命令文档
├── .gitignore                 # 忽略生成的 *.xcodeproj 等
├── Sources/
│   ├── MewmoApp.swift         # 视觉共享的 SwiftUI 视图壳（根视图）
│   └── (后续业务源码目录占位)
├── Entry/                     # 平台 composition root
│   ├── macOS/
│   │   └── MacAppMain.swift   # @main，包 AppKit/SwiftUI App 生命周期
│   └── iOS/
│       └── iOSAppMain.swift   # @main，iOS SwiftUI App 生命周期
├── Resources/
│   ├── macOS/                 # macOS Assets (AppIcon、无 storyboard 需要)
│   └── iOS/                   # universal iOS Assets (AppIcon)
```

### 为何 Entry 单独放，不用 Sources 里的 `#if`

每个平台一个 `@main` 入口文件（`macOS/MacAppMain.swift` vs `iOS/iOSAppMain.swift`）。两个入口文件都在各自 target 里编译；`Sources/` 里的共享视图（`MewmoApp.swift`）不含 `@main`，只做纯视图，规避 Xcode 多 `@main` 冲突并保持共享代码干净。

更稳的做法：XcodeGen 里给两个 target 分别 assign 不同 `source` 集合；共享目录 `Sources` 两者都 include，平台入口目录只 include 到对应 target。这样 `#if` 只在共享代码内做装饰性细节适配，入口不靠宏。

## project.yml 要点

- `options.bundleIdPrefix` → 基础 bundle id（如 `app.mewmo`）。
- macOS target：`platform: macOS`，`type: application`，`sources: [Sources, Entry/macOS, Resources/macOS]`，`deploymentTarget: macOS "14.0"`。
- iOS target：`platform: iOS`，`sources: [Sources, Entry/iOS, Resources/iOS]`，`deploymentTarget: iOS "17.0"`，settings 强制 `TARGETED_DEVICE_FAMILY: "1,2"`（同时含 iPhone 与 iPad），`SUPPORTED_PLATFORMS`/`SDKROOT` 保持 iOS。
- 无签名：XcodeGen 默认新 target 不开签名（`CODE_SIGNING_REQUIRED` 未设）；本地无签名模拟器构建不依赖证书。为确保干净，构建命令用 `CODE_SIGNING_ALLOWED=NO` 兜底。
- `INFOPLIST`：macOS/iOS 可各用一个静态 `Info.plist` 或让每个 target 在 settings 里声明 `GENERATE_INFOPLIST_FILE: YES`，避免手工维护 plist。用 `GENERATE_INFOPLIST_FILE` + 基础 `INFOPLIST_KEY_*`。

## 构建命令设计

`Makefile` 提供：

- `make generate` → `xcodegen generate`
- `make build-macos` → `xcodebuild -project ... -scheme Mewmo-Mac -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO build`
- `make build-ios` → 分别对 iPhone / iPad simulator 两个 destination 构建 `Mewmo-iOS`
- `make build-all` → 依次跑 3 个 destination
- `make verify` → generate 幂等检查 + build-all

Simulator destination 用统称更稳：
- iPhone：`-destination 'platform=iOS Simulator,name=iPhone 16'`（按本机可用性可改成 `generic/platform=iOS Simulator`）
- iPad：`-destination 'platform=iOS Simulator,name=iPad Pro 13-inch (M4)'`
- 为保证 CI / 本地可复现，iPhone/iPad 用 `generic/platform=iOS Simulator` 构建可以避免依赖具体模拟器设备名，但"iPhone simulator / iPad simulator 均可编译"的验收需要两套 device family。折衷：`build-ios` 对 `id=...` 具体设备验证，并在 README 说明。

## 与 monorepo / CI 的关系

- `apps/` 下现有包都被 pnpm workspace 与 turbo 纳入。`apps/apple/` 是纯 Apple 工程，**没有 package.json**，所以 `pnpm` / turbo 不会把它当 workspace 包处理（powered by `pnpm-workspace.yaml` 的 `apps/*`，但没有 package.json 的目录不影响）。
- 需确认并保证：turbo `pnpm lint / build / test` 跑通时不会因 `apps/apple` 失败。README 记录 Apple 构建需在 macOS 本地执行。
- CI（ubuntu）无法跑 xcodebuild，本任务的三 destination 无签名构建验证在**本地 macOS** 完成并记录结果到任务 journal / PR 描述。

## 风险与对策

- **XcodeGen 版本漂移**：本仓库不锁 `brew` 版，README 记录最低版本（2.45.4）。
- **多 @main**：共享 `Sources/` 无 `@main`，入口各自 target 独占 → 规避。
- **Info.plist 缺失**：用 `GENERATE_INFOPLIST_FILE=YES` 规避。
- **模拟器设备名缺失**：`generic/platform=iOS Simulator` 作为兜底 destination，README 说明。
