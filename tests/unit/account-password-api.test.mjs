import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  "apps/web/src/app/api/account/password/route.ts",
  "utf8",
);

test("account password route authenticates and safely validates JSON input", () => {
  assert.match(source, /const session = await auth\(\)/);
  assert.match(source, /if \(!session\?\.user\?\.id\)/);
  assert.match(source, /status:\s*401/);
  assert.match(source, /z\.object\(\{[\s\S]*currentPassword:\s*z\.string\(\)\.optional\(\)[\s\S]*newPassword:\s*z\.string\(\)[\s\S]*confirmPassword:\s*z\.string\(\)/);
  assert.match(
    source,
    /safeParse\(\s*await request\.json\(\)\.catch\(\(\) => null\),?\s*\)/,
  );
  assert.match(source, /if \(!parsed\.success\)[\s\S]*status:\s*400/);
});

test("account password route delegates to the domain service with password-only dependencies", () => {
  assert.match(source, /currentPassword:\s*parsed\.data\.currentPassword/);
  assert.match(source, /updateAccountPassword\(\s*session\.user\.id,\s*input,\s*\{/s);
  assert.match(source, /findUnique\(\{\s*where:\s*\{\s*id:\s*userId\s*\},?\s*select:\s*\{\s*password:\s*true\s*\},?\s*\}\)/s);
  assert.match(source, /return user\?\.password/);
  assert.match(source, /update\(\{\s*where:\s*\{\s*id:\s*userId\s*\},?\s*data:\s*\{\s*password:\s*hash\s*\},?\s*\}\)/s);
  assert.match(source, /verifyPassword,/);
  assert.match(source, /hashPassword,/);
  assert.match(source, /from "@mewmo\/auth"/);
});

test("account password route returns only the public success contract", () => {
  assert.match(source, /NextResponse\.json\(\{\s*ok:\s*true,\s*mode:\s*result\.mode\s*\}\)/s);
  assert.doesNotMatch(source, /NextResponse\.json\(\{[^}]*hash/s);
  assert.doesNotMatch(source, /NextResponse\.json\(\{[^}]*password/s);
});

test("account password route maps every domain error to its API contract", () => {
  const expectedMappings = [
    ["CURRENT_PASSWORD_REQUIRED", 400, "请输入当前密码", "currentPassword"],
    ["CURRENT_PASSWORD_INCORRECT", 400, "当前密码不正确", "currentPassword"],
    ["PASSWORD_TOO_SHORT", 400, "新密码至少需要 8 位", "newPassword"],
    ["PASSWORD_CONFIRMATION_MISMATCH", 400, "两次输入的新密码不一致", "confirmPassword"],
    ["PASSWORD_UNCHANGED", 400, "新密码不能与当前密码相同", "newPassword"],
  ];

  for (const [code, status, error, field] of expectedMappings) {
    assert.match(source, new RegExp(`${code}:[\\s\\S]*status: ${status},[\\s\\S]*error: "${error}",[\\s\\S]*field: "${field}"`));
  }

  assert.match(source, /USER_NOT_FOUND:[\s\S]*status:\s*404,[\s\S]*error:\s*"未找到账户"/);
  assert.doesNotMatch(source, /USER_NOT_FOUND:[\s\S]*field:/);
  assert.match(source, /const \{ status, \.\.\.body \} = errorResponses\[error\.code\]/);
  assert.match(source, /NextResponse\.json\(body, \{ status \}\)/);
});
