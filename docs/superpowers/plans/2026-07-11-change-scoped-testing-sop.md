# Change-Scoped Testing SOP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Mewmo select tests by changed behavior, provide deterministic validation-domain commands, reject new theme-dependent hard-coded colors, and retain a fixed production release gate.

**Architecture:** Keep policy in `agent.md` and executable truth in root scripts. Separate self-contained tests from API integration tests, give integration tests an owned harness, make CI call repository scripts, and enforce theme color policy with a diff-aware scanner plus a centralized exception file. Existing global process skills remain unchanged.

**Tech Stack:** pnpm, Node.js test runner, Vitest, Turborepo, Next.js, Docker Compose, PostgreSQL, Redis, GitHub Actions, Vercel.

---

## File Map

- Modify `package.json` to expose `test:unit`, `test:integration`, `test:theme`, `test`, and `verify` as stable validation domains.
- Modify `tests/scaffold.test.mjs` to enforce the domain scripts without requiring the script list to be closed.
- Create `tooling/run-api-integration-tests.mjs` to own Web startup, fixture HTTP, account setup, test execution, cleanup, and child shutdown.
- Create `tests/integration/api-test-env.mjs` to centralize integration URLs and credentials supplied by the harness.
- Move four API suites from `tests/unit/` to `tests/integration/` and replace hard-coded environment values.
- Create `tooling/check-theme-colors.mjs` to scan newly added application UI lines for forbidden theme-dependent colors.
- Create `tooling/theme-color-allowlist.json` as the single reviewed exception registry.
- Create `tests/unit/theme-color-policy.test.mjs` to test scanner detection and exceptions without depending on Git history.
- Modify `.github/workflows/ci.yml` to invoke repository scripts rather than reproduce their file-selection logic.
- Modify `agent.md` to define change-scoped selection, assertion lifecycle, theme acceptance, environment boundaries, and production evidence.

### Task 1: Establish deterministic validation-domain scripts

**Files:**
- Modify: `tests/scaffold.test.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Write failing script-contract assertions**

Add assertions to `tests/scaffold.test.mjs` after the required-script loop:

```js
for (const script of ["test:unit", "test:integration", "test:theme", "verify"]) {
  assert.equal(typeof pkg.scripts[script], "string", `missing root script: ${script}`);
}
assert.equal(pkg.scripts.test, "pnpm test:unit");
assert.match(pkg.scripts.verify, /pnpm lint/);
assert.match(pkg.scripts.verify, /pnpm test:unit/);
assert.match(pkg.scripts.verify, /pnpm test:theme/);
assert.match(pkg.scripts.verify, /pnpm build/);
```

- [ ] **Step 2: Run the contract test and verify RED**

Run: `node --test tests/scaffold.test.mjs`

Expected: FAIL with `missing root script: test:unit`.

- [ ] **Step 3: Add root validation-domain scripts**

Replace the root test command and add these entries in `package.json`:

```json
"test": "pnpm test:unit",
"test:unit": "tsx --test tests/*.test.mjs tests/unit/*.test.mjs && vitest run tests/unit/*.test.ts && turbo run test",
"test:integration": "node tooling/run-api-integration-tests.mjs",
"test:theme": "node tooling/check-theme-colors.mjs",
"verify": "pnpm lint && pnpm test:unit && pnpm test:theme && pnpm build"
```

Do not add API integration paths to `test:unit`; a clean checkout must be able to run it without Web, PostgreSQL, Redis, an account, or network access.

- [ ] **Step 4: Make CI consume the repository scripts**

Replace the three test-selection steps in `.github/workflows/ci.yml` with:

```yaml
      - run: pnpm test:unit

      - run: pnpm test:theme
