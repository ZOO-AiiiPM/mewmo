# ZOO-88 Implementation Plan

## Ordered Checklist

1. **DB**: 在 `packages/db/prisma/schema.prisma` 增加 `NativeSession` model + `User.nativeSessions`；
   新增迁移 `packages/db/prisma/migrations/20260801090000_add_native_sessions/migration.sql`（仅 CREATE TABLE + 索引，加性）。
2. **Repository**: `packages/db/src/repositories/native-sessions.ts` + 导出到 `index.ts`；
   提供 `create / findActiveByRefreshHash / rotate / revoke / updateTouch`（mock 友好的 client 注入写法，参照 `note-shares.ts`）。
3. **Auth 服务**: `packages/auth/src/native-session.ts`
   - `signNativeAccessToken(userId, sessionId, secret, ttlMs?)` / `verifyNativeAccessToken(token, secret)`
   - `generateRefreshToken()`（opaque 随机串）
   - `hashRefreshToken(token, secret)`（HMAC，防明文库）
   - `loginRateLimit` 复用 `LoginRateLimiter`。
   - `package.json` 已依赖 `@mewmo/db`、`@mewmo/shared`、`bcryptjs`；补 `jose` 用于 JWT（模块树内），若已存在用现成依赖。
4. **Web 封装**: `apps/web/src/lib/native-auth.ts`
   - `loginNative(...)` 组装 login 事务（限速锁 → 校验凭证 → 建 session → 签 token）
   - `refreshNative(...)`（CAS 轮换，事务内）
   - `logoutNative(...)`（吊销）
   - `resolveRequestUser(request)`（bearer → cookie 回退），导出供路由用。
5. **API 路由**（`apps/web/src/app/api/auth/native/`）：
   - `login/route.ts`、`refresh/route.ts`、`logout/route.ts`、`session/route.ts`（zod 校验体）。
6. **ownership 接入**: `apps/web/src/app/api/sync/pull/route.ts` 改用 `resolveRequestUser`，保留 `userId` 过滤。
7. **Tests**:
   - `tests/unit/native-auth.test.ts`（vitest）
   - `tests/unit/native-auth-api-static.test.mjs`（node:test 静态断言）
   - 复用/补 `packages/auth/src/native-session.test.ts`（若拆分服务层）。
8. **Contract 文档**: `docs/contracts/native-auth.md`（端点、schema、错误码、token 生命周期、轮换语义）。
9. **Lessons**: 用 ce-compound 沉淀任务级 lesson 到 `.trellis/tasks/<task>/lesson.md`。
10. **验证 + 提 PR**。

## Validation Commands

- `pnpm --filter @mewmo/auth lint && pnpm --filter @mewmo/db lint`
- `pnpm test:unit`（根命令：`tsx --test tests/*.test.mjs tests/unit/*.test.mjs && vitest run --dir tests/unit --exclude '**/*.mjs' && turbo run test`）
- `pnpm lint`
- `pnpm build`
- `git diff --check`

## Review / Rollback Gates

- 不修改既有迁移 SQL（`database-migrations-static.test.mjs` 字节断言会红）。
- 不动 Web 认证链路（`auth()`/cookie/`/api/auth/*`），只新增 native 分支。
- 若 `jose` 引入与依赖树冲突，退化为用 `NEXTAUTH_SECRET` + crypto 自签 HS256（优先查现成 jose 版本）。
- `prev` native 分支只接 sync/pull 做 ownership 证明点，不透传改动其余数据路由（scope 之外不溢出）。
- 提交、推送并开一个含 `ZOO-88` 的 PR；验收后仅由主控 `In Review` 验收，不自动 merge。
