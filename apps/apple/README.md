# mewmo · Apple 工程

mewmo 的 Apple 客户端工程，由 **XcodeGen** 声明生成，覆盖 macOS / iPhone / iPad 三个 destination。

> 本目录只承载**工程结构与构建入口**。认证、同步、SwiftData 数据模型、网络客户端、Keychain、图片缓存、业务 UI、AI 与发布均不在本工程范围内。

## 目录结构

```
apps/apple/
├── project.yml                 # XcodeGen 真相源（唯一手工配置入口）
├── Makefile                    # 本地生成 / 构建 / 验证入口
├── README.md                   # 本文档
├── .gitignore                  # 忽略生成的 *.xcodeproj、DerivedData 等
├── Sources/
│   └── MewmoRootView.swift     # 共享最小 SwiftUI 启动壳（无 @main，macOS/iOS 复用）
├── Entry/
│   ├── macOS/MacAppMain.swift  # macOS composition root（@main，仅 macOS target 编译）
│   └── iOS/iOSAppMain.swift    # iOS composition root（@main，仅 iOS target 编译）
├── Resources/
│   ├── macOS/                  # macOS Assets（AppIcon 等）
│   └── iOS/                    # universal iOS Assets（AppIcon、AccentColor）
└── scripts/
    └── find_sim.sh             # 挑选已安装的 iPhone/iPad 模拟器
```

## 工程形态

一个 `Mewmo.xcodeproj`，两个 target：

| Target  | Platform | Device family | 入口 |
|---------|----------|---------------|------|
| `Mewmo-Mac` | macOS 14+ | - | `Entry/macOS/MacAppMain.swift` |
| `Mewmo-iOS` | iOS 17+   | iPhone(1) + iPad(2) | `Entry/iOS/iOSAppMain.swift` |

两个 target 共享 `Sources/`，平台差异用 `#if os(...)` 收敛；入口文件各自独立，避免多 `@main` 冲突。

## 前置要求（macOS 本地）

- macOS + Xcode（本工程用 Xcode 26.6 / Swift 6.3.3 验证）
- [XcodeGen](https://github.com/yonaskolb/XcodeGen)（验证版本 2.45.4；`brew install xcodegen`）
- 已安装的 iOS 模拟器（`find_sim.sh` 会自动挑选已安装的 iPhone / iPad 模拟器）

> Apple 构建只能在 macOS 上执行。Linux CI（`ubuntu-latest`）无法运行 `xcodebuild`，因此 `apps/apple` **不**纳入 `pnpm` / turbo 的构建域——仓库级 `pnpm lint / build / test` 不触碰本目录。

## 使用

### 生成工程（可重复执行、幂等）

```bash
make generate          # 等效 `xcodegen generate`
```

生成的 `Mewmo.xcodeproj/` 已 gitignore，**不做手工编辑**；一切改 `project.yml` 后重新生成。

### 构建三 destination（无签名）

```bash
make build-macos        # macOS app
make build-ios          # universal iOS（iPhone+iPad family，generic iOS Simulator）
make build-ios-iphone   # iPhone simulator（自动挑选已安装 iPhone 模拟器）
make build-ios-ipad     # iPad simulator（自动挑选已安装 iPad 模拟器）
```

全部无签名（`CODE_SIGNING_ALLOWED=NO`），零证书环境可复现。

### 一键验证

```bash
make verify
```

`make verify` 做两件事，任何一步失败即非零退出：

1. **生成幂等性机械校验**（`make verify-idempotent`）：连跑两次 `xcodegen generate`，把两次生成结果投影成「文件 + 内容」快照（`scripts/snapshot_project.sh`，跳过空的 SwiftPM 副作用目录），再 `diff -r` 逐文件比对。任一常规文件名称或内容漂移即 `exit 1` 并打印 diff。
2. **三 destination 全量无签名构建**（`make build-all`）：macOS + iPhone + iPad。

也可单独跑 `make verify-idempotent` 只看生成幂等性。

### 清理构建产物

```bash
make clean
```

### 清理构建产物

```bash
make clean
```

## 验收对照

- `xcodegen generate` 可重复执行 → `make verify` 内含 `verify-idempotent`：连跑两次并逐文件 diff，漂移即失败；常规文件（如 `project.pbxproj`）重生成逐字节一致。
- macOS / iPhone simulator / iPad simulator 均可编译 → `make build-all`（内部为三 destination）。
- iOS target 同时支持 iPhone/iPad → `Mewmo-iOS` 目标 `TARGETED_DEVICE_FAMILY = 1,2`（`xcodebuild -showBuildSettings` 可查）。
- 生成文件不作为手工配置真相源 → `Mewmo.xcodeproj/` 已 gitignore，`project.yml` 为唯一入口。
