# ZOO-88 Technical Design — 服务器端 Native Authenticization API

## 目标契约

为 Apple 原生客户端提供 **opaque 短期 access token + 可轮换/可撤销 refresh token** 的 bearer session，
与现有 NextAuth cookie 流程共存的服务器端 contract。access token 与 cookie 共用同一签名密钥
（`NEXTAUTH_SECRET`，已在校验环境、Preview、生产注入），减少环境面。

### Token 形态

- **access token**：HS256 JWT，`alg=HS256`，`iat/nbf/exp`，claims：
  - `sub` = `userId`
  - `sid` = native session id（唯一标识一次设备登录）
  - `kind` = `"native_access"`
  - `scope` = `"native"`（标识由 native session 签发）
  - 有效期：**15 分钟**。短命：任何被撤销或轮换后旧的访问能力都尽快失效。
  - 签名：`NEXTAUTH_SECRET`，与 Web cookie 一致，保证校验一致性。
- **refresh token**：**opaque 随机串**（服务端只存**哈希**，SQL 层唯一性 + 哈希比对），仅用于换取新 access。
  - 有效期：**30 天**（滑动式：每次轮换重设）。
  - 不解析即验签——通过查 `NativeSession` 行做哈希比对，天然支持撤销。
  - 轮换策略：每次 refresh 成功即签发新 refresh、旧 refresh 哈希立即作废（one-time use）；被轮换后旧 refresh 再使用返回 401。

### 端点

```
POST /api/auth/native/login     → 200 { accessToken, refreshToken, expiresIn, refreshExpiresIn, sessionId, user }
POST /api/auth/native/refresh   → 200 { accessToken, refreshToken, expiresIn, refreshExpiresIn, sessionId }
POST /api/auth/native/logout    → 204（吊销该 session 的 refresh 能力）
GET  /api/auth/native/session   → 200 { session: { id, deviceId, platform, deviceName, createdAt, updatedAt, lastUsedAt } }
```

- `login` body：`{ email, password, deviceId?, deviceName?, platform? }`；`platform` ∈ `macos|ios|ipados`（可选，默认 `ios`）。
  - 失败：400（参数）/ 401（凭证错误，拆穿时序用 dummy hash）/ 429（限速）。
- `refresh` body：`{ refreshToken, deviceId? }`。
  - 失败：400 / 401（refresh 无效、已轮换、已撤销、已过期）。
- `logout` body：`{ refreshToken }`（用 refresh 定位并吊销会话），也接受 `Authorization: Bearer <access>` 定位当前 session（原生模式）。
- `session` 需 `Authorization: Bearer <access>`。

### 鉴权接入现有数据接口（ownership 隔离）

新增 bearer-aware 解析器：`resolveRequestUser(request)`，规则——

1. 若请求带 `Authorization: Bearer <token>` → 校验 native access token，返回 `{ user: { id: sub, sessionId: sid } }`；
   校验失败返回 401。
2. 否则回退到 NextAuth cookie `auth()`（Web 路径完全不变）。

已接入的证明点：`/api/sync/pull` 改用该解析器并断言 `userId`（一次性把「native bearer 能进数据接口」落到 ownership 隔离）；
其余数据接口维持 `auth()`（scope 内不改动 Web 行为）。所有查库都带 `userId = 当前解析到的 userId`。
同步路由用 `syncPullSchema` 保留——native 请求不携带 cookie 也能通过 bearer 身份进入并仅读本人数据。

数据库模型（`NativeSession`）：`id / userId / refreshTokenHash(unique) / deviceId / platform / deviceName /
lastIp / lastUserAgent / lastUsedAt / lastRefreshedAt / refreshExpiresAt / revokedAt / createdAt / updatedAt / refreshCount`。
关系：`User.nativeSessions NativeSession[]`。
迁移放在新目录 `20260801090000_add_native_sessions`，只做 `CREATE TABLE` + 索引（不触碰既有迁移）。

### 安全边界

- 登录先用「email+IP」限速锁（复用 `packages/auth` 的 `LoginRateLimiter`），命中返回 429。
- refresh 用哈希比对 + SQL 单行 up 的 CAS（轮换在事务内：读到行 → 校验未撤销未过期 → 更新新哈希 + `refreshCount+1` + 标记旧哈希状态），
  避免并发重放。具体：`refreshTokenHash` 在轮换时更新为新 token 哈希；旧 refresh 哈希与新哈希不同则 401。
- refresh 存哈希，绝不明文入库；access token 不落库（无状态验签）。
- `NEXTAUTH_SECRET` 不得硬编码、不得进测试断言。

### 兼容与回滚

- Web 认证链路（`auth()` / cookie / `/api/auth/*`）不改动，只**新增** native 路由与模型。
- 回滚：撤销 native 路由目录、`NativeSession` 模型与迁移即可，不影响 Web。
- CI 门槛：`pnpm lint + pnpm test:unit（含既有 .mjs 静态测试 + vitest）+ pnpm test:theme + pnpm build` 全绿，
  且 `database-migrations-static.test.mjs` 的既有断言不破坏（不修改既有迁移 SQL）。

### 测试策略

全部 mock-based（无真实 DB）：
- `tests/unit/native-auth.test.ts`（vitest）：token sign/verify、refresh 轮换/撤销、登录限速、ownership 解析、sync 路由 bearer 接入。
- `tests/unit/native-auth-api-static.test.mjs`（node:test 静态）：路由存在、请求 schema、`resolveRequestUser` bearer 分支、login 限速调用、migration 目录命名。
