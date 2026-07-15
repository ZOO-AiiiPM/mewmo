import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

function readSource(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

const pageSource = readSource(
  "apps/web/src/app/(app)/settings/page.tsx",
  "utf8",
);
const helperSource = readSource(
  "apps/web/src/app/(app)/settings/login-methods.ts",
);
const loadingSource = readSource(
  "apps/web/src/app/(app)/settings/loading.tsx",
);
const clientSource = readSource(
  "apps/web/src/app/(app)/settings/AccountSettingsClient.tsx",
  "utf8",
);
const sidebarSource = readSource(
  "apps/web/src/components/shell/Sidebar.tsx",
  "utf8",
);
const cssSource = readSource("apps/web/src/app/globals.css");

test("account menu links to account management before help and closes through FloatingMenuLink", () => {
  assert.match(sidebarSource, /import \{[^}]*FloatingMenuLink[^}]*\} from "\.\.\/ui\/FloatingMenu"/s);
  assert.match(
    sidebarSource,
    /<FloatingMenuLink\s+href="\/settings"\s+icon="info">账户管理<\/FloatingMenuLink>[\s\S]*帮助和支持/,
  );
});

test("settings server page authenticates and queries only the current user's account projection", () => {
  assert.match(pageSource, /const session = await auth\(\)/);
  assert.match(pageSource, /if \(!session\?\.user\?\.id\) redirect\("\/login"\)/);
  assert.match(pageSource, /const prisma = getPrisma\(\)/);
  assert.match(
    pageSource,
    /user\.findUnique\(\{\s*where:\s*\{\s*id:\s*session\.user\.id\s*\},\s*select:\s*\{[\s\S]*name:\s*true[\s\S]*email:\s*true[\s\S]*image:\s*true[\s\S]*password:\s*true[\s\S]*accounts:\s*\{\s*select:\s*\{\s*provider:\s*true\s*\}\s*\}/,
  );
  assert.doesNotMatch(pageSource, /providerAccountId/);
  assert.doesNotMatch(pageSource, /password=\{/);
  assert.match(pageSource, /hasPassword=\{Boolean\(user\.password\)\}/);
  assert.match(pageSource, /loginMethods=\{loginMethods\}/);
});

test("settings server page localizes only real login methods without passing provider ids", () => {
  assert.match(helperSource, /provider === "google"[\s\S]*"Google 登录"/);
  assert.match(helperSource, /provider === "password"[\s\S]*"邮箱密码"/);
  assert.match(helperSource, /provider === "email" \|\| provider === "resend"[\s\S]*"邮箱登录"/);
  assert.match(pageSource, /hasPassword:\s*Boolean\(user\.password\)/);
  assert.doesNotMatch(pageSource, /loginMethods=\{user\.accounts/);
  assert.doesNotMatch(clientSource, /provider(AccountId)?/);
});

test("login method derivation preserves real providers and handles Resend without an Account row", () => {
  const script = `
    import { getLocalizedLoginMethods } from "./apps/web/src/app/(app)/settings/login-methods.ts";
    const cases = [
      { hasPassword: false, email: "reader@example.com", providers: ["google"] },
      { hasPassword: false, email: "reader@example.com", providers: [] },
      { hasPassword: false, email: "reader@example.com", providers: ["resend"] },
      { hasPassword: true, email: "reader@example.com", providers: ["google"] },
    ];
    console.log(JSON.stringify(cases.map(getLocalizedLoginMethods)));
  `;
  const result = spawnSync("pnpm", ["exec", "tsx", "--eval", script], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const methods = JSON.parse(result.stdout.trim().split("\\n").at(-1));
  assert.deepEqual(
    methods[0],
    ["Google 登录"],
  );
  assert.deepEqual(
    methods[1],
    ["邮箱登录"],
  );
  assert.deepEqual(
    methods[2],
    ["邮箱登录"],
  );
  assert.deepEqual(
    methods[3],
    ["邮箱密码", "Google 登录"],
  );
});

test("settings route exposes an accessible themed loading state", () => {
  assert.match(loadingSource, /mewmo-account-settings-loading/);
  assert.match(loadingSource, /aria-busy="true"/);
  assert.match(loadingSource, /账户管理/);
  assert.match(cssSource, /\.mewmo-account-settings-loading[\s\S]*var\(--(?:canvas|s1|raised|ink|ink-soft|line)\)/);
});

test("account settings client renders identity, method chips, and both password modes", () => {
  assert.match(clientSource, /"use client"/);
  assert.match(clientSource, /账户管理/);
  assert.match(clientSource, /管理你的登录方式与密码/);
  assert.match(clientSource, /user\.image[\s\S]*<img[\s\S]*initial/s);
  assert.match(clientSource, /displayedLoginMethods\.map/);
  assert.match(clientSource, /displayedLoginMethods/);
  assert.match(clientSource, /hasLocalPassword \? "修改密码" : "设置密码"/);
  assert.match(clientSource, /hasLocalPassword\s*&&[\s\S]*当前密码/);
  assert.match(clientSource, /新密码/);
  assert.match(clientSource, /确认新密码/);
  assert.doesNotMatch(
    clientSource,
    /placeholder="(?:Current password|New password|Confirm password|Change password|Settings|Account|Appearance)"/,
  );
  assert.doesNotMatch(clientSource, /"User"|user@mewmo\.app/);
});

test("password form prevents duplicate submits and maps API errors accessibly", () => {
  assert.match(clientSource, /if \(pending\) return/);
  assert.match(clientSource, /if \(pendingRef\.current\) return/);
  assert.match(clientSource, /pendingRef\.current = true/);
  assert.match(clientSource, /pendingRef\.current = false/);
  assert.match(clientSource, /fetch\("\/api\/account\/password",\s*\{[\s\S]*method:\s*"POST"[\s\S]*headers:[\s\S]*"Content-Type":\s*"application\/json"[\s\S]*body:\s*JSON\.stringify/);
  assert.match(clientSource, /disabled=\{pending\}/);
  assert.match(clientSource, /aria-describedby=\{[\s\S]*ErrorId/);
  assert.match(clientSource, /aria-live="polite"/);
  assert.match(clientSource, /data\.field[\s\S]*setFieldErrors/);
  assert.match(clientSource, /showToast\([^,]+,\s*"success"\)/);
  assert.match(clientSource, /showToast\([^,]+,\s*"error"\)/);
  assert.match(clientSource, /setCurrentPassword\(""\)/);
  assert.match(clientSource, /setNewPassword\(""\)/);
  assert.match(clientSource, /setConfirmPassword\(""\)/);
  assert.match(clientSource, /setHasLocalPassword\(true\)/);
});

test("account settings CSS is scoped, theme-aware, compact, focused, and responsive", () => {
  assert.match(cssSource, /\.mewmo-account-settings\s*\{[\s\S]*max-width:\s*680px/);
  assert.match(cssSource, /\.mewmo-account-settings__[\w-]+/);
  assert.match(cssSource, /\.mewmo-account-settings__[\w-]+:focus-visible/);
  assert.match(cssSource, /height:\s*38px/);
  assert.match(cssSource, /max-width:\s*420px/);
  assert.match(cssSource, /gap:\s*(12|14|16)px/);
  assert.match(cssSource, /@media \(max-width:\s*720px\)[\s\S]*\.mewmo-account-settings/);

  const scopedCss =
    cssSource.match(/\/\* Account settings \*\/([\s\S]*?)\/\* End account settings \*\//)?.[1] ?? "";
  assert.match(scopedCss, /var\(--(?:canvas|s1|s2|s3|raised|hover|selected|ink|ink-soft|ink-faint|line|line-soft|accent|accent-2|hl|accent-ink|shadow)\)/);
  assert.doesNotMatch(
    scopedCss,
    /(?:color|background(?:-color)?|border-color):\s*(?:#fff(?:fff)?\b|white\b)|(?:slate|gray|zinc|neutral)-\d{2,3}/i,
  );
});
