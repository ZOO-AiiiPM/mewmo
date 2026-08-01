# mewmo · Apple 工程

mewmo 的 Apple 客户端工程，由 **XcodeGen** 声明生成，覆盖 macOS / iPhone / iPad 三个 destination。

> 本目录承载**工程结构、构建入口**与共享基础模块（SwiftData 数据层、图片缓存基础设施）。认证、同步、网络客户端、Keychain、业务 UI、AI 与发布按各自 Issue 逐步落地。

## 目录结构

```
apps/apple/
├── project.yml                 # XcodeGen 真相源（唯一手工配置入口）
├── Makefile                    # 本地生成 / 构建 / 测试 / 验证入口
├── README.md                   # 本文档
├── .gitignore                  # 忽略生成的 *.xcodeproj、DerivedData 等
├── Sources/                    # 共享 Swift 源码
│   ├── MewmoRootView.swift     # 共享最小 SwiftUI 启动壳（无 @main，macOS/iOS 复用）
│   ├── Data/                   # ZOO-91 SwiftData 本地数据层（model/容器/repository/同步 DTO）
│   └── Image/                  # ZOO-92 图片缓存基础设施（Nuke 13 core composition）
├── Tests/
│   ├── Data/                   # ZOO-91 共享 macOS unit-test（数据层）
│   └── Image/                  # ZOO-92 共享 macOS unit-test（图片缓存）
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

一个 `Mewmo.xcodeproj`，三个 target：

| Target  | Platform | Device family | 入口 |
|---------|----------|---------------|------|
| `Mewmo-Mac`   | macOS 14+ | -                  | `Entry/macOS/MacAppMain.swift` |
| `Mewmo-iOS`   | iOS 17+   | iPhone(1) + iPad(2) | `Entry/iOS/iOSAppMain.swift` |
| `Mewmo-Tests` | macOS 14+（unit-test bundle）| - | `Sources/Data/` + `Sources/Image/` 共享模块 + `Tests/` |

前两个 app target 共享 `Sources/`，平台差异用 `#if os(...)` 收敛；入口文件各自独立，避免多 `@main` 冲突。

`Mewmo-Tests` 是 ZOO-91 建立的**共享 macOS unit-test 门禁**，供后续 Apple 模块
（ZOO-92/93…）直接追加测试。它只编译共享基础模块（`Sources/Data/` + `Sources/Image/`）
与 `Tests/`，不包含 SwiftUI 启动壳——保证基础模块不依赖 SwiftUI、可在 unhosted `.xctest`
运行。canonical sync fixtures 以资源方式直接引用仓库内 `packages/sync/src/fixtures/`
单一副本，不做第二份拷贝。后续基础模块（如 `Sources/Auth`）在 `project.yml` 的
`Mewmo-Tests.sources` 追加一行即可接入测试，无需重排 target 结构。

## 图片缓存基础设施（ZOO-92）

`Sources/Image/` 是 Nuke 13 core 的项目级 composition（经 XcodeGen/SPM 引入，只用 `Nuke`
product，不带 NukeUI/Extensions）：

- **组合**：`MewmoImagePipeline` 把 Nuke 的 `ImageCache`（内存 LRU）、`DataCache`（磁盘 LRU）与
  `URLCache`（HTTP validator：ETag/Last-Modified 条件请求）组合成一个共享 pipeline，
  并提供 production/测试可注入的缓存目录。
- **配置**：内存/磁盘/URLCache 容量集中在 `ImagePipelineConfig`，不散落 magic number。
- **并发**：同 URL 并发加载复用 Nuke task coalescing；单调用方取消不影响共享请求的最后订阅者。
- **离线回退**：`load(from:)` 在线优先；非取消错误下先回读磁盘缓存（已缓存内容离线可用），
  未命中则投影为业务层可分类错误（`ImageLoadError`：cancelled/offlineOrMiss/invalidResponse/
  decodeFailed/other）。
- **生命周期**：`clearMemory()` / `clearDisk()` / `removeAllCaches()` / `trim()` 显式清理与 LRU 修剪，
  不与普通加载失败耦合。`clearDisk()` / `removeAllCaches()` 同时清理 Nuke `DataCache` 与系统
  `URLCache`（validator 存储），`pipeline.urlCache` 持有生产 URLCache 供生命周期 API 访问。
- **初始化失败可观测**：`DataCache` 创建失败显式抛出可分类的 `ImageCacheSetupError`
  （`dataCacheInitializationFailed`），禁止静默退化为无磁盘缓存。
- **约束与界线**：缓存键保持原始来源 URL，不改写 SwiftData/model、不按页面复制图片；
  不实现 downloader/LRU/coalescing、不承载业务 SwiftUI、上传与批量预取（ZOO-96/97）。

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

### 运行共享 unit-test（数据层）

```bash
make test
```

`make test` 运行 `Mewmo-Tests` scheme（macOS 本地），覆盖 SwiftData 本地数据层的
CRUD / 版本单调 / 账号隔离 / tombstone / outbox / fixture decode，以及图片缓存基础设施
（ZOO-92/117）的并发去重、取消隔离、磁盘重开、条件请求（ETag/Last-Modified + 304）、
validator 保留、容量/LRU/clear/trim、URLCache 清理与 DataCache 初始化失败分类。
它是后续 Apple 模块复用的默认测试基座。

### 一键验证

```bash
make verify
```

`make verify` 做三件事，任何一步失败即非零退出：

1. **生成幂等性机械校验**（`make verify-idempotent`）：连跑两次 `xcodegen generate`，把两次生成结果投影成「文件 + 内容」快照（`scripts/snapshot_project.sh`，跳过空的 SwiftPM 副作用目录），再 `diff -r` 逐文件比对。任一常规文件名称或内容漂移即 `exit 1` 并打印 diff。
2. **三 destination 全量无签名构建**（`make build-all`）：macOS + iPhone + iPad。
3. **共享 unit-test 全绿**（`make test`）。

也可单独跑 `make verify-idempotent` 只看生成幂等性，或 `make test` 只看测试。

### 清理构建产物

```bash
make clean
```

## 验收对照

- `xcodegen generate` 可重复执行 → `make verify` 内含 `verify-idempotent`：连跑两次并逐文件 diff，漂移即失败；常规文件（如 `project.pbxproj`）重生成逐字节一致。
- macOS / iPhone simulator / iPad simulator 均可编译 → `make build-all`（内部为三 destination）。
- iOS target 同时支持 iPhone/iPad → `Mewmo-iOS` 目标 `TARGETED_DEVICE_FAMILY = 1,2`（`xcodebuild -showBuildSettings` 可查）。
- 生成文件不作为手工配置真相源 → `Mewmo.xcodeproj/` 已 gitignore，`project.yml` 为唯一入口。
