import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("native auth data model is additive and exposes User relation", () => {
  const schema = read("packages/db/prisma/schema.prisma");

  assert.match(
    schema,
    /model NativeSession \{[\s\S]*userId\s+String\s+@map\("user_id"\)[\s\S]*refreshTokenHash\s+String\s+@unique\s+@map\("refresh_token_hash"\)/,
  );
  assert.match(schema, /revokedAt\s+DateTime\?\s+@map\("revoked_at"\)/);
  assert.match(schema, /refreshCount\s+Int\s+@default\(0\)\s+@map\("refresh_count"\)/);
  assert.match(schema, /@@map\("native_sessions"\)/);
  assert.match(schema, /model User \{[\s\S]*nativeSessions\s+NativeSession\[\]/);
});

test("native auth migration is additive-only and correctly named", () => {
  const dir = "packages/db/prisma/migrations/20260801090000_add_native_sessions";
  assert.equal(existsSync(`${dir}/migration.sql`), true);

  const sql = read(`${dir}/migration.sql`);
  assert.match(sql, /CREATE TABLE "native_sessions"/);
  assert.match(sql, /"refresh_token_hash" TEXT NOT NULL/);
  assert.match(sql, /"revoked_at" TIMESTAMP\(3\)/);
  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|COLUMN|TYPE|INDEX|SCHEMA)\b/i);
  assert.doesNotMatch(sql, /\bRENAME\s+(TABLE|COLUMN)\b/i);

  // 不触碰既有迁移（baseline 与 reconciliation 字节断言靠 file-unchanged 保持绿）
  assert.equal(
    existsSync("packages/db/prisma/migrations/20260723051500_init/migration.sql"),
    true,
  );
});

test("native auth API routes exist and validate request bodies with zod", () => {
  const login = read("apps/web/src/app/api/auth/native/login/route.ts");
  const refresh = read("apps/web/src/app/api/auth/native/refresh/route.ts");
  const logout = read("apps/web/src/app/api/auth/native/logout/route.ts");
  const session = read("apps/web/src/app/api/auth/native/session/route.ts");
  const contract = read("apps/web/src/lib/native-auth-contract.ts");

  assert.ok(existsSync("apps/web/src/lib/native-auth.ts"));
  assert.ok(existsSync("apps/web/src/lib/native-auth-contract.ts"));
  assert.ok(existsSync("apps/web/src/lib/request-user.ts"));
  assert.ok(existsSync("packages/db/src/repositories/native-sessions.ts"));

  assert.match(contract, /nativeLoginBodySchema\s*=\s*z\.object/);
  assert.match(contract, /nativeRefreshBodySchema\s*=\s*z\.object/);
  assert.match(contract, /nativeLogoutBodySchema\s*=\s*z\.object/);

  assert.match(login, /createNativeAuthService\(\{[\s\S]*rateLimiter:\s*getLoginRateLimiter\(\)/);
  assert.match(login, /service\.login/);
  assert.match(refresh, /service\.refresh/);
  assert.match(logout, /service\.revokeByRefreshToken|service\.revokeSession/);
  assert.match(session, /service\.getSessionInfo/);

  // bearer 鉴权必须出现在数据与会话读取路径
  assert.match(logout, /Authorization/);
  assert.match(session, /Authorization/);
});

test("web credentials flow stays untouched and native bearer plugs into sync ownership", () => {
  const webAuth = read("apps/web/src/lib/auth.ts");
  const syncPull = read("apps/web/src/app/api/sync/pull/route.ts");

  // Web cookie 路径原样保留（JWT strategy），不因 native 改动而被替换
  assert.match(webAuth, /NextAuth\(createAuthConfig/);
  assert.doesNotMatch(webAuth, /NativeSession|native/i);

  // sync 数据接口改走 bearer-or-cookie 解析，ownership 仍按 userId 过滤
  assert.match(syncPull, /resolveRequestUser\(request\)/);
  assert.match(syncPull, /const userId = user\.id;/);
  assert.match(syncPull, /where: \{ userId/);
});

test("native token service exposes rotation and revocation primitives", () => {
  const svc = read("apps/web/src/lib/native-auth.ts");
  const authModule = read("packages/auth/src/native-session.ts");

  assert.match(authModule, /signNativeAccessToken/);
  assert.match(authModule, /verifyNativeAccessToken/);
  assert.match(authModule, /generateRefreshToken/);
  assert.match(authModule, /hashRefreshToken/);
  assert.match(svc, /hashRefreshToken/);
  assert.match(svc, /repo\.rotateIfCurrent/);
  assert.match(svc, /rotated\.count\s*===\s*0/);
  assert.match(svc, /repo\.revoke/);
});

test("refresh rotation is atomic CAS with owner-scoped revocation", () => {
  const svc = read("apps/web/src/lib/native-auth.ts");
  const repo = read("packages/db/src/repositories/native-sessions.ts");

  // 仓库：旧哈希 + 未撤销 + 未过期 的原子 updateMany（count 作 CAS 结果）
  assert.match(repo, /rotateIfCurrent/);
  assert.match(repo, /updateMany/);
  assert.match(repo, /refreshTokenHash:\s*input\.oldRefreshTokenHash/);
  assert.match(repo, /revokedAt:\s*null/);
  assert.match(repo, /refreshExpiresAt:\s*\{\s*gte:\s*now\s*\}/);
  assert.doesNotMatch(repo, /\brotate\s*\(/); // 裸 rotate 已废弃，轮换统一走 CAS
  assert.doesNotMatch(repo, /\btouch\s*\(/); // 来源信息不再单独 touch，合并进 CAS

  // session 查询与吊销都同时约束 userId（ownership）
  assert.match(repo, /findFirst\(\{[\s\S]*where:\s*\{\s*id:\s*sessionId,\s*userId/);
  assert.match(repo, /revokeForUserBySessionId/);
  assert.match(svc, /revokeSession\(\s*userId:\s*string,\s*sessionId:\s*string\s*\)/);
});

test("refresh endpoint is rate-limited with a stable rate_limited contract", () => {
  const refreshRoute = read("apps/web/src/app/api/auth/native/refresh/route.ts");
  const store = read("apps/web/src/lib/login-attempt-store.ts");
  const svc = read("apps/web/src/lib/native-auth.ts");

  // 路由注入独立的 refresh 限速器（不与登录桶共享）
  assert.match(refreshRoute, /getRefreshRateLimiter\(\)/);
  assert.match(refreshRoute, /refreshRateLimiter:/);

  // 存储：IP 权威桶（收敛同一来源的枚举）+ token 重放桶，键不含明文 token
  assert.match(store, /REFRESH_IP_BUCKET_PREFIX\s*=\s*"refresh-fail-ip"/);
  assert.match(store, /REFRESH_TOKEN_BUCKET_PREFIX\s*=\s*"refresh-fail-token"/);
  assert.match(store, /getRefreshRateLimiter/);
  assert.match(store, /ipKey\(REFRESH_IP_BUCKET_PREFIX,\s*ip\)/);
  assert.match(store, /tokenKey\(REFRESH_TOKEN_BUCKET_PREFIX/);

  // 服务：命中限速抛 429 rate_limited；失败记录、成功清理
  assert.match(svc, /refreshRateLimiter\s*&&\s*\(await\s+refreshRateLimiter\.isLocked/);
  assert.match(svc, /429,\s*"rate_limited"/);
  assert.match(svc, /refreshRateLimiter\?\.\s*recordFailure/);
  assert.match(svc, /refreshRateLimiter\?\.\s*clear/);
});
