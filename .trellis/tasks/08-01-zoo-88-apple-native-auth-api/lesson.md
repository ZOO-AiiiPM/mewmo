# Lessons: ZOO-88 服务器端原生认证 API

This file captures raw observations from this task. Keep evidence and uncertainty visible; a later curation pass promotes durable guidance into `.trellis/spec/`.

## Observations

### 服务器端 native bearer session 的关键设计决策

- **access token 短命 + 无状态签名**：access 是 HS256 JWT（`kind=native_access, scope=native`，`sub`/`sid` claims），15 分钟，不落库。用一个 JWT 校验方（`verifyNativeAccessToken`）做验签+过期判定；数据接口无需每次查库就能在别处解析身份，但要「注销即失效」就必须在 `resolveAccessToken` 里**再查一次 session 的 revokedAt**。两者分层：`verifyNativeAccessToken` 纯验签（返回 `expired` 标志），`resolveAccessToken` 负责 DB 撤销校验。
- **refresh token 只存哈希**：opaque 随机串，库里只存 HMAC-SHA256（`refresh_token_hash` unique）。轮换 = 把该行哈希换成新哈希，旧 refresh 再使用即哈希不匹配 → 401。撤销 = 置 `revoked_at`。避免明文 token 落库。
- **`jose` 处理过期 JWT**：`jwtVerify` 对过期 token 抛 `JWTExpired` 而非返回带 `exp` 的 payload。要区分「已过期但签名合法」只能 catch `errors.JWTExpired` 后手动 base64 解码 claims 回放（`expired=true`），不能只靠 `jwtVerify` 的返回值。这是隐藏坑，未来维护要留意。

### 与既有 Web（NextAuth cookie）认证共存的接入点

- Web 认证链路（`auth()`/cookie/`/api/auth/*`）一行不改；native 只在 `resolveRequestUser(request)` 加 **Bearer 优先、cookie 回退** 分支，把它接进 `/api/sync/pull` 做 ownership 证明点。`oauth-only 无密码用户` 与「未知邮箱」一样走 dummy hash 抹平时序，避免枚举；登录限速复用 `LoginRateLimiter`（email+IP）。

### TypeScript / 工程坑

- 项目开了 **`exactOptionalPropertyTypes: true`**：zod `optional()` 产出 `field?: string | undefined`，与接口 `field?: string` 不兼容（`undefined` 显式传入被拒绝）。native 输入接口的可选字段必须写成 `field?: string | undefined`。
- **`jose` 的 `SignJWT(claims)` 需要 `JWTPayload`（带 index signature）**：自定义 claims 接口无 index signature 时需 `as unknown as JWTPayload` 才能通过 `tsc`。
- **`next build` 会改 `apps/web/next-env.d.ts`**（`./.next/dev/types` → `./.next/types`）：这是 Next 生成的构建产物漂移，**不应提交**，提交前 `git checkout HEAD -- apps/web/next-env.d.ts` 还原。
- 新增模型要手动写迁移 SQL 到 `packages/db/prisma/migrations/<ts>_<name>/migration.sql`；CI 不跑 `prisma migrate deploy`，但 `database-migrations-static.test.mjs` 会校验既有 baseline 字节一致与 reconciliation 加性——不修改既有迁移。

### 依赖

- `jose@^6.2.3` 加入 `@mewmo/auth` 直接依赖（pnpm store 已有，作为 @auth/core 的传递依赖），避免手写 HS256 或依赖传递 dep。
- Prisma client 需先 `pnpm db:generate`（本 worktree 未装依赖时无 `.prisma/client`，测试/构建会挂）。

### 验收发现的修复（ZOO-106 原子轮换 + ZOO-105 刷新限速）

- **读后写不是 CAS**：最初的 refresh 先按旧 hash `findUnique` 再按 sessionId `update`，两步并发会互相覆盖。正确做法用 `updateMany` + `WHERE`（sessionId + 旧 hash + `revokedAt:null` + `refreshExpiresAt >= now`）做 row-level CAS；`count===0` 即竞争失败（重放/已注销/已过期）须 401。来源信息/IP/UA 与过期窗口、refreshCount 合并进同一条 UPDATE，天然在同一事务边界，无需单独 touch。
- **mock 也要模拟原子性**：单测的 `updateMany` mock 必须按 `where` 条件对该行做 hit-apply/else `count:0`，否则测不出并发重放场景。并发失败用例 = 先成功轮换一次，再让旧 token 刷新 → CAS miss → 401。
- **限速键别泄露 token**：刷新限速用 refresh token 的 **HMAC 哈希 + IP** 作键，不用明文；独立 `refresh-fail` 桶与登录桶分离。畸形 token 也先哈希再走限速，失败计数、成功 clear，命中返回稳定 `429 + rate_limited`。
- **所有权查询必须带 userId**：`findActiveForUserBySessionId` 之前只查 `id`，被验收点出；改成 `findFirst({ where: { id, userId } })`，logout bearer 路径也改为 `revokeForUserBySessionId(userId, ...)`。
- **限速键若含 per-token 成分仍可被刷桶**：初版用 `refreshHash + IP` 作键，攻击者每次提交新随机 token 就得到一个全新桶，枚举仍无界。正确做法是 **IP 权威桶**（`refresh-fail-ip:<ip>`，键只含 IP，不随 token 变化 → 同一来源全部失败收敛）+ 可选 token 重放桶（`refresh-fail-token:<hash>:<ip>`）。`isLocked` 任一桶达上限即 429；`recordFailure` 两桶都计；成功才 `clear`。单测必须覆盖「多个不同无效 token 从同一 IP → 收敛达上限 → 429」。
