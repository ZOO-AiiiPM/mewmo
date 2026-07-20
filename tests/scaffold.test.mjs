import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const rootFiles = [
  "package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "tsconfig.json",
  "tooling/eslint/index.mjs",
  "tooling/typescript/base.json",
  "tooling/tailwind/postcss.config.mjs",
  "tooling/prettier/index.mjs",
];

const workspaces = [
  ["apps/web", "@mewmo/web"],
  ["apps/admin", "@mewmo/admin"],
  ["apps/worker", "@mewmo/worker"],
  ["apps/extension", "@mewmo/extension"],
  ["packages/db", "@mewmo/db"],
  ["packages/ai", "@mewmo/ai"],
  ["packages/sync", "@mewmo/sync"],
  ["packages/auth", "@mewmo/auth"],
  ["packages/queue", "@mewmo/queue"],
  ["packages/storage", "@mewmo/storage"],
  ["packages/email", "@mewmo/email"],
  ["packages/ui", "@mewmo/ui"],
  ["packages/shared", "@mewmo/shared"],
];

test("root monorepo scaffold files exist", () => {
  for (const file of rootFiles) {
    assert.equal(existsSync(file), true, `${file} should exist`);
  }
});

test("root package exposes required workspace scripts", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));

  assert.equal(pkg.private, true);
  for (const script of ["build", "db:generate", "db:push", "dev", "lint", "test"]) {
    assert.equal(typeof pkg.scripts[script], "string", `missing root script: ${script}`);
  }
  for (const script of ["test:unit", "test:integration", "test:theme", "verify"]) {
    assert.equal(typeof pkg.scripts[script], "string", `missing root script: ${script}`);
  }
  assert.equal(pkg.scripts.test, "pnpm test:unit");
  assert.match(pkg.scripts["test:unit"], /vitest run --dir tests\/unit/);
  assert.match(pkg.scripts["test:unit"], /--exclude '\*\*\/\*\.mjs'/);
  assert.match(pkg.scripts.verify, /pnpm lint/);
  assert.match(pkg.scripts.verify, /pnpm test:unit/);
  assert.match(pkg.scripts.verify, /pnpm test:theme/);
  assert.match(pkg.scripts.verify, /pnpm build/);
});

test("all apps and packages expose @mewmo package names", () => {
  for (const [dir, expectedName] of workspaces) {
    const packagePath = `${dir}/package.json`;

    assert.equal(existsSync(packagePath), true, `${packagePath} should exist`);

    const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
    assert.equal(pkg.name, expectedName);
    assert.equal(existsSync(`${dir}/tsconfig.json`), true, `${dir}/tsconfig.json should exist`);
  }
});

test("web instrumentation keeps node-only undici out of non-node bundles", () => {
  const source = readFileSync("apps/web/src/instrumentation.ts", "utf8");

  assert.equal(
    /import\s+.*\s+from\s+["']undici["']/.test(source),
    false,
    "instrumentation must not statically import undici",
  );
  assert.match(source, /NEXT_RUNTIME\s*===\s*["']nodejs["']/);
});

test("web instrumentation accepts lowercase proxy environment variables for local Node fetch", () => {
  const source = readFileSync("apps/web/src/instrumentation.ts", "utf8");

  assert.match(source, /process\.env\.https_proxy/, "local shells often expose lowercase https_proxy");
  assert.match(source, /process\.env\.http_proxy/, "local shells often expose lowercase http_proxy");
});

test("web Next config stays compatible with default Turbopack builds", () => {
  const source = readFileSync("apps/web/next.config.mjs", "utf8");

  assert.equal(
    /\bwebpack\s*:/.test(source),
    false,
    "Next 16 enables Turbopack by default, so next.config.mjs must not define webpack config",
  );
});
