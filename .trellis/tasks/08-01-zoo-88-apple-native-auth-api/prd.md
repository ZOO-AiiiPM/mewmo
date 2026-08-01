# ZOO-88 Apple 原生认证 API（服务器端原生登录）

## Goal

为 Apple 原生客户端（macOS / iOS / iPad）提供一套**可撤销、可轮换的 bearer session 认证 API**，
使原生客户端能在不使用浏览器 NextAuth cookie 的前提下取得短期 access token，并安全地刷新、退出、管理设备级身份。

这是 ZOO-86（Apple 工程骨架，只定义了 `CredentialStore` 协议边界）的服务端续篇：
ZOO-86 已明确「真实登录、服务端 token 签发与认证 API 改造」属于后续 Issue，本 Issue 落地这套服务器端 contract。

## Background / Confirmed Facts

- Web 认证依赖 NextAuth cookie（`session.strategy = "jwt"`），`apps/web/src/lib/auth.ts` 封装 `auth()` / `signIn()`。
- 现有同步 API（`/api/sync/pull`、`/api/sync/push` 等）用 `await auth()` 校验 cookie session，取 `session.user.id` 做 ownership。
- 数据接口 ownership 靠「查库时带 `userId = session.user.id`」，不能只靠 ID（见 `.trellis/spec/dev-backend.md`）。
- 仓库测试全部基于 mock（vitest + `*.test.ts` / `tests/unit/*.mjs`），无真实 DB service。
- 迁移采用 `packages/db/prisma/migrations/<ts>_<name>/migration.sql`；CI 不跑 `prisma migrate deploy`，但 `database-migrations-static.test.mjs` 会校验既有 baseline 字节一致与 reconciliation 加性——不修改既有迁移。
- 生产 / Preview 环境变量经 dashboard 注入；`NEXTAUTH_SECRET` 已存在。

## Requirements

1. 原生客户端可用「邮箱 + 密码」换取短期 access token + 长期（可轮换、可撤销）refresh token，全程无 cookie。
2. refresh token 每次使用时轮换（旧 refresh 作废、签发新 refresh），被轮换或注销后不可继续使用。
3. 注销（logout）立即吊销该设备会话的 refresh 与 access 能力，并移除该设备/session 身份。
4. Native 会话记录设备/session 身份（`deviceId`、平台、名称、最后来源 IP / UA、创建的本地时间）。
5. 服务端权限边界：所有用户数据接口仍按 `userId` ownership 隔离；native access token 携带 `userId`，可被数据接口识别。
6. 速率限制：native 登录与刷新受与 Web 登录一致的限速保护，禁止无界暴力尝试。
7. **保持现有 Web 登录完全兼容**（NextAuth cookie 流程不改动；Web auth 回归测试通过）。
8. 提供 API tests 与 contract 文档。

## Out of Scope

- SwiftUI 登录界面、Keychain 客户端实现、`apps/apple` 客户端代码。
- 第三方（Apple Sign-In OAuth / Google / magic-link）native 接入 UI。
- sync pull/push 业务改造（仅把 native bearer 校验接到现有 sync 路由以证明 ownership 隔离）。
- 图片、离线队列、后台同步、Apple 产品 UI。

## Acceptance Criteria

- [ ] 原生客户端无需浏览器 cookie 即可通过 `POST /api/auth/native/login` 取得短期 access token。
- [ ] refresh token 可轮换、可撤销；注销后 refresh 不可再次使用。
- [ ] 所有用户数据接口仍按 `userId` ownership 隔离（native bearer 请求访问他人数据返回 401/403，不泄露数据）。
- [ ] Web auth 回归测试通过（`pnpm test:unit` 绿 + 现有 Web 认证相关断言不破坏）。
- [ ] 原生 API 有 mock 单元测试与 contract 文档（请求/响应 schema、错误码、token 生命周期）。

## Risks And Deferred Items

- `apps/apple` 客户端尚不存在，本 Issue 只交付服务器端 contract；客户端消费留待后续 Issue。
- 刷新窗口内并发轮换采用「一次性」旋转策略（已用 refresh 立即作废），多设备并发刷新需在 contract 文档中说明窗口语义。
- access token 采用与 cookie 一致的签名密钥，减少环境面；如需独立密钥可后续 Issue 拆出。