```

Keep the existing lint and build steps instead of running `pnpm verify`, so GitHub presents each release gate separately. Keep `TZ: Asia/Shanghai` because it stabilizes the runner environment rather than selecting tests.

- [ ] **Step 5: Verify GREEN**

Run: `node --test tests/scaffold.test.mjs`

Expected: all scaffold tests pass.

- [ ] **Step 6: Commit the validation domains**

```bash
git add package.json tests/scaffold.test.mjs .github/workflows/ci.yml
git commit -m "test: define validation domain commands"
```

### Task 2: Give API integration tests an owned environment

**Files:**
- Create: `tests/integration/api-test-env.mjs`
- Create: `tooling/run-api-integration-tests.mjs`
- Move: `tests/unit/clips-api.test.mjs` to `tests/integration/clips-api.test.mjs`
- Move: `tests/unit/feeds-api.test.mjs` to `tests/integration/feeds-api.test.mjs`
- Move: `tests/unit/notes-api.test.mjs` to `tests/integration/notes-api.test.mjs`
- Move: `tests/unit/sync-api.test.mjs` to `tests/integration/sync-api.test.mjs`
- Test: `tests/unit/integration-harness-static.test.mjs`

- [ ] **Step 1: Write a failing harness contract test**

Create `tests/unit/integration-harness-static.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("API integration tests own services, fixtures, identity, and cleanup", () => {
  const harness = read("tooling/run-api-integration-tests.mjs");
  const env = read("tests/integration/api-test-env.mjs");
  const clipTest = read("tests/integration/clips-api.test.mjs");

  assert.match(harness, /docker\/docker-compose\.yml/);
  assert.match(harness, /pnpm db:push/);
  assert.match(harness, /pnpm --filter @mewmo\/web dev/);
  assert.match(harness, /waitForHttp/);
  assert.match(harness, /cleanupTestUser/);
  assert.match(harness, /finally/);
  assert.match(env, /API_TEST_EMAIL/);
  assert.match(env, /API_TEST_ARTICLE_URL/);
  assert.doesNotMatch(clipTest, /zoo@mewmo\.app|example\.com/);
});
```

- [ ] **Step 2: Move the suites and verify RED**

Move the four files with `mv` and run:

`node --test tests/unit/integration-harness-static.test.mjs`

Expected: FAIL because the harness and environment module do not exist.

- [ ] **Step 3: Centralize integration environment values**

Create `tests/integration/api-test-env.mjs`:

```js
export const API_BASE = process.env.API_TEST_BASE_URL ?? "http://127.0.0.1:3000";
export const API_TEST_EMAIL = process.env.API_TEST_EMAIL ?? "integration@mewmo.test";
export const API_TEST_PASSWORD = process.env.API_TEST_PASSWORD ?? "integration-test-password";
export const API_TEST_ARTICLE_URL =
  process.env.API_TEST_ARTICLE_URL ?? "http://127.0.0.1:3101/article";
```

Update all four suites to import these values. Replace `BASE`, the fixed email/password, and the clip URL with the imported constants. Keep assertions and CRUD behavior unchanged.

- [ ] **Step 4: Implement the owned harness**

Create `tooling/run-api-integration-tests.mjs` with these explicit phases:

```js
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { getPrisma } from "@mewmo/db";

const root = new URL("../", import.meta.url).pathname;
const email = `integration-${randomUUID()}@mewmo.test`;
const password = "integration-test-password";
const env = {
  ...process.env,
  API_TEST_BASE_URL: "http://127.0.0.1:3000",
  API_TEST_ARTICLE_URL: "http://127.0.0.1:3101/article",
  API_TEST_EMAIL: email,
  API_TEST_PASSWORD: password,
};

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: "inherit", ...options });
    child.once("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`))));
    child.once("error", reject);
  });
}

