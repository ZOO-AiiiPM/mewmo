# Worker 自有服务器部署 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 `apps/worker` 变成可由 Docker Compose 在用户自有服务器长期运行的后台服务。

**Architecture:** Web 继续运行在 Vercel，Worker 通过 Upstash Redis 消费任务并访问 Neon、Vercel 和 AI API。Worker 使用专用环境校验和 `tsx src/index.ts` 生产启动，Compose 不暴露端口并负责自动重启；未来独立 Agent 与本次部署隔离。

**Tech Stack:** Node.js 22, pnpm 11, TypeScript, BullMQ, ioredis, Prisma, Docker Compose。

---

### Task 1: 固定 Worker 环境契约

**Files:**
- Modify: `packages/shared/src/env.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/src/env.test.ts`
- Modify: `packages/queue/src/client.ts`
- Create: `apps/worker/src/env.ts`
- Create: `apps/worker/src/env.test.ts`

- [ ] **Step 1: Write failing tests for scoped environment loading**

在 `packages/shared/src/env.test.ts` 增加以下行为测试，并在 `apps/worker/src/env.test.ts` 增加 Worker 配置测试：

```ts
it("loads Redis config without requiring Web-only secrets", () => {
  expect(loadRedisEnv({ REDIS_URL: "rediss://default:secret@example.upstash.io:6379" })).toEqual({
    REDIS_URL: "rediss://default:secret@example.upstash.io:6379",
  });
});

it("loads Worker config from the feed refresh base URL", () => {
  expect(loadWorkerEnv({
    DATABASE_URL: "postgresql://db.example/mewmo",
    REDIS_URL: "rediss://default:secret@example.upstash.io:6379",
    FEED_REFRESH_BASE_URL: "https://mewmo.vercel.app",
    FEED_CRON_SECRET: "cron-secret",
    OPENAI_API_KEY: "openai-key",
    AI_SUMMARY_MODEL: "summary-model",
  }).FEED_REFRESH_BASE_URL).toBe("https://mewmo.vercel.app");
});

it("rejects production Worker config without the cron secret", () => {
  expect(() => loadWorkerEnv({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://db.example/mewmo",
    REDIS_URL: "rediss://default:secret@example.upstash.io:6379",
    FEED_REFRESH_BASE_URL: "https://mewmo.vercel.app",
    OPENAI_API_KEY: "openai-key",
    AI_SUMMARY_MODEL: "summary-model",
  })).toThrow("FEED_CRON_SECRET");
});
```

`apps/worker/src/env.test.ts` 应从 `./env` 导入 `loadWorkerEnv`；共享测试应从 `./env` 导入 `loadRedisEnv` 与 `loadWorkerEnv`。

- [ ] **Step 2: Run tests to verify the new tests fail**

Run:

```bash
pnpm --filter @mewmo/shared test -- --run src/env.test.ts
pnpm --filter @mewmo/worker test -- --run src/env.test.ts
```

Expected: FAIL because `loadRedisEnv`, `loadWorkerEnv` and `apps/worker/src/env.ts` do not exist.

- [ ] **Step 3: Implement the minimal scoped loaders**

在 `packages/shared/src/env.ts` 中保留现有 `loadEnv`，新增：

```ts
const redisEnvSchema = z.object({ REDIS_URL: z.string().min(1) });

export type RedisEnv = z.infer<typeof redisEnvSchema>;

export function loadRedisEnv(input: Record<string, string | undefined> = process.env): RedisEnv {
  const parsed = redisEnvSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid Redis environment: REDIS_URL");
  return parsed.data;
}
```

在 `packages/shared/src/env.ts` 中用 Zod 增加 `loadWorkerEnv`，组合 `DATABASE_URL`、`REDIS_URL`、`FEED_REFRESH_BASE_URL`、`NEXTAUTH_URL`、`FEED_CRON_SECRET`、`AI_PROVIDER`、Provider API Key、Provider Base URL 和 `AI_SUMMARY_MODEL`。当 `FEED_REFRESH_BASE_URL` 缺失时从 `NEXTAUTH_URL` 生成同名输出；生产环境 (`NODE_ENV=production`) 缺少 `FEED_CRON_SECRET` 时抛出带变量名的错误。AI Provider 的必需 key 规则与现有 `loadEnv` 一致。`apps/worker/src/env.ts` 只从 `@mewmo/shared` 重新导出 `loadWorkerEnv` 与类型，避免 Worker 直接依赖 Zod。

