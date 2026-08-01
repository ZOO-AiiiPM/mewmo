# ZOO-86 Technical Design

## Architecture

`apps/apple/project.yml` 是 app 工程的唯一配置源，XcodeGen 生成 `.xcodeproj`。工程包含 macOS app target、universal iOS app target 和共享 test target；iPhone/iPad 通过 destination 与 device family 区分，不复制业务 target。

共享源码按 `Mewmo/Models`、`Services`、`ViewModels`、`Views` 组织，平台专属入口位于 `Mewmo/Platforms/macOS` 与 `Mewmo/Platforms/iOS`。第一版只提供 app composition root 和最小壳。

## Core Boundaries

- `PersistenceController` 负责 SwiftData `ModelContainer` 创建；测试使用 in-memory configuration。
- `HTTPClient` 协议抽象请求执行，生产实现封装 URLSession；业务 API contract 留给后续 Issue。
- `CredentialStore` 协议抽象 token 存取，生产实现封装 Security framework；不提前定义服务端认证流程。
- app target 只在 composition root 组装具体实现，共享 ViewModel 不直接依赖系统 singleton。

## Tooling Decision

采用 XcodeGen：本机已安装，声明式 YAML 适合 code review 和 worktree，依赖面小。Tuist 能力更完整但对当前骨架过重；纯 `.xcodeproj` 容易产生不可审阅的 project file 冲突；SwiftPM 适合共享模块，但不能替代 app target、entitlement 和 destination 配置。

参考：

- https://github.com/yonaskolb/XcodeGen
- https://github.com/tuist/tuist
- https://github.com/swiftlang/swift-package-manager
- https://developer.apple.com/documentation/swiftdata

## Compatibility And Rollback

最低 macOS 14、iOS/iPadOS 17，以原生 SwiftData 为基线。全部新增内容限制在 `apps/apple/`，回滚只需撤销该目录，不修改现有 TypeScript、数据库或 Web contract。

## Deferred Contracts

认证 token、sync DTO、图片缓存和 UI design system 不在本 Issue 中定型，避免骨架用猜测锁死后续 API。
