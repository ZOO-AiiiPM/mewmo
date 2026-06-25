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