修改 `packages/queue/src/client.ts`：默认参数改用 `loadRedisEnv()`，函数签名接受 `RedisEnv`，使队列连接不再加载整个 Web 环境。

- [ ] **Step 4: Run scoped tests to verify green**

Run:

```bash
pnpm --filter @mewmo/shared test -- --run src/env.test.ts
pnpm --filter @mewmo/worker test -- --run src/env.test.ts
pnpm --filter @mewmo/queue test -- --run src/queues.test.ts src/jobs.test.ts
```

Expected: all selected tests pass.

### Task 2: 生产启动与优雅退出

**Files:**
- Modify: `apps/worker/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/worker/src/index.ts`
- Create: `apps/worker/src/runtime.ts`
- Create: `apps/worker/src/runtime.test.ts`

- [ ] **Step 1: Write a failing lifecycle test**

将 `apps/worker/src/index.ts` 的启动逻辑抽到可测试的 `startWorkerRuntime`，测试 fake Worker 的关闭顺序：scheduler 的 `stop()` 先执行，随后所有 Worker 的 `close()` 都被等待。

```ts
it("stops the scheduler before closing all queue workers", async () => {
  const events: string[] = [];
  const runtime = startWorkerRuntime({
    createWorkers: () => [
      { close: async () => { events.push("clip-close"); } },
      { close: async () => { events.push("feed-close"); } },
      { close: async () => { events.push("summary-close"); } },
    ],
    startScheduler: () => ({ stop: () => { events.push("scheduler-stop"); } }),
  });

  await runtime.stop();
  expect(events).toEqual(["scheduler-stop", "clip-close", "feed-close", "summary-close"]);
});
```

- [ ] **Step 2: Run the lifecycle test and verify it fails**

Run:

```bash
pnpm --filter @mewmo/worker test -- --run src/runtime.test.ts
```

Expected: FAIL because `startWorkerRuntime` does not exist.

- [ ] **Step 3: Implement runtime and production start command**

创建 `apps/worker/src/runtime.ts`，定义 `WorkerHandle`、`SchedulerHandle`、`startWorkerRuntime`，按 `scheduler.stop()` 后 `Promise.all(workers.map(worker => worker.close()))` 实现关闭；在 `apps/worker/src/index.ts` 中加载 `loadWorkerEnv()`，创建三个当前 Worker 和 scheduler，注册 `SIGTERM`/`SIGINT` 单次处理器，输出 `workers ready`。

在 `apps/worker/package.json` 增加：

```json
"start": "tsx src/index.ts",
"dependencies": {
  "tsx": "4.22.4"
}
```

- [ ] **Step 4: Run Worker tests, build and lint**

Run:

```bash
pnpm --filter @mewmo/worker test -- --run
pnpm --filter @mewmo/worker build
pnpm --filter @mewmo/worker lint
```

Expected: Worker tests pass, TypeScript build exits 0, lint has no errors.

### Task 3: Docker Compose 生产运行文件

**Files:**
- Create: `deploy/worker/Dockerfile`
- Create: `deploy/worker/compose.yml`
- Create: `deploy/worker/.env.worker.example`
- Create: `deploy/worker/README.md`
- Create: `.dockerignore`
- Modify: `.gitignore`
- Create: `tests/unit/worker-deployment-static.test.mjs`

- [ ] **Step 1: Write failing deployment contract tests**

静态测试读取这些文件并断言：Docker 基于 `node:22`、启用 pnpm、执行 `pnpm install --frozen-lockfile` 和 Prisma generate；Compose 使用仓库根目录构建上下文、无 `ports`、含 `restart: unless-stopped` 与 `init: true`，并引用 `.env.worker`；示例 env 不包含真实密钥；Worker package 有 `start` 脚本。

- [ ] **Step 2: Run the contract test and verify it fails**

Run:

```bash
node --test tests/unit/worker-deployment-static.test.mjs
```

