import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const loginPage = readFileSync("apps/web/src/app/(auth)/login/page.tsx", "utf8");
const registerPage = readFileSync("apps/web/src/app/(auth)/register/page.tsx", "utf8");

test("auth pages start Google OAuth through the Auth.js client helper", () => {
  for (const source of [loginPage, registerPage]) {
    assert.match(source, /from "next-auth\/react"/);
    assert.match(source, /signIn\("google"/);
    assert.doesNotMatch(source, /\/api\/auth\/signin\/google/);
  }
});
