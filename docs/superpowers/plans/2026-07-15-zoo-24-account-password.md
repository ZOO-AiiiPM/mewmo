# ZOO-24 Account Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a site-consistent account settings page where authenticated users can change an existing password or create their first password without removing Google or email-link login access.

**Architecture:** Keep password rules in a focused, dependency-injected domain service so credential and passwordless behavior can be tested without Next.js or Prisma. Expose one authenticated API route that maps domain errors to safe responses. Replace the unused settings scaffold with a server-loaded account page and a small client form that reuses the current menu, token, input, button, and toast patterns.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma, Auth.js, bcrypt helpers from `@mewmo/auth`, Zod, Vitest, Node test runner, existing `FloatingMenuLink`, `PrototypeIcon`, and `ToastProvider`.

---

### Task 1: Password update domain service

**Files:**
- Create: `apps/web/src/lib/account-password.ts`
- Create: `apps/web/src/lib/account-password.test.ts`

- [ ] **Step 1: Write the failing service tests**

Cover an existing-password update, incorrect current password, unchanged password, passwordless setup, minimum length, confirmation mismatch, and preservation of provider state through a password-only update dependency.

```ts
import { describe, expect, it, vi } from "vitest";
import { updateAccountPassword } from "./account-password";

function deps(password: string | null) {
  return {
    findPassword: vi.fn().mockResolvedValue(password),
    verifyPassword: vi.fn().mockResolvedValue(true),
    hashPassword: vi.fn().mockResolvedValue("next-hash"),
    updatePassword: vi.fn().mockResolvedValue(undefined),
  };
}

describe("updateAccountPassword", () => {
  it("verifies and replaces an existing password", async () => {
    const subject = deps("old-hash");
    const result = await updateAccountPassword("user-1", {
      currentPassword: "old password",
      newPassword: "new password",
      confirmPassword: "new password",
    }, subject);

    expect(subject.verifyPassword).toHaveBeenNthCalledWith(1, "old password", "old-hash");
    expect(subject.updatePassword).toHaveBeenCalledWith("user-1", "next-hash");
    expect(result).toEqual({ mode: "changed" });
  });

  it("creates a password without requiring a current password", async () => {
    const subject = deps(null);
    await expect(updateAccountPassword("user-1", {
      newPassword: "new password",
      confirmPassword: "new password",
    }, subject)).resolves.toEqual({ mode: "created" });
    expect(subject.verifyPassword).not.toHaveBeenCalled();
  });

  it("rejects an incorrect current password", async () => {
    const subject = deps("old-hash");
    subject.verifyPassword.mockResolvedValue(false);

    await expect(updateAccountPassword("user-1", {
      currentPassword: "wrong password",
      newPassword: "new password",
      confirmPassword: "new password",
    }, subject)).rejects.toMatchObject({ code: "CURRENT_PASSWORD_INCORRECT" });
    expect(subject.updatePassword).not.toHaveBeenCalled();
  });

  it("rejects the existing password as the new password", async () => {
    const subject = deps("old-hash");
    subject.verifyPassword.mockResolvedValueOnce(true).mockResolvedValueOnce(true);

    await expect(updateAccountPassword("user-1", {
      currentPassword: "old password",
      newPassword: "old password",
      confirmPassword: "old password",
    }, subject)).rejects.toMatchObject({ code: "PASSWORD_UNCHANGED" });
    expect(subject.updatePassword).not.toHaveBeenCalled();
  });

  it.each([
    [{ newPassword: "short", confirmPassword: "short" }, "PASSWORD_TOO_SHORT"],
    [{ newPassword: "new password", confirmPassword: "different" }, "PASSWORD_CONFIRMATION_MISMATCH"],
  ])("rejects invalid input", async (input, code) => {
    await expect(updateAccountPassword("user-1", input, deps(null)))
      .rejects.toMatchObject({ code });
  });
});
```

- [ ] **Step 2: Run the service test and confirm RED**

Run: `pnpm exec vitest run apps/web/src/lib/account-password.test.ts`

