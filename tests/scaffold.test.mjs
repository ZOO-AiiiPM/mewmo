import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const rootFiles = [
  "package.json",
  "pnpm-workspace.yaml",
  "turbo.json",
  "tsconfig.json",
  ".env.example",
  "docker/docker-compose.yml",
  "tooling/eslint/index.mjs",
  "tooling/typescript/base.json",
  "tooling/tailwind/postcss.config.mjs",
  "tooling/prettier/index.mjs",
];

const workspaces = [
  ["apps/web", "@mewmo/web"],
  ["apps/admin", "@mewmo/admin"],
  ["apps/agent", "@mewmo/agent"],
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
  assert.deepEqual(Object.keys(pkg.scripts).sort(), [
    "build",
    "db:generate",
    "db:push",
    "dev",
    "lint",
    "test",
  ]);
  assert.match(pkg.scripts.test, /tsx --test tests\/\*\.test\.mjs tests\/unit\/\*\.test\.mjs/);
  assert.match(pkg.scripts.test, /vitest run tests\/unit\/\*\.test\.ts/);
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

test("web Next config stays compatible with default Turbopack builds", () => {
  const source = readFileSync("apps/web/next.config.mjs", "utf8");

  assert.equal(
    /\bwebpack\s*:/.test(source),
    false,
    "Next 16 enables Turbopack by default, so next.config.mjs must not define webpack config",
  );
});
