import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
  assert.match(dockerfile, /apt-get install -y --no-install-recommends openssl/);
  assert.match(dockerfile, /rm -rf \/var\/lib\/apt\/lists\/\*/);
  assert.match(dockerfile, /ENV COREPACK_HOME="\/opt\/corepack"/);
  assert.match(dockerfile, /corepack enable/);
  assert.match(dockerfile, /chmod -R a\+rX "\$COREPACK_HOME"/);
  assert.match(dockerfile, /ARG PNPM_REGISTRY=https:\/\/registry\.npmjs\.org/);
  assert.match(dockerfile, /pnpm_config_registry="\$PNPM_REGISTRY"/);
  assert.match(dockerfile, /pnpm_config_fetch_timeout=600000/);
  assert.match(dockerfile, /pnpm_config_fetch_retries=5/);
  assert.doesNotMatch(dockerfile, /ENV npm_config_fetch_/);
  assert.doesNotMatch(dockerfile, /pnpm config set .*--global/);
  assert.match(dockerfile, /--mount=type=cache,id=mewmo-pnpm,target=\/pnpm\/store/);
  assert.match(dockerfile, /pnpm install --frozen-lockfile --network-concurrency=4/);
  assert.match(dockerfile, /pnpm --filter @mewmo\/db db:generate/);
  assert.match(dockerfile, /CMD \["pnpm", "--filter", "@mewmo\/worker", "start"\]/);
  assert.equal(workerPackage.scripts.start, "tsx src/index.ts");
  assert.equal(workerPackage.dependencies.tsx, "4.22.4");
});

test("Feed Cron deployment command reaches runtime environment validation", () => {
  const result = spawnSync(
    process.execPath,
    ["apps/worker/node_modules/tsx/dist/cli.mjs", "apps/worker/src/feed-cron.ts"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { NODE_ENV: "development", PATH: process.env.PATH ?? "" },
    },
  );
  const output = `${result.stdout}${result.stderr}`;

  assert.notEqual(result.status, 0);
  assert.doesNotMatch(output, /Top-level await is currently not supported/);
  assert.match(output, /Invalid Worker environment/);
});

test("Worker Compose service has no public port and owns restart behavior", () => {
  const compose = read("deploy/worker/compose.yml");

  assert.match(compose, /image:\s+\$\{WORKER_IMAGE:-mewmo-worker:local\}/);
  assert.doesNotMatch(compose, /^\s*build:/m);
  assert.match(compose, /\$\{WORKER_ENV_FILE:-\.env\.worker\}/);
  assert.match(compose, /restart:\s+unless-stopped/);
  assert.match(compose, /init:\s+true/);
  assert.match(compose, /stop_grace_period:\s+30s/);
  assert.match(compose, /mem_limit:\s+512m/);
  assert.match(compose, /mem_reservation:\s+128m/);
  assert.match(compose, /cpus:\s+0\.50/);
  assert.match(compose, /pids_limit:\s+128/);
  assert.match(compose, /NODE_OPTIONS:\s+--max-old-space-size=384/);
  assert.match(compose, /max-size:\s+["']10m["']/);
  assert.match(compose, /max-file:\s+["']3["']/);
  assert.doesNotMatch(compose, /^\s*ports:/m);
  assert.match(compose, /feed-cron:[\s\S]*profiles:\s*\["cron"\]/);
  assert.match(compose, /command:\s*\["pnpm",\s*"--filter",\s*"@mewmo\/worker",\s*"cron:feeds"\]/);
});

test("Worker secrets stay outside Git and Docker build context", () => {
  const dockerignore = read(".dockerignore");
  const gitignore = read(".gitignore");
  const envExample = read("deploy/worker/.env.worker.example");

  assert.match(dockerignore, /^\.env\*$/m);
  assert.match(dockerignore, /^\*\*\/node_modules\/$/m);
  assert.match(dockerignore, /^\*\*\/\.next-\*$/m);
  assert.match(gitignore, /^!\/deploy\/$/m);
  assert.match(gitignore, /^!\/\.dockerignore$/m);
  assert.match(gitignore, /^deploy\/worker\/\.env\.worker$/m);
  assert.match(envExample, /^DATABASE_URL=$/m);
  assert.match(envExample, /^REDIS_URL=$/m);
  assert.doesNotMatch(envExample, /^FEED_CRON_SECRET=/m);
  assert.doesNotMatch(envExample, /^FEED_REFRESH_BASE_URL=/m);
  assert.doesNotMatch(envExample, /postgresql:\/\/[^\s]*@/);
  assert.doesNotMatch(envExample, /rediss:\/\/[^\s]*@/);
});

test("Worker runbook documents deploy, logs, updates, and rollback", () => {
  const readme = read("deploy/worker/README.md");

  assert.match(readme, /docker buildx build/);
  assert.match(readme, /--platform linux\/amd64/);
  assert.match(readme, /--build-arg PNPM_REGISTRY="\$PNPM_REGISTRY"/);
  assert.match(readme, /docker save .*gzip.*ssh/);
  assert.match(readme, /docker compose -f compose\.yml config --quiet/);
  assert.doesNotMatch(readme, /docker compose -f compose\.yml config\s*$/m);
  assert.match(readme, /docker compose -f compose\.yml up -d/);
  assert.doesNotMatch(readme, /docker compose .*up -d --build/);
  assert.match(readme, /docker compose -f compose\.yml logs -f worker/);
  assert.match(readme, /docker load/);
  assert.match(readme, /docker tag/);
  assert.match(readme, /不需要.*端口/);
  assert.match(readme, /flock[\s\S]*docker compose -f compose\.yml --profile cron run --rm feed-cron/);
  assert.match(readme, /先.*注释.*crontab[\s\S]*再.*旧镜像/);
});