Expected: FAIL because `account-password.ts` does not exist.

- [ ] **Step 3: Implement the service**

```ts
export type AccountPasswordErrorCode =
  | "USER_NOT_FOUND"
  | "CURRENT_PASSWORD_REQUIRED"
  | "CURRENT_PASSWORD_INCORRECT"
  | "PASSWORD_TOO_SHORT"
  | "PASSWORD_CONFIRMATION_MISMATCH"
  | "PASSWORD_UNCHANGED";

export class AccountPasswordError extends Error {
  constructor(public readonly code: AccountPasswordErrorCode) {
    super(code);
  }
}

interface PasswordInput {
  currentPassword?: string | undefined;
  newPassword: string;
  confirmPassword: string;
}

interface AccountPasswordDeps {
  findPassword: (userId: string) => Promise<string | null | undefined>;
  verifyPassword: (value: string, hash: string) => Promise<boolean>;
  hashPassword: (value: string) => Promise<string>;
  updatePassword: (userId: string, hash: string) => Promise<void>;
}

export async function updateAccountPassword(
  userId: string,
  input: PasswordInput,
  deps: AccountPasswordDeps,
) {
  if (input.newPassword.length < 8) throw new AccountPasswordError("PASSWORD_TOO_SHORT");
  if (input.newPassword !== input.confirmPassword) {
    throw new AccountPasswordError("PASSWORD_CONFIRMATION_MISMATCH");
  }

  const currentHash = await deps.findPassword(userId);
  if (currentHash === undefined) throw new AccountPasswordError("USER_NOT_FOUND");

  if (currentHash) {
    if (!input.currentPassword) throw new AccountPasswordError("CURRENT_PASSWORD_REQUIRED");
    if (!(await deps.verifyPassword(input.currentPassword, currentHash))) {
      throw new AccountPasswordError("CURRENT_PASSWORD_INCORRECT");
    }
    if (await deps.verifyPassword(input.newPassword, currentHash)) {
      throw new AccountPasswordError("PASSWORD_UNCHANGED");
    }
  }

  const nextHash = await deps.hashPassword(input.newPassword);
  await deps.updatePassword(userId, nextHash);
  return { mode: currentHash ? "changed" as const : "created" as const };
}
```

- [ ] **Step 4: Run the service tests and confirm GREEN**

Run: `pnpm exec vitest run apps/web/src/lib/account-password.test.ts`

Expected: all service cases pass.

- [ ] **Step 5: Commit the service**

```bash
git add apps/web/src/lib/account-password.ts apps/web/src/lib/account-password.test.ts
git commit -m "feat(auth): add account password service"
```

### Task 2: Authenticated password API

**Files:**
- Create: `apps/web/src/app/api/account/password/route.ts`
- Create: `tests/unit/account-password-api.test.mjs`

- [ ] **Step 1: Write a failing API contract test**

