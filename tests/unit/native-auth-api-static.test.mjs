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
  assert.match(svc, /repo\.rotate/);
  assert.match(svc, /repo\.revoke/);
});
