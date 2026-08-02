# ZOO-93 Apple 认证客户端

## Goal

实现 Apple 三端共享的 native bearer session 客户端，安全保存凭据、原子处理 refresh rotation，并为后续 API/SyncEngine 提供可靠认证头和登录状态。

## Confirmed Facts

- 服务端 ZOO-88 contract 已合并：login/refresh/logout/session 位于 `/api/auth/native/*`。
- access token 有效期 15 分钟；refresh token 有效期 30 天且每次成功刷新立即原子轮换，旧 token 失效。
- refresh 并发只有一个请求成功，其余返回 `401 invalid_refresh`；客户端必须 single-flight，不能并发使用同一 refresh token。
- token 禁止进入 UserDefaults、SwiftData、日志或错误描述；Keychain 是唯一 production credential store。

## Requirements

1. 在 `Sources/Auth/` 定义与 `docs/contracts/native-auth.md` 一致的 DTO、错误码和 `AuthSessionSnapshot`；不复制服务端业务逻辑。
2. 使用 Foundation `URLSession` 实现 login、refresh、logout、session endpoint；base URL、clock、transport 和 credential store 可注入。
3. production credential store 使用 Apple `Security.framework` Keychain，access/refresh/session metadata 作为单个 Codable blob 原子替换；可测试协议使用 in-memory fake。
4. Keychain item 使用 app-scoped service/account、`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`，禁止 iCloud 同步和跨 app access group。
5. access token 有足够剩余 TTL 时直接复用；临近过期时所有调用者共用一次 refresh single-flight，成功后先持久化新 refresh 再向调用方暴露新 access。
6. refresh `401 invalid_refresh`、logout 或凭据解码失败时清空本地 session 并进入 signed-out；429/5xx/离线不得误清理仍有效凭据。
7. authenticated request 对一次 401 最多 refresh 并重试一次；禁止递归重试和 refresh storm。
8. logout 优先同时发送 refresh body + bearer header，遵循服务端幂等 204 contract；无论网络结果如何，用户明确 logout 后本地凭据必须清空。
9. 日志与 errors 只保留 status/code/endpoint，不包含 password、access token、refresh token 或完整 Authorization header。

## Acceptance Criteria

- [ ] login 成功后 Keychain/fake store 中存在完整 session，恢复时无需重新登录。
- [ ] access token 未临近过期不触发 refresh；过期/临近过期触发一次 refresh 并原子替换 refresh token。
- [ ] 多个并发 401/过期请求只发生一次 refresh，所有等待者收到同一新 access token。
- [ ] refresh 401 清空 session；429、5xx 和 offline 保留凭据并返回可重试错误。
- [ ] authenticated request 最多重试一次，第二次 401 返回 signed-out/unauthorized，不循环。
- [ ] logout 覆盖 204、未知 refresh 幂等和网络失败后的本地清理。
- [ ] token 不出现在 UserDefaults、SwiftData、日志、test failure message 或公开 snapshot description。
- [ ] mock tests 覆盖 login、恢复、刷新轮换、并发 single-flight、401 单次重试、logout 和错误映射。
- [ ] `make -C apps/apple test`、`make -C apps/apple verify` 与 `git diff --check` 通过。

## Out of Scope

- 登录 SwiftUI、第三方 OAuth、服务端 contract 修改、SyncEngine、业务 API DTO 和发布签名。
- iCloud Keychain 同步、跨 app access group、生物识别提示。