The static contract must assert that the route authenticates before reading account data, delegates password rules to `updateAccountPassword`, updates only `User.password`, uses shared hash/verify helpers, and never serializes the hash.

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("account password route is authenticated and password-only", () => {
  const route = readFileSync("apps/web/src/app/api/account/password/route.ts", "utf8");
  assert.match(route, /const session = await auth\(\)/);
  assert.match(route, /if \(!session\?\.user\?\.id\)/);
  assert.match(route, /updateAccountPassword\(session\.user\.id/);
  assert.match(route, /select:\s*\{\s*password:\s*true\s*\}/);
  assert.match(route, /data:\s*\{\s*password:\s*hash\s*\}/);
  assert.doesNotMatch(route, /password:\s*user\.password/);
});
```

- [ ] **Step 2: Run the API contract and confirm RED**

Run: `node --test tests/unit/account-password-api.test.mjs`

Expected: FAIL because the API route does not exist.

- [ ] **Step 3: Implement `POST /api/account/password`**

Use `auth()` from `apps/web/src/lib/auth.ts`, `getPrisma()`, `hashPassword`, `verifyPassword`, Zod string validation, and the domain service. Return only `{ ok: true, mode }` on success. Map service codes to Chinese messages and optional fields:

```ts
const errorResponses = {
  CURRENT_PASSWORD_REQUIRED: { status: 400, error: "请输入当前密码", field: "currentPassword" },
  CURRENT_PASSWORD_INCORRECT: { status: 400, error: "当前密码不正确", field: "currentPassword" },
  PASSWORD_TOO_SHORT: { status: 400, error: "新密码至少需要 8 位", field: "newPassword" },
  PASSWORD_CONFIRMATION_MISMATCH: { status: 400, error: "两次输入的新密码不一致", field: "confirmPassword" },
  PASSWORD_UNCHANGED: { status: 400, error: "新密码不能与当前密码相同", field: "newPassword" },
  USER_NOT_FOUND: { status: 404, error: "未找到账户" },
} as const;
```

The Prisma dependencies must be limited to:

```ts
findPassword: async (userId) => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
  return user?.password;
},
updatePassword: async (userId, hash) => {
  await prisma.user.update({ where: { id: userId }, data: { password: hash } });
},
```

- [ ] **Step 4: Run API and service tests**

Run:

```bash
node --test tests/unit/account-password-api.test.mjs
pnpm exec vitest run apps/web/src/lib/account-password.test.ts
```

Expected: both pass.

- [ ] **Step 5: Commit the API**

```bash
git add apps/web/src/app/api/account/password/route.ts tests/unit/account-password-api.test.mjs
git commit -m "feat(auth): add account password endpoint"
```

### Task 3: Site-consistent account settings UI

**Files:**
- Create: `apps/web/src/app/(app)/settings/AccountSettingsClient.tsx`
- Replace: `apps/web/src/app/(app)/settings/page.tsx`
- Modify: `apps/web/src/components/shell/Sidebar.tsx`
- Modify: `apps/web/src/app/globals.css`
- Create: `tests/unit/account-settings-ui.test.mjs`

- [ ] **Step 1: Write the failing UI contract**

Assert that the account menu links to `/settings`, the page reads real authenticated account data, no placeholder English content remains, password mode comes from `hasPassword`, and styles use project variables rather than hard-coded light colors.

```js
test("account settings use the real shell and theme tokens", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
  const page = read("apps/web/src/app/(app)/settings/page.tsx");
  const client = read("apps/web/src/app/(app)/settings/AccountSettingsClient.tsx");
  const css = read("apps/web/src/app/globals.css");

  assert.match(sidebar, /<FloatingMenuLink[\s\S]*href="\/settings"[\s\S]*>账户管理/);
  assert.match(page, /auth\(\)[\s\S]*getPrisma\(\)[\s\S]*select:[\s\S]*password: true/);
  assert.doesNotMatch(page, /User|user@mewmo\.app|Claude 4 Sonnet|Export all data/);
  assert.match(client, /hasPassword \? "修改密码" : "设置密码"/);
  assert.match(css, /\.mewmo-account-settings[\s\S]*var\(--ink\)[\s\S]*var\(--line\)/);
});
```

- [ ] **Step 2: Run the UI contract and confirm RED**

Run: `node --test tests/unit/account-settings-ui.test.mjs`

Expected: FAIL because the focused account page and menu entry do not exist.

- [ ] **Step 3: Replace the settings scaffold with real server data**

Make `page.tsx` a server component. Authenticate, load only `name`, `email`, `image`, `password`, and `accounts.provider`, and pass a safe model to the client:

```ts
const account = await prisma.user.findUnique({
  where: { id: session.user.id },
  select: {
    name: true,
    email: true,
    image: true,
    password: true,
    accounts: { select: { provider: true } },
  },
});

