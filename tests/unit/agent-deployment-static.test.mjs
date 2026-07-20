import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const files = [
  "deploy/agent/Dockerfile",
  "deploy/agent/compose.yml",
  "deploy/agent/.env.agent.example",
  "deploy/agent/README.md",
];
const read = (path) => readFileSync(path, "utf8");

test("Agent deployment files exist", () => {
  for (const file of files) assert.equal(existsSync(file), true, `${file} should exist`);
});

test("Agent image installs Prisma and starts the dedicated app", () => {
  const dockerfile = read("deploy/agent/Dockerfile");
  assert.match(dockerfile, /FROM node:22-bookworm-slim/);
  assert.match(dockerfile, /pnpm install --frozen-lockfile/);
  assert.match(dockerfile, /pnpm --filter @mewmo\/db db:generate/);
  assert.match(dockerfile, /CMD \["pnpm", "--filter", "@mewmo\/agent", "start"\]/);
});

test("Agent Compose binds only to loopback and has a healthcheck", () => {
  const compose = read("deploy/agent/compose.yml");
  assert.match(compose, /restart:\s+unless-stopped/);
  assert.match(compose, /127\.0\.0\.1:\$\{AGENT_BIND_PORT:-3101\}:3101/);
  assert.match(compose, /http:\/\/127\.0\.0\.1:3101\/health/);
  assert.doesNotMatch(compose, /0\.0\.0\.0:\$\{AGENT_BIND_PORT/);
});

test("Agent secrets and Web identity boundary are documented", () => {
  const env = read("deploy/agent/.env.agent.example");
  const readme = read("deploy/agent/README.md");
  const gitignore = read(".gitignore");
  assert.match(env, /^AGENT_IDENTITY_SECRET=$/m);
  assert.match(env, /^AGENT_HOST=0\.0\.0\.0$/m);
  assert.match(env, /^AI_MODEL_AGENT_CHAT=$/m);
  assert.match(readme, /AGENT_INTERNAL_SECRET/);
  assert.match(readme, /完全相同/);
  assert.match(readme, /没有 migration/);
  assert.match(gitignore, /^deploy\/agent\/\.env\.agent$/m);
});
