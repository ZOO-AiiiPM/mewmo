# ZOO-86 Apple 三端工程骨架

## Goal

建立可持续开发的 Apple 原生工程，使 macOS、iPhone、iPad 共用 SwiftUI 核心代码，并为后续本地优先数据与同步提供稳定入口。用户价值是后续功能可以按小 Issue 增量交付，而不再反复调整工程结构。

## Confirmed Facts

- 仓库当前没有 `apps/apple/`。[repo inspection]
- 本机具备 Xcode 26.6、Swift 6.3.3、XcodeGen。[tool output]
- Apple 第一版不上 AI；Mac 最终与 Web UI 一致，iPhone/iPad 暂不做完整 UI。[user decision]
- 项目 Apple spec 要求 SwiftUI、SwiftData、URLSession、Keychain，以及三端共享核心代码。[`.trellis/spec/dev-apple.md`]

## Requirements

- 在 `apps/apple/` 创建由 XcodeGen 声明和生成的工程，生成产物不得成为手工真相源。
- 使用 macOS app target 与 universal iOS app target 覆盖 macOS、iPhone、iPad；共享 Models、Services、ViewModels、Views，平台差异放在明确的平台目录或 target 配置。
- 建立 SwiftData 容器和最小本地模型，使启动路径不依赖网络。
- 建立基于 URLSession 的网络客户端协议，以及基于 Security framework 的 Keychain 凭据存储协议；两者可注入 mock。
- 提供最小 SwiftUI 启动壳，不实现业务 UI。
- 提供生成、构建、测试命令和目录约定。
- 最低系统版本采用 SwiftData 原生支持线：macOS 14、iOS/iPadOS 17。

## Acceptance Criteria

- [ ] `xcodegen generate` 可重复生成工程，配置真相源是 `project.yml`。
- [ ] macOS、iPhone simulator、iPad simulator 三个 destination 均能通过 `xcodebuild` 编译。
- [ ] 三端启动到共享 SwiftUI 壳；universal iOS target 同时声明 iPhone/iPad device family。
- [ ] SwiftData 最小内存读写测试通过。
- [ ] URLSession 网络层和 Keychain 层支持依赖注入，基础单元测试通过。
- [ ] README 记录环境、生成、构建、测试命令与后续边界。

## Out of Scope

- 真实登录、服务端 token 签发与认证 API 改造。
- sync pull/push、冲突处理和后台同步。
- 笔记、剪藏、订阅的完整业务 UI。
- 图片下载、缓存、七牛或原站图片策略。
- Mac 对 Web UI 的完整视觉复刻。
- AI、签名、App Store 发布和 CI。

## Risks And Deferred Items

- 当前 Web 认证依赖 NextAuth cookie，Apple 原生 token contract 尚未定义；本 Issue 只保留 CredentialStore 边界。
- 现有 sync API 已存在，但其认证和 fixture 复用需后续独立 Issue 验证。
- Apple package 尚未登记到 Trellis package index，先使用项目级 `dev-apple.md`；登记工作可在工程落地后单独沉淀。
