import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const deploymentFiles = [
  ".dockerignore",
  "deploy/worker/Dockerfile",
  "deploy/worker/compose.yml",
  "deploy/worker/.env.worker.example",
  "deploy/worker/README.md",
];

const read = (path) => readFileSync(path, "utf8");

test("Worker deployment files exist", () => {
  for (const file of deploymentFiles) {
    assert.equal(existsSync(file), true, `${file} should exist`);
  }
});

test("Worker image installs the monorepo and starts the production runtime", () => {
  const dockerfile = read("deploy/worker/Dockerfile");
  const workerPackage = JSON.parse(read("apps/worker/package.json"));

  assert.match(dockerfile, /FROM node:22-bookworm-slim/);
  assert.match(dockerfile, /corepack enable/);
  assert.match(dockerfile, /pnpm install --frozen-lockfile/);
  assert.match(dockerfile, /pnpm --filter @mewmo\/db db:generate/);
  assert.match(dockerfile, /CMD \["pnpm", "--filter", "@mewmo\/worker", "start"\]/);
  assert.equal(workerPackage.scripts.start, "tsx src/index.ts");
  assert.equal(workerPackage.dependencies.tsx, "4.22.4");
});

test("Worker Compose service has no public port and owns restart behavior", () => {
  const compose = read("deploy/worker/compose.yml");

  assert.match(compose, /context:\s+\.\.\/\.\./);
  assert.match(compose, /dockerfile:\s+deploy\/worker\/Dockerfile/);
  assert.match(compose, /\$\{WORKER_ENV_FILE:-\.env\.worker\}/);
  assert.match(compose, /restart:\s+unless-stopped/);
  assert.match(compose, /init:\s+true/);
  assert.match(compose, /stop_grace_period:\s+30s/);
  assert.match(compose, /max-size:\s+["']10m["']/);
  assert.match(compose, /max-file:\s+["']3["']/);
  assert.doesNotMatch(compose, /^\s*ports:/m);
});

test("Worker secrets stay outside Git and Docker build context", () => {
  const dockerignore = read(".dockerignore");
  const gitignore = read(".gitignore");
  const envExample = read("deploy/worker/.env.worker.example");

  assert.match(dockerignore, /^\.env\*$/m);
  assert.match(dockerignore, /^\*\*\/node_modules\/$/m);
  assert.match(gitignore, /^!\/deploy\/$/m);
  assert.match(gitignore, /^!\/\.dockerignore$/m);
  assert.match(gitignore, /^deploy\/worker\/\.env\.worker$/m);
  assert.match(envExample, /^DATABASE_URL=$/m);
  assert.match(envExample, /^REDIS_URL=$/m);
  assert.match(envExample, /^FEED_CRON_SECRET=$/m);
  assert.doesNotMatch(envExample, /postgresql:\/\/[^\s]*@/);
  assert.doesNotMatch(envExample, /rediss:\/\/[^\s]*@/);
});

test("Worker runbook documents deploy, logs, updates, and rollback", () => {
  const readme = read("deploy/worker/README.md");

  assert.match(readme, /docker compose -f deploy\/worker\/compose\.yml up -d --build/);
  assert.match(readme, /docker compose -f deploy\/worker\/compose\.yml logs -f worker/);
  assert.match(readme, /git pull --ff-only/);
  assert.match(readme, /git switch --detach/);
  assert.match(readme, /不需要.*端口/);
});
