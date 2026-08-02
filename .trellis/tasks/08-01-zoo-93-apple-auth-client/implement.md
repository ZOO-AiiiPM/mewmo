# Implementation Plan

1. 基于最新 `origin/main`，读取 native auth contract 与 ZOO-91 test target。
2. 实现 Codable DTO、server error mapping、injectable URLSession transport 和 platform/device metadata。
3. 实现 versioned credential blob、`CredentialStore` 与 Security.framework adapter；token 不进入日志/description。
4. 实现 actor-owned session controller、expiry skew、single-flight refresh、signed-out transitions。
5. 实现 bearer request + 一次 401 refresh/retry，禁止递归重试。
6. 添加 mock transport/clock/store tests，覆盖 login、restore、rotation、并发 401、transient errors 和 logout。
7. 将 `Sources/Auth` 接入 app/test target；禁止手改 xcodeproj，避免触碰 SwiftData schema、SyncEngine 和 UI。
8. 运行 `make -C apps/apple test`、`make -C apps/apple verify`、`git diff --check`。
9. 追加 concise lesson，commit/push 原 Issue branch，创建单个 PR，标题严格为 `issue-93: <简洁标题>`，Linear 转 In Review。禁止 approve、merge、deploy。

## Review Gate

- refresh 是 single-flight；成功 rotation 原子替换 credential blob。
- transient failure 不误清 session；invalid refresh 和明确 logout 会清理。
- Authorization/token/password 不进入日志和公开错误。
- 只实现最小状态模型，不制作登录 UI。