async function waitForHttp(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function cleanupTestUser() {
  await getPrisma().user.deleteMany({ where: { email } });
}
```

Complete the same file so `main()`:

1. Runs `docker compose -f docker/docker-compose.yml up -d postgres redis`.
2. Runs `pnpm db:push`.
3. Starts a fixture HTTP server on `127.0.0.1:3101` returning deterministic article HTML.
4. Spawns `pnpm --filter @mewmo/web dev` with the harness environment.
5. Calls `waitForHttp("http://127.0.0.1:3000/login")`.
6. Registers the unique account through `/api/register` and requires status `201`.
7. Runs `node --test tests/integration/*.test.mjs`.
8. In `finally`, calls `cleanupTestUser()`, closes the fixture server, sends `SIGTERM` to the owned Web child, and disconnects Prisma.

The harness may start Docker services but must not stop services it did not create; it only owns the Web and fixture child processes it spawned.

- [ ] **Step 5: Verify the static harness contract GREEN**

Run: `node --test tests/unit/integration-harness-static.test.mjs`

Expected: PASS.

- [ ] **Step 6: Run the real integration domain**

Run: `pnpm test:integration`

Expected: all four API suites pass, the command exits without residual `node --test` or Web child processes, and the unique test user no longer exists.

- [ ] **Step 7: Re-run the self-contained domain**

Run: `pnpm test:unit`

Expected: PASS without starting Web or touching the integration database.

- [ ] **Step 8: Commit integration isolation**

```bash
git add tooling/run-api-integration-tests.mjs tests/integration tests/unit/integration-harness-static.test.mjs tests/unit
git commit -m "test(api): isolate integration environment"
```

### Task 3: Reject new theme-dependent hard-coded colors

**Files:**
- Create: `tooling/check-theme-colors.mjs`
- Create: `tooling/theme-color-allowlist.json`
- Create: `tests/unit/theme-color-policy.test.mjs`

- [ ] **Step 1: Write failing scanner unit tests**

Create `tests/unit/theme-color-policy.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { findThemeColorViolations } from "../../tooling/check-theme-colors.mjs";

describe("theme color policy", () => {
  it("rejects fixed foreground colors in application UI", () => {
    const source = [
      "+  color: #fff;",
      "+  color: white;",
      '+  <span className="text-white">Name</span>',
      "+  color: rgb(255, 255, 255);",
    ].join("\n");
    expect(findThemeColorViolations("apps/web/src/components/Card.tsx", source, [])).toHaveLength(4);
  });

  it("accepts semantic variables and reviewed exceptions", () => {
    expect(findThemeColorViolations("apps/web/src/components/Card.tsx", "+  color: var(--ink);", [])).toEqual([]);
    expect(
      findThemeColorViolations("apps/web/src/app/(marketing)/page.tsx", '+  <span className="text-white">Brand</span>', [
        { path: "apps/web/src/app/(marketing)/page.tsx", pattern: "text-white", reason: "fixed brand artwork" },
      ]),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: Run scanner tests and verify RED**

Run: `pnpm exec vitest run tests/unit/theme-color-policy.test.mjs`

Expected: FAIL because `tooling/check-theme-colors.mjs` does not exist.

- [ ] **Step 3: Implement the diff-aware scanner**

Create `tooling/check-theme-colors.mjs` exporting `findThemeColorViolations(path, addedLines, allowlist)`. Detect added lines containing foreground declarations or utility classes equivalent to fixed white or black:

```js
const forbidden = [
  /\bcolor\s*:\s*(?:#(?:fff|ffffff|000|000000)\b|white\b|black\b|rgb\(\s*(?:255\s*,\s*255\s*,\s*255|0\s*,\s*0\s*,\s*0)\s*\))/i,
  /\b(?:text-white|text-black)\b/,
];
```

An allowlist entry matches only when both `path` and `pattern` match, and every entry requires a non-empty `reason`. The CLI gathers added lines from `git show --format= --unified=0 HEAD -- apps/web/src`, `git diff --unified=0 HEAD -- apps/web/src`, and `git diff --cached --unified=0 -- apps/web/src`, deduplicates findings, prints `path:line: source`, and exits 1 on violations.

Do not scan deleted or context lines. This enforces new regressions without requiring an unrelated rewrite of existing brand and marketing CSS.

- [ ] **Step 4: Create the centralized exception registry**

Create `tooling/theme-color-allowlist.json` initially as:

```json
[]
```

Add an exception only when an existing changed line fails and the fixed color is intentionally theme-independent. Each entry must contain `path`, `pattern`, and `reason`; never allow an entire directory or a pattern as broad as `#fff`.

- [ ] **Step 5: Verify scanner tests GREEN and run the real scan**

Run:

```bash
pnpm exec vitest run tests/unit/theme-color-policy.test.mjs
pnpm test:theme
```

Expected: both commands pass. If the current commit contains deliberate fixed brand colors, add narrow reviewed exceptions and rerun.

- [ ] **Step 6: Commit theme enforcement**

```bash
git add tooling/check-theme-colors.mjs tooling/theme-color-allowlist.json tests/unit/theme-color-policy.test.mjs
git commit -m "test(theme): reject new hard-coded UI colors"
```

### Task 4: Replace prose-only testing guidance with the executable SOP

**Files:**
- Modify: `agent.md`
- Test: `tests/unit/testing-sop-static.test.mjs`

- [ ] **Step 1: Write a failing SOP contract test**

Create `tests/unit/testing-sop-static.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("agent testing SOP selects evidence by change and preserves the release gate", () => {
  const agent = readFileSync("agent.md", "utf8");
  assert.match(agent, /按改动影响面选择验证/);
  assert.match(agent, /pnpm test:unit/);
  assert.match(agent, /pnpm test:integration/);
  assert.match(agent, /pnpm test:theme/);
  assert.match(agent, /断言.*需求|需求.*断言/);
  assert.match(agent, /稳定生产别名/);
  assert.match(agent, /Vercel.*Ready/);
});
```

- [ ] **Step 2: Run the SOP test and verify RED**

Run: `node --test tests/unit/testing-sop-static.test.mjs`

Expected: FAIL because `agent.md` still describes a universal `pnpm test` sequence.

- [ ] **Step 3: Rewrite the existing validation section in place**

Replace `agent.md`'s current `### 验证顺序` content rather than appending a second testing rule. Preserve the surrounding release section and explain these points in prose:

- Select evidence from changed behavior and runtime boundaries; unrelated suites are omitted.
- `test:unit`, `test:integration`, and `test:theme` are distinct validation domains.
- UI changes require real dark/light switching; build success is not visual evidence.
- Ordinary application UI uses semantic theme variables; fixed colors require the central allowlist.
- Assertion failures are classified as implementation regression, approved requirement change, environment drift, or implementation-coupled assertion before edits.
- Local, GitHub CI, and Vercel have separate environments; CI localhost is not Vercel.
- Every production push keeps relevant tests, lint, build, clean tree, remote commit equality, successful CI, Vercel Ready, and stable production-alias smoke evidence.
- Reports name checks run, relevance, checks omitted, and reasons.

Also replace the existing frontend theme bullet with the semantic-variable and allowlist rule so theme guidance has one owner and remains MECE.

- [ ] **Step 4: Verify SOP contract GREEN**

Run: `node --test tests/unit/testing-sop-static.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit project policy**

```bash
git add agent.md tests/unit/testing-sop-static.test.mjs
git commit -m "docs(test): adopt change-scoped verification SOP"
```

### Task 5: Verify the complete system and release evidence format

**Files:**
- Modify only if verification exposes a defect in files from Tasks 1-4.

- [ ] **Step 1: Run project-policy checks**

Run:

```bash
node --test tests/scaffold.test.mjs tests/unit/integration-harness-static.test.mjs tests/unit/testing-sop-static.test.mjs
pnpm exec vitest run tests/unit/theme-color-policy.test.mjs
```

Expected: all targeted policy tests pass.

- [ ] **Step 2: Run the self-contained validation domain**

Run: `pnpm test:unit`

Expected: exit 0 with no dependency on localhost Web.

- [ ] **Step 3: Run theme enforcement**

Run: `pnpm test:theme`

Expected: exit 0 with no unreviewed hard-coded theme colors in added UI lines.

- [ ] **Step 4: Run API integration**

Run: `pnpm test:integration`

Expected: all API suites pass, cleanup completes, and no owned test process remains.

- [ ] **Step 5: Run the fixed production minimum gate**

Run: `pnpm verify`

Expected: lint, self-contained tests, theme policy, and all 13 package builds pass.

- [ ] **Step 6: Verify clean repository state**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and no uncommitted files after final corrective commits.

- [ ] **Step 7: Prepare the completion report**

Report exact commands and results under four labels: relevant tests, fixed production gate, intentionally omitted checks, and environment/deployment evidence. Do not report CI, Vercel Ready, or the production-alias smoke test until a push is authorized and those remote checks have actually completed.

