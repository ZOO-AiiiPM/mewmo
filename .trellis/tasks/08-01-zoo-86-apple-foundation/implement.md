# ZOO-86 Implementation Plan

1. 在 AO 的 `issue-ZOO-86-apple-foundation` worktree 中建立 `apps/apple/` 目录、`project.yml`、共享/平台源码目录和 README。
2. 配置 macOS app、universal iOS app、unit test schemes；生成工程并检查 scheme 与 destination。
3. 实现最小 SwiftData model 与 `PersistenceController`，加入 in-memory persistence test。
4. 实现 `HTTPClient` / `URLSessionHTTPClient` 和 `CredentialStore` / `KeychainCredentialStore` 的可注入骨架及 focused tests。
5. 实现共享 SwiftUI root shell 与两端 composition root，不添加业务 UI 或 AI。
6. 运行 XcodeGen 幂等检查、macOS/iPhone/iPad destination build、unit tests和 `git diff --check`。
7. worker 自测、提交并创建含 `issue-ZOO-86` 的 PR；Codex 仅在 `In Review` 独立验收，不自动 merge。

## Validation Commands

- `xcodegen generate --spec apps/apple/project.yml`
- `xcodebuild -list -project apps/apple/Mewmo.xcodeproj`
- `xcodebuild build -project apps/apple/Mewmo.xcodeproj -scheme <macOS scheme> -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO`
- `xcodebuild build -project apps/apple/Mewmo.xcodeproj -scheme <iOS scheme> -destination '<available iPhone simulator>' CODE_SIGNING_ALLOWED=NO`
- `xcodebuild build -project apps/apple/Mewmo.xcodeproj -scheme <iOS scheme> -destination '<available iPad simulator>' CODE_SIGNING_ALLOWED=NO`
- `xcodebuild test -project apps/apple/Mewmo.xcodeproj -scheme <test scheme> -destination '<available simulator>' CODE_SIGNING_ALLOWED=NO`

## Review And Rollback Gates

- 若 XcodeGen 无法在当前 Xcode 版本稳定生成，先报告并保留 `project.yml`，不得手改生成文件掩盖问题。
- 若 SwiftData 最低版本要求变化，回到 planning 更新 compatibility，不引入第三方数据库替代。
- 不触碰 `apps/web/`、`packages/db/`、`packages/shared/`；发现 API 缺口只记录后续 Issue。