Expected: FAIL because the deployment files do not exist.

- [ ] **Step 3: Add the minimal Docker and Compose files**

`deploy/worker/Dockerfile` 使用 `node:22-bookworm-slim`，启用 Corepack，复制整个 monorepo（`.dockerignore` 排除 Git、node_modules、dist、`.env*`），执行 `pnpm install --frozen-lockfile`、`pnpm --filter @mewmo/db db:generate`，设置 `NODE_ENV=production`，最后执行 `pnpm --filter @mewmo/worker start`。

`deploy/worker/compose.yml` 定义一个 `worker` 服务，构建上下文为仓库根目录，通过 `${WORKER_ENV_FILE:-.env.worker}` 加载环境文件，设置 `restart: unless-stopped`、`init: true`、`stop_grace_period: 30s` 和 10MB/3 文件的 JSON 日志轮转，不映射任何端口。

`.env.worker.example` 只列出变量名和说明：`NODE_ENV`、`DATABASE_URL`、`REDIS_URL`、`FEED_REFRESH_BASE_URL`、`FEED_CRON_SECRET`、`AI_PROVIDER`、AI Provider key/base URL 和 `AI_SUMMARY_MODEL`。

`.gitignore` 放行 `/deploy/`，并增加 `deploy/worker/.env.worker` 排除规则；README 写明宝塔 Docker 管理器或 SSH 下的 `docker compose up -d --build`、`ps`、`logs`、`pull`、回滚和密钥保护步骤。

- [ ] **Step 4: Run contract tests and Compose syntax verification**

Run:

```bash
node --test tests/unit/worker-deployment-static.test.mjs
cp deploy/worker/.env.worker.example /tmp/mewmo-worker.env
WORKER_ENV_FILE=/tmp/mewmo-worker.env docker compose -f deploy/worker/compose.yml config
```

Expected: static tests pass and Compose prints a valid configuration. The temporary env file is not committed.

### Task 4: 更新部署事实和验证文档

**Files:**
- Modify: `agent.md:203-207`
- Modify: `docs/02-architecture.md:255-268`
- Modify: `docs/03-agent-tasks.md:271-280`

- [ ] **Step 1: Replace stale Railway-only statements**

将部署表改为：Web 使用 Vercel，Worker 使用用户自有服务器上的 Docker Compose，数据库使用 Neon，Redis 使用 Upstash；明确 Railway 是可替代托管方案而非当前事实。补充 Worker 不暴露公网端口、生产入口为 `deploy/worker/compose.yml`。

- [ ] **Step 2: Run documentation/static checks**

Run:

```bash
rg -n "Worker|Railway|Docker|deploy/worker" agent.md docs/02-architecture.md docs/03-agent-tasks.md deploy/worker/README.md
git diff --check
```

Expected: docs describe self-hosted Docker consistently and diff check is clean.

### Task 5: Full verification and ZOO-35 handoff

**Files:**
- Test: `packages/shared`, `packages/queue`, `apps/worker`, `tests/unit/worker-deployment-static.test.mjs`

- [ ] **Step 1: Run the focused verification set**

```bash
pnpm --filter @mewmo/shared test -- --run
pnpm --filter @mewmo/queue test -- --run
pnpm --filter @mewmo/worker test -- --run
node --test tests/unit/worker-deployment-static.test.mjs
pnpm --filter @mewmo/worker build
pnpm --filter @mewmo/worker lint
WORKER_ENV_FILE=/tmp/mewmo-worker.env docker compose -f deploy/worker/compose.yml config
```

- [ ] **Step 2: Run the repository gates relevant to changed boundaries**

```bash
pnpm lint
pnpm build
git diff --check
```

记录工作区外部删除 `.env.example` 和 `docker/docker-compose.yml` 对全量测试/集成测试的影响，不把无法运行的命令声称为通过。

- [ ] **Step 3: Comment completion and acceptance instructions on ZOO-35**

在 Linear 用中文记录：环境契约、启动和 Docker 文件、验证命令与结果、未验证的真实服务器步骤，并让用户按 README 在宝塔服务器完成首次部署后验收 RSS 消费和 AI 摘要回写。Issue 保持 In Progress，直到用户明确验收通过。