const hasGoogle = account.accounts.some((item) => item.provider === "google");
const loginMethods = [
  ...(hasGoogle ? ["Google 登录"] : []),
  ...(account.password ? ["邮箱密码"] : []),
  ...(!hasGoogle && !account.password ? ["邮箱登录"] : []),
];
```

Do not pass `account.password` or raw provider IDs to the client; pass only `hasPassword` and localized method labels.

- [ ] **Step 4: Build the password form client**

`AccountSettingsClient` must render:

- a page title `账户管理` and short description;
- a compact identity card using the same avatar fallback as the sidebar;
- login-method chips;
- `当前密码` only when `hasPassword` is true;
- `新密码` and `确认新密码` in both modes;
- one primary action labeled `修改密码` or `设置密码`;
- field messages using `aria-describedby` and an `aria-live="polite"` result region.

Submit JSON to `/api/account/password`, disable the form while pending, map `field` responses to the matching input, clear all password fields after success, switch local `hasPassword` to true after first setup, and use `showToast` with `success` or `error`.

- [ ] **Step 5: Add the account-menu entry**

Import `FloatingMenuLink` in `Sidebar.tsx` and add this row above `帮助和支持`:

```tsx
<FloatingMenuLink href="/settings" icon="info" onClick={() => setAccountOpen(false)}>
  账户管理
</FloatingMenuLink>
```

Use the existing `info` account-menu icon so the new row matches the current prototype icon language without expanding the icon system in this issue.

- [ ] **Step 6: Add scoped theme-token styles**

Create `.mewmo-account-settings*` styles in `globals.css`. Use only existing variables such as `var(--bg)`, `var(--s2)`, `var(--line)`, `var(--ink)`, `var(--ink-soft)`, `var(--accent)`, and existing radii/shadows. Keep the content width near 680px, form width near 420px, 12–16px internal gaps, 38px input/button height, visible focus rings, and responsive padding below 720px. Do not add standalone Tailwind color classes or hard-coded white cards.

- [ ] **Step 7: Run UI, API, theme, and type checks**

Run:

```bash
node --test tests/unit/account-settings-ui.test.mjs tests/unit/account-password-api.test.mjs
pnpm exec vitest run apps/web/src/lib/account-password.test.ts
pnpm test:theme
pnpm exec tsc --noEmit -p apps/web/tsconfig.json
```

Expected: all pass.

- [ ] **Step 8: Commit the UI**

```bash
git add 'apps/web/src/app/(app)/settings' apps/web/src/components/shell/Sidebar.tsx apps/web/src/app/globals.css tests/unit/account-settings-ui.test.mjs
git commit -m "feat(settings): add account password management"
```

### Task 4: Review, browser acceptance, and Linear handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-07-15-zoo-24-account-password.md` only to record completed checks

- [ ] **Step 1: Run final automated verification**

Run:

```bash
node --test tests/unit/account-settings-ui.test.mjs tests/unit/account-password-api.test.mjs
pnpm exec vitest run apps/web/src/lib/account-password.test.ts
pnpm --filter @mewmo/web lint
pnpm exec tsc --noEmit -p apps/web/tsconfig.json
pnpm test:theme
pnpm --filter @mewmo/web build
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Review security and scope**

Confirm that the final diff does not return or log password hashes, does not update provider/account rows, never trusts a client-selected password mode, authenticates every API request, and does not introduce email reset, provider unlinking, or unrelated settings features.

- [ ] **Step 3: Browser-test both modes**

Verify on localhost in dark and light themes:

- the account menu row matches surrounding rows and opens `/settings`;
- the account page matches the existing shell, spacing, typography, controls, and focus treatment;
- an existing-password user sees all three fields and receives an error for a wrong current password;
- a passwordless user sees two fields, can set a password, then sees the change-password mode;
- duplicate submission is blocked and success/error toast feedback is visible;
- the page remains usable at narrow widths.

- [ ] **Step 4: Request code review and resolve findings**

Review the implementation against `docs/superpowers/specs/2026-07-15-zoo-24-account-password-design.md`, fixing all Critical and Important findings before proceeding.

- [ ] **Step 5: Update Linear for user acceptance**

Add a Chinese completion comment with implementation and verification evidence. Keep ZOO-24 `In Progress` until the user accepts the browser result, then mark it `Done` only after explicit acceptance.
