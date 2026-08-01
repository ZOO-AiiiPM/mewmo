# Native Auth API Contract（服务器端原生认证）

> 面向 Apple 原生客户端（macOS / iOS / iPad）的 **bearer session** 认证 contract。
> 服务器端实现，不依赖浏览器 NextAuth cookie。Web 登录（NextAuth cookie + JWT strategy）保持完全不变。

## Token 模型

| Token | 形态 | 有效期 | 存储 | 用途 |
|-------|------|--------|------|------|
| access token | HS256 JWT，`kind=native_access, scope=native` | **15 分钟** | 不落库（无状态签名） | 访问数据接口（`Authorization: Bearer`） |
| refresh token | opaque 随机串（32B base64url） | **30 天**（滑动式） | 仅存 **HMAC-SHA256 哈希**（表 `native_sessions.refresh_token_hash`） | 换取新 access；每次使用**轮换** |

### access token claims

```jsonc
{
  "kind": "native_access",
  "scope": "native",
  "sub": "<userId>",
  "sid": "<nativeSessionId>",
  "iat": 1690000000,
  "nbf": 1690000000,
  "exp": 1690000900
}
```

- 签名密钥：`NEXTAUTH_SECRET`（与 Web cookie 共用，校验/Preview/生产已注入）。由各部署平台注入，禁止硬编码。
- `sub` 即用户数据 ownership 的 `userId`；数据接口一律以“查库带 `userId`”隔离。

### refresh token 语义

- **一次性 / 原子轮换（CAS）**：每次 refresh 成功即把该会话的 `refresh_token_hash` 换成新哈希。轮换以「旧哈希 + 未撤销 + 未过期」做原子条件更新，并发/重放旧 token 时只有一个请求成功，其余 `401 invalid_refresh`。
- **撤销**：`logout` 把会话 `revoked_at` 置时间戳；此后该 refresh 与（未过期但已被注销的）access 都失效。
- 并发窗口：同一 refresh 并发使用只保证“先到先用，后到 401”；多设备应各自持有独立 refresh token（各自 `deviceId` / 会话）。

## 端点

### `POST /api/auth/native/login`

在取得短期 access token 的同时建立设备级会话。

请求体：

```jsonc
{
  "email": "user@example.com",
  "password": "…",
  "deviceId": "optional-device-uuid",   // 可选，缺省服务端生成稳定 device-<rand>
  "deviceName": "My Mac",               // 可选
  "platform": "macos"                   // "macos" | "ios" | "ipados"，缺省 "ios"
}
```

响应 `200`：

```jsonc
{
  "accessToken": "…",
  "refreshToken": "…",
  "expiresIn": 900,
  "refreshExpiresIn": 2592000,
  "sessionId": "…",
  "user": { "id": "…", "email": "…", "name": "…" }
}
```

错误：

| 状态 | code | 说明 |
|------|------|------|
| 400 | `invalid_request` | 请求体不完整 / schema 非法 |
| 401 | `invalid_credentials` | 邮箱未注册 / 密码错误（时序用 dummy hash 抹平枚举） |
| 429 | `rate_limited` | 命中 email+IP 登录限速（复用 Web 登录限速器） |

### `POST /api/auth/native/refresh`

用 refresh token 换取新 access + **原子轮换**出新 refresh。

请求体：

```jsonc
{ "refreshToken": "…" }
```

响应 `200`：

```jsonc
{
  "accessToken": "…",
  "refreshToken": "…",      // 新 refresh，旧 refresh 立即失效
  "expiresIn": 900,
  "refreshExpiresIn": 2592000,
  "sessionId": "…"
}
```

轮换是**原子 CAS**：服务端以 `refresh_token_hash + sessionId + 未撤销 + 未过期` 做条件更新；
仅一个并发请求成功（旧哈希仍在才写），其余并发/重放得到 `401 invalid_refresh`。来源信息
（IP / UA）、滑动过期窗口与 `refreshCount` 在同一条原子 UPDATE 内完成，不存在「已轮换但记录未更新」的中间态。

刷新**限速**：独立 `refresh-fail:<hash>:<ip>` 桶（`hash` 为 refresh token 的 HMAC，不泄露 token），
与登录桶不共享。命中限速返回：

| 状态 | code | 说明 |
|------|------|------|
| 429 | `rate_limited` | 刷新尝试过多（连续失败达上限），滑动锁定后解锁 |

成功刷新清空该刷新桶，失败（无效/已轮换/已撤销/已过期）计数一次。

错误：`400 invalid_request` / `401 invalid_refresh`（无效、已轮换、已撤销、已过期）/ `429 rate_limited`。

### `POST /api/auth/native/logout`

吊销当前会话的 refresh 与 access 能力。支持两种定位（可同时，均只作用调用者自己的会话）：

- body：`{ "refreshToken": "…" }`
- 或 header：`Authorization: Bearer <accessToken>`

响应 `204`。未知 / 已轮换 / 已注销视为幂等成功（不泄漏会话状态）。

### `GET /api/auth/native/session`

读取当前 bearer 会话的公开身份（供客户端恢复会话上下文）。

需 `Authorization: Bearer <accessToken>`。响应 `200`：

```jsonc
{
  "session": {
    "id": "…",
    "deviceId": "…",
    "platform": "ios",
    "deviceName": "…",
    "createdAt": "…",
    "updatedAt": "…",
    "lastUsedAt": "…"
  }
}
```

错误：`401 unauthorized`。

## 鉴权与 ownership 隔离

`resolveRequestUser(request)` 统一解析路由身份：

1. 优先级：`Authorization: Bearer <native access>` → 验签 + 未过期 + **未注销** → 返回 `{ id: sub }`。
2. 回退：NextAuth cookie session（Web 路径原样）。

已接入证明点：`POST /api/sync/pull`（native bearer 可进入并只读本人数据；`WHERE userId = <current>` 隔离）。
所有数据接口都应经此类解析并带 `userId` 过滤，不得依赖 ID 猜测。

## DB 模型

`NativeSession`（`native_sessions`）关键列：

- `refresh_token_hash`（unique）— 只存哈希
- `device_id` / `platform` / `device_name`
- `last_ip` / `last_user_agent` / `last_used_at` / `last_refreshed_at`
- `refresh_expires_at` / `revoked_at` / `refresh_count`

迁移：`packages/db/prisma/migrations/20260801090000_add_native_sessions/migration.sql`（additive-only，不动既有迁移）。

## 客户端对接建议（后续 Issue 落地 `apps/apple`）

- 拿到 `refreshToken` 后立即存 **Keychain**。
- `accessToken` 短命（15 min），到期前用 `refreshToken` 刷新；refresh 401（已轮换/已注销）→ 走重新登录。
- 每个安装（或每次“退出并重新登录”）都用独立 `deviceId`，保证多设备撤销互不影响。
