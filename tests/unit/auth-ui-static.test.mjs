import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const loginPage = readFileSync("apps/web/src/app/(auth)/login/page.tsx", "utf8");
const registerPage = readFileSync("apps/web/src/app/(auth)/register/page.tsx", "utf8");
const authFrame = readFileSync("apps/web/src/components/auth/AuthFrame.tsx", "utf8");
const css = readFileSync("apps/web/src/app/globals.css", "utf8");

test("auth pages start Google OAuth through the Auth.js client helper", () => {
  for (const source of [loginPage, registerPage]) {
    assert.match(source, /from "next-auth\/react"/);
    assert.match(source, /signIn\("google"/);
    assert.doesNotMatch(source, /\/api\/auth\/signin\/google/);
  }
});

test("auth pages use the dedicated brand frame and stable theme tokens", () => {
  for (const source of [loginPage, registerPage]) {
    assert.match(source, /AuthFrame/);
    assert.doesNotMatch(source, /min-h-screen bg-paper flex items-center justify-center/);
  }

  assert.match(authFrame, /mewmo-auth-page/);
  assert.match(authFrame, /mewmo-workspace-preview\.png/);
  assert.match(authFrame, /mewmo-auth-visual/);
  assert.match(authFrame, /mewmo-auth-panel/);

  assert.match(css, /\.mewmo-auth-page\s*\{[\s\S]*height:\s*100dvh[\s\S]*overflow-y:\s*auto/);
  assert.match(css, /\.mewmo-auth-page\s*\{[\s\S]*--auth-bg:/);
  assert.match(css, /html\.light \.mewmo-auth-page\s*\{[\s\S]*--auth-bg:/);
  assert.match(css, /\.mewmo-auth-primary\s*\{[\s\S]*background:\s*var\(--auth-primary\)/);
  assert.match(css, /\.mewmo-auth-primary\s*\{[\s\S]*color:\s*var\(--auth-primary-ink\)/);
});
