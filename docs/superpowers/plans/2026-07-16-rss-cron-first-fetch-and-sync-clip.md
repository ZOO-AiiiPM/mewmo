# RSS Cron、首次订阅即时抓取与同步剪藏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 让首次订阅在当前请求内出现 RSS 条目、后续订阅由 one-shot Cron 更新、剪藏在 Web 请求内完成抓取，同时确保来源简介永不写入或覆盖 AI `summary`。

**Architecture:** 新增无数据库依赖的 `@mewmo/content` 包，统一 RSS/Atom 解析、文章 HTML 提取和有界网络抓取；Web 用它做轻量首次订阅和同步剪藏，Worker 用它做深度 Feed Cron。PostgreSQL 继续保存抓取状态和五分钟 lease，BullMQ 只暂时保留 Summary/Tag/Embedding 队列，常驻 Worker 只启动 Summary Worker。

**Tech Stack:** TypeScript 6, Next.js 16, Prisma 7, BullMQ 5, fast-xml-parser 5, Vitest 4, Node test runner, Docker Compose, Linux Cron/flock.

---

### Task 1: 建立共享内容抓取边界并锁定 `excerpt` / `summary` 语义

**Files:**
- Create: `packages/content/package.json`
- Create: `packages/content/tsconfig.json`
- Create: `packages/content/src/index.ts`
- Create: `packages/content/src/feed.ts`
- Create: `packages/content/src/feed.test.ts`
- Create: `packages/content/src/article.ts`
- Create: `packages/content/src/article.test.ts`
- Create: `packages/content/src/html.ts`
- Modify: `apps/web/package.json`
- Modify: `apps/worker/package.json`
- Modify: `apps/web/src/lib/clip-content.ts`
- Modify: `apps/web/src/lib/clip-fetch.ts`
- Delete: `apps/web/src/lib/feed-parser.ts`
- Delete: `apps/web/src/lib/feed-parser.test.ts`
- Delete: `apps/worker/src/lib/feed-parser.ts`
- Delete: `apps/worker/src/lib/feed-parser.test.ts`
- Test: `tests/unit/clip-fetch.test.mjs`

- [x] **Step 1: 先写 RSS/Atom 解析失败测试，要求来源简介叫 `excerpt` 而不是 `summary`**

```ts
it("maps RSS descriptions to excerpt without creating an AI summary", () => {
  const [entry] = parseFeedXml(`
    <rss><channel><item>
      <title>One</title>
      <link>https://example.com/one</link>
      <description>Source description</description>
      <content:encoded><![CDATA[<p>Full body</p>]]></content:encoded>
    </item></channel></rss>
  `);

  expect(entry).toMatchObject({
    title: "One",
    content: "<p>Full body</p>",
    excerpt: "Source description",
  });
  expect(entry).not.toHaveProperty("summary");
});
```

- [x] **Step 2: 先写网页提取失败测试，要求 meta description 只进入 `excerpt`**

```ts
it("keeps page descriptions out of the AI summary field", () => {
  const article = extractArticleFromHtml(`
    <!doctype html><html><head>
      <meta property="og:title" content="Article">
      <meta name="description" content="Publisher description">
    </head><body><main><p>Readable body.</p></main></body></html>
  `, "https://example.com/article");

  expect(article.excerpt).toBe("Publisher description");
  expect(article).not.toHaveProperty("summary");
});
```

- [x] **Step 3: 运行测试并确认旧实现因返回 `summary` 而失败**

Run:

```bash
pnpm vitest run packages/content/src/feed.test.ts packages/content/src/article.test.ts
node --test tests/unit/clip-fetch.test.mjs
```

Expected: FAIL because `@mewmo/content` and the `excerpt`-only contract do not exist yet.

- [x] **Step 4: 实现共享包的最小公共契约**

```ts
export interface ParsedFeedEntry {
  title: string;
  url: string;
  content: string;
  excerpt?: string;
  author?: string;
  publishedAt?: Date;
}

export interface ExtractedArticle {
  title: string;
  content: string;
  favicon?: string;
  coverImage?: string;
  excerpt?: string;
  sourceName?: string;
  author?: string;
  publishedAt?: Date;
}

export async function fetchFeedDocument(url: string): Promise<ParsedFeedEntry[]>;
export async function fetchArticleFromUrl(url: string): Promise<ExtractedArticle>;
export function extractArticleFromHtml(html: string, pageUrl: string): ExtractedArticle;
export function extractArticleBodyHtml(html: string): string;
export function stripHtml(html: string): string;
```

`fetchFeedDocument()` 使用 15 秒 `AbortSignal.timeout()`；`fetchArticleFromUrl()` 使用 12 秒边界。`extractArticleFromHtml()` 优先把非通用 meta description 写入 `excerpt`，没有 meta description 时才从正文生成 180 字 excerpt，返回类型不含 `summary`。

- [x] **Step 5: 让 Web 保留现有渲染清洗器，同时复用共享正文提取**

```ts
import { extractArticleBodyHtml, stripHtml } from "@mewmo/content";

export const extractClipBodyHtml = extractArticleBodyHtml;
export { stripHtml };
```

`sanitizeClipHtml()`、主题色处理、图片代理等浏览器展示逻辑继续留在 `apps/web/src/lib/clip-content.ts`；`apps/web/src/lib/clip-fetch.ts` 只兼容导出共享的 `fetchArticleFromUrl` / `extractArticleFromHtml`，不复制服务端抓取逻辑。

- [x] **Step 6: 运行共享包和现有正文清洗回归测试**

Run:

```bash
pnpm --filter @mewmo/content test
node --test tests/unit/clip-fetch.test.mjs tests/unit/clip-content.test.mjs
```

Expected: PASS; clip metadata tests assert `excerpt`, never source-generated `summary`.

- [x] **Step 7: 提交共享内容边界**

```bash
git add packages/content apps/web/package.json apps/worker/package.json apps/web/src/lib/clip-content.ts apps/web/src/lib/clip-fetch.ts apps/web/src/lib/feed-parser.ts apps/web/src/lib/feed-parser.test.ts apps/worker/src/lib/feed-parser.ts apps/worker/src/lib/feed-parser.test.ts tests/unit/clip-fetch.test.mjs pnpm-lock.yaml
git commit -m "refactor: share server content extraction"
```

### Task 2: 保护已有 AI Summary，并为 Cron 提供到期查询

**Files:**
- Modify: `packages/db/src/repositories/feed-entries.ts`
- Modify: `packages/db/src/repositories/feeds.ts`
- Modify: `packages/db/src/repositories/repositories.test.ts`

- [x] **Step 1: 写失败测试，证明来源 upsert 不覆盖已有 AI `summary`**

```ts
it("does not write summary while refreshing feed source fields", async () => {
  const upsert = vi.fn().mockResolvedValue({ id: "entry-1", summary: "AI result" });
  const repo = createFeedEntriesRepository({
    feedEntry: { findFirst: vi.fn().mockResolvedValue({ id: "entry-1" }), upsert },
  });

  await repo.upsertSourceByFeedUrl("user-1", {
    feedId: "feed-1",
    title: "Updated title",
    url: "https://example.com/one",
    content: "Updated body",
    excerpt: "Publisher description",
  });

  const update = upsert.mock.calls[0]![0].update;
  expect(update).not.toHaveProperty("summary");
});
```

- [x] **Step 2: 写失败测试，覆盖四类 Cron 到期状态和 50 条上限**

```ts
it("queries queued, due, retryable, and stale feeds with a batch limit", async () => {
  const queryRaw = vi.fn().mockResolvedValue([]);
  const repo = createFeedsRepository({ $queryRaw: queryRaw });

  await repo.findDueForRefresh(new Date("2026-07-16T00:10:00.000Z"), 50);

  expect(queryRaw).toHaveBeenCalledTimes(1);
  expect(String(queryRaw.mock.calls[0]![0])).toContain("LIMIT");
});
```

- [x] **Step 3: 运行 DB 测试并确认失败原因分别是缺少 source-only upsert 和到期状态查询**

Run:

```bash
pnpm --filter @mewmo/db test -- src/repositories/repositories.test.ts
```

Expected: FAIL for missing `upsertSourceByFeedUrl()` and incomplete due-feed query contract.

- [x] **Step 4: 实现只写来源字段的 upsert**

```ts
export type UpsertFeedEntrySourceInput = Omit<CreateFeedEntryInput, "summary">;

async upsertSourceByFeedUrl(userId: string, input: UpsertFeedEntrySourceInput) {
  const existing = await db.feedEntry.findFirst({
    where: { feedId: input.feedId, url: input.url, userId },
  });
  const entry = await db.feedEntry.upsert({
    where: { feedId_url: { feedId: input.feedId, url: input.url } },
    create: { ...input, summary: null, userId },
    update: {
      title: input.title,
      content: input.content,
      coverImage: input.coverImage ?? null,
      excerpt: input.excerpt ?? null,
      sourceName: input.sourceName ?? null,
      author: input.author ?? null,
      publishedAt: input.publishedAt ?? null,
      deletedAt: null,
      version: { increment: 1 },
    },
  });
  return { entry, created: !existing };
}
```

- [x] **Step 5: 实现五分钟恢复边界和 50 条批次查询**

查询必须包含：`queued` 立即处理；`idle/success` 按 `last_fetched_at + refresh_interval`；`error/partial` 在 `last_fetch_started_at` 五分钟前；`fetching` 在五分钟前视为 stale；按最老尝试排序并 `LIMIT 50`。

- [x] **Step 6: 重跑 DB 测试并提交**

Run:

```bash
pnpm --filter @mewmo/db test -- src/repositories/repositories.test.ts
```

Expected: PASS.

```bash
git add packages/db/src/repositories/feed-entries.ts packages/db/src/repositories/feeds.ts packages/db/src/repositories/repositories.test.ts
git commit -m "fix: preserve AI summaries during feed refresh"
```

### Task 3: 首次订阅在 Web 请求内轻量抓取

**Files:**
- Create: `apps/web/src/lib/feed-initial-fetch.ts`
- Create: `apps/web/src/lib/feed-initial-fetch.test.ts`
- Create: `apps/web/src/lib/feed-refresh-request.ts`
- Create: `apps/web/src/lib/feed-refresh-request.test.ts`
- Modify: `apps/web/src/app/api/feeds/[[...parts]]/route.ts`
- Modify: `apps/web/src/app/(app)/feeds/page.tsx`
- Modify: `tests/unit/feed-async-creation.test.mjs`
- Modify: `tests/integration/feeds-api.test.mjs`
- Delete: `apps/web/src/lib/feed-fetch-service.ts`
- Delete: `apps/web/src/lib/feed-fetch-service.test.ts`
- Delete: `apps/web/src/lib/feed-queue-service.ts`
- Delete: `apps/web/src/lib/feed-first-entry.ts`
- Delete: `apps/web/src/lib/feed-first-entry.test.ts`
- Delete: `tests/unit/feed-first-entry-runtime.test.ts`
- Delete: `tests/unit/feed-runtime.test.ts`
- Delete: `tests/integration/feed-queue-lease.test.mjs`

- [x] **Step 1: 写失败测试，证明首次抓取不逐篇访问网页**

```ts
it("stores ten initial RSS entries without fetching article pages", async () => {
  const fetchFeed = vi.fn().mockResolvedValue([
    { title: "One", url: "https://example.com/one", content: "Body", excerpt: "Source text" },
  ]);
  const upsertSourceByFeedUrl = vi.fn().mockResolvedValue({ created: true, entry: { id: "entry-1" } });

  const result = await fetchInitialFeed("user-1", feed, {
    fetchFeed,
    entryRepository: { upsertSourceByFeedUrl },
    prisma,
  });

  expect(result).toEqual({ status: "queued", fetched: 1, created: 1 });
  expect(upsertSourceByFeedUrl).toHaveBeenCalledWith("user-1", expect.not.objectContaining({ summary: expect.anything() }));
  expect(prisma.feed.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
    data: expect.objectContaining({ lastFetchStatus: "queued", lastFetchedAt: null }),
  }));
});
```

- [x] **Step 2: 写失败测试，证明失败保留订阅并记录 error**

```ts
it("records an initial fetch error without deleting the feed", async () => {
  const result = await fetchInitialFeed("user-1", feed, {
    fetchFeed: vi.fn().mockRejectedValue(new Error("Feed fetch timed out")),
    entryRepository,
    prisma,
  });

  expect(result.status).toBe("error");
  expect(prisma.feed.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({
      lastFetchStatus: "error",
      lastFetchError: "Feed fetch timed out",
      lastFetchedAt: null,
    }),
  }));
});
```

- [x] **Step 3: 写 route/UI 契约测试，要求 API 直接等待首次 RSS，页面不再轮询首篇文章**

```js
assert.match(route, /await fetchInitialFeed\(session\.user\.id, feedRecord/);
assert.doesNotMatch(route, /addFeedFetchJob|enqueueFeedFetch|after\(/);
assert.doesNotMatch(page, /waitForFirstFeedEntry|setInterval/);
```

- [x] **Step 4: 运行聚焦测试并确认旧异步路径导致失败**

Run:

```bash
pnpm vitest run apps/web/src/lib/feed-initial-fetch.test.ts apps/web/src/lib/feed-refresh-request.test.ts
node --test tests/unit/feed-async-creation.test.mjs
```

Expected: FAIL because creation still enqueues Feed BullMQ and the UI still polls.

- [x] **Step 5: 实现首次 RSS-only 抓取**

`fetchInitialFeed()` 调 `fetchFeedDocument()`，按发布时间排序后最多保存十篇，只使用 Feed 自带 `content` / `excerpt`，不调用 `fetchArticleFromUrl()`。成功后保持 `lastFetchStatus = "queued"`、`lastFetchStartedAt = null`、`lastFetchedAt = null`；失败后保存 `error` 和错误文本。

- [x] **Step 6: 修改 Feed API 和手动刷新语义**

新建订阅后同步 `await fetchInitialFeed()` 并返回 `{ existing: false, initialFetch }`。重复订阅不重新抓取；若已有记录是 `error/partial`，调用 `requestFeedRefresh()` 条件更新为 `queued`，让下一轮 Cron 处理。单个和批量刷新接口同样只做数据库 `queued` 标记，不创建 BullMQ job。

- [x] **Step 7: 删除新增订阅的 15 秒客户端轮询**

单个和批量添加都以 POST 响应为准：成功立即加入列表并关闭弹窗；`initialFetch.status === "error"` 时显示“订阅已保存，后台会自动重试”，不在浏览器轮询条目。

- [x] **Step 8: 更新 integration 契约并运行聚焦测试**

Run:

```bash
pnpm vitest run apps/web/src/lib/feed-initial-fetch.test.ts apps/web/src/lib/feed-refresh-request.test.ts
node --test tests/unit/feed-async-creation.test.mjs
```

Expected: PASS.

- [x] **Step 9: 提交首次订阅路径**

```bash
git add apps/web/src/lib apps/web/src/app/api/feeds apps/web/src/app/'(app)'/feeds/page.tsx tests/unit/feed-async-creation.test.mjs tests/unit/feed-first-entry-runtime.test.ts tests/unit/feed-runtime.test.ts tests/integration/feeds-api.test.mjs tests/integration/feed-queue-lease.test.mjs
git commit -m "feat: fetch initial subscriptions synchronously"
```

### Task 4: 实现 one-shot Feed Cron、五分钟 lease 与 AI 后处理补投递

**Files:**
- Create: `apps/worker/src/feeds/process-feed.ts`
- Create: `apps/worker/src/feeds/process-feed.test.ts`
- Create: `apps/worker/src/feeds/run-feed-cron.ts`
- Create: `apps/worker/src/feeds/run-feed-cron.test.ts`
- Create: `apps/worker/src/feed-cron.ts`
- Modify: `apps/worker/package.json`
- Delete: `apps/worker/src/workers/feed-worker.ts`
- Delete: `apps/worker/src/workers/feed-worker.test.ts`
- Delete: `apps/worker/src/jobs/feed-refresh-scheduler.ts`
- Delete: `apps/worker/src/jobs/feed-refresh-scheduler.test.ts`

- [x] **Step 1: 写失败测试，证明首次 Web 已创建且 `summary = null` 的条目仍会补投 AI**

```ts
it("queues post-processing for an existing entry whose AI summary is still null", async () => {
  entryRepository.upsertSourceByFeedUrl.mockResolvedValue({
    created: false,
    entry: { id: "entry-1", summary: null },
  });

  const result = await processFeed(feed, deps);

  expect(result.status).toBe("success");
  expect(addSummaryJob).toHaveBeenCalledWith(
    { userId: "user-1", targetId: "entry-1", targetType: "feed_entry" },
    expect.objectContaining({ jobId: "summary-feed-entry-entry-1" }),
  );
  expect(addTagJob).toHaveBeenCalled();
});
```

- [x] **Step 2: 写失败测试，证明深度抓取保留已有 AI summary**

```ts
it("deep-enriches source content without passing summary into the repository", async () => {
  await processFeed(feed, deps);
  expect(entryRepository.upsertSourceByFeedUrl).toHaveBeenCalledWith(
    "user-1",
    expect.objectContaining({ content: "<article>Deep body</article>" }),
  );
  expect(entryRepository.upsertSourceByFeedUrl.mock.calls[0]![1]).not.toHaveProperty("summary");
});
```

- [x] **Step 3: 写失败测试，覆盖 claim、lease lost、单 Feed 失败隔离与批次统计**

```ts
it("continues after one feed fails and reports the whole batch", async () => {
  const result = await runFeedCron({
    feedsRepository: { findDueForRefresh: vi.fn().mockResolvedValue([feedA, feedB]) },
    processFeed: vi.fn()
      .mockResolvedValueOnce({ status: "error" })
      .mockResolvedValueOnce({ status: "success" }),
  });

  expect(result).toEqual({ selected: 2, succeeded: 1, partial: 0, failed: 1, skipped: 0 });
});
```

- [x] **Step 4: 运行 Worker 聚焦测试并确认实现尚不存在**

Run:

```bash
pnpm --filter @mewmo/worker test -- src/feeds/process-feed.test.ts src/feeds/run-feed-cron.test.ts
```

Expected: FAIL because the one-shot processor and runner do not exist.

- [x] **Step 5: 实现单 Feed 条件领取与完成保护**

`processFeed()` 用本次 `startedAt` 条件更新为 `fetching`。领取条件匹配到期查询读取到的 `lastFetchStatus` 和 `lastFetchStartedAt`；完成与错误更新都要求数据库仍是相同 `startedAt`，否则返回 `lease_lost`，旧进程不能覆盖新进程。

- [x] **Step 6: 实现 Cron 深度正文补全和后处理**

先抓 RSS，再对最多十篇逐篇 best-effort 调 `fetchArticleFromUrl()`；网页失败时回退 Feed 自带正文。保存使用 `upsertSourceByFeedUrl()`。当 `created === true`、保存后的 `summary === null` 或 Feed 原状态是 `partial` 时，以稳定 job ID 提交 Summary/Tag；任一队列提交失败将 Feed 完成态记为 `partial`，但不回滚已保存内容。

- [x] **Step 7: 实现批次 runner 和一次性入口**

```ts
const result = await runFeedCron();
console.log(JSON.stringify({ event: "feed_cron_completed", ...result }));
await getPrisma().$disconnect();
```

`feed-cron.ts` 无论成功失败都断开 Prisma；失败设置非零退出码。`apps/worker/package.json` 增加：

```json
"cron:feeds": "tsx src/feed-cron.ts"
```

- [x] **Step 8: 运行 Worker 测试并提交**

Run:

```bash
pnpm --filter @mewmo/worker test
```

Expected: PASS with Cron processor/runner tests and existing Summary Worker tests.

```bash
git add apps/worker/src apps/worker/package.json
git commit -m "feat: run feed refreshes from one-shot cron"
```

### Task 5: 剪藏创建与刷新改为同步 Web 抓取

**Files:**
- Modify: `apps/web/src/app/api/clips/route.ts`
- Modify: `apps/web/src/app/api/clips/[id]/route.ts`
- Modify: `apps/web/src/app/(app)/clips/page.tsx`
- Modify: `apps/web/src/app/(app)/clips/[id]/ClipDetailClient.tsx`
- Modify: `tests/unit/clip-async-creation.test.mjs`
- Modify: `tests/integration/clips-api.test.mjs`
- Delete: `apps/worker/src/workers/clip-worker.ts`
- Delete: `apps/worker/src/workers/clip-worker.test.ts`

- [x] **Step 1: 写失败 route 契约，要求抓取成功后才创建且不调用 Clip 队列**

```js
assert.match(createRoute, /await fetchClipFromUrl\(parsed\.data\.url\)/);
assert.ok(createRoute.indexOf("await fetchClipFromUrl") < createRoute.indexOf("prisma.clip.create"));
assert.doesNotMatch(createRoute, /addClipFetchJob|withQueueTimeout/);
assert.match(createRoute, /summary:\s*null/);
```

- [x] **Step 2: 写失败 route 契约，要求刷新保留 AI summary 并 best-effort 触发 Summary**

```js
assert.doesNotMatch(detailRoute, /summary:\s*fetched\.summary/);
assert.match(detailRoute, /addSummaryJob/);
assert.doesNotMatch(detailRoute, /background|cronAuthorized|addClipFetchJob/);
```

- [x] **Step 3: 写 integration 期望，证明同步成功、失败不留空记录、超时为 504**

成功 fixture 应断言返回正文、`excerpt` 和 `summary === null`；不可访问 URL 返回 502 且列表不存在该 normalized URL；超时 fixture 返回 504。刷新成功后已有 AI summary 保持不变。

- [x] **Step 4: 运行聚焦测试并确认旧异步实现失败**

Run:

```bash
node --test tests/unit/clip-async-creation.test.mjs
```

Expected: FAIL because Clip creation still persists queued placeholders and starts a Clip Worker.

- [x] **Step 5: 实现同步创建和软删除恢复**

先查 active duplicate；没有 active 记录时 `await fetchClipFromUrl()`，成功后才 create/restore。新记录写入来源字段、`summary: null`、`fetchStatus: "success"`、`fetchedAt: new Date()`。P2002 返回并发创建出的记录。抓取超时映射 504，其他抓取错误映射 502。保存成功后：

```ts
void addSummaryJob(
  { userId, targetId: clip.id, targetType: "clip" },
  { jobId: `summary-clip-${clip.id}`, removeOnComplete: true, removeOnFail: true },
).catch((error) => console.error("Failed to enqueue clip summary job", error));
```

队列失败不得改变已保存 Clip。

- [x] **Step 6: 实现同步刷新且不触碰 `summary`**

已认证请求先把该用户的 Clip 标记为 `fetching`，抓取成功后只更新 title/content/favicon/coverImage/excerpt/sourceName/author/publishedAt 和 fetch 状态；变化判断不比较 `summary`。失败写 `error`，返回 504/502。成功后 best-effort 重新提交 Summary job。

- [x] **Step 7: 删除 Clip 页面对 queued/fetching 的轮询和 queued 提示**

刷新按钮继续等待 POST；响应返回后直接更新列表、详情和缓存，Toast 只区分“已拉取最新内容”和“已是最新”。创建按钮等待 POST 成功后才插入返回记录。

- [x] **Step 8: 运行聚焦测试并提交**

Run:

```bash
node --test tests/unit/clip-async-creation.test.mjs tests/unit/clip-fetch.test.mjs
```

Expected: PASS.

```bash
git add apps/web/src/app/api/clips apps/web/src/app/'(app)'/clips tests/unit/clip-async-creation.test.mjs tests/integration/clips-api.test.mjs apps/worker/src/workers/clip-worker.ts apps/worker/src/workers/clip-worker.test.ts
git commit -m "feat: fetch clips synchronously in web requests"
```

### Task 6: 移除 Feed/Clip BullMQ 契约并只保留 Summary Worker

**Files:**
- Modify: `packages/queue/src/queues.ts`
- Modify: `packages/queue/src/jobs.ts`
- Modify: `packages/queue/src/queues.test.ts`
- Modify: `apps/worker/src/runtime.ts`
- Modify: `apps/worker/src/runtime.test.ts`
- Modify: `apps/web/src/instrumentation.ts`
- Delete: `apps/web/src/lib/feed-refresh-runtime.ts`
- Delete: `apps/web/src/lib/feed-refresh-service.ts`
- Modify: `tests/unit/feed-refresh-runtime.test.mjs`
- Modify: `tests/unit/clip-async-creation.test.mjs`

- [x] **Step 1: 写失败测试，要求 QueueSet 只保留 Tag/Summary/Embedding**

```ts
expect(queueNames).toEqual({
  tag: "tag-queue",
  summary: "summary-queue",
  embedding: "embedding-queue",
});
expect(helpers).not.toHaveProperty("addFeedFetchJob");
expect(helpers).not.toHaveProperty("addClipFetchJob");
```

- [x] **Step 2: 写失败 runtime 测试，要求常驻进程只关闭 Summary Worker**

```ts
it("runs only the persistent summary worker", async () => {
  const close = vi.fn().mockResolvedValue(undefined);
  const runtime = startWorkerRuntime({ createWorker: () => ({ close }) });
  await runtime.stop();
  expect(close).toHaveBeenCalledTimes(1);
});
```

- [x] **Step 3: 写失败静态测试，要求 Next instrumentation 不再启动 Feed interval**

```js
assert.doesNotMatch(instrumentation, /startWebFeedRefreshScheduler|setInterval/);
assert.equal(existsSync("apps/web/src/lib/feed-refresh-runtime.ts"), false);
```

- [x] **Step 4: 运行 Queue、Worker 和静态测试并确认旧消费者仍存在**

Run:

```bash
pnpm --filter @mewmo/queue test
pnpm --filter @mewmo/worker test
node --test tests/unit/feed-refresh-runtime.test.mjs tests/unit/clip-async-creation.test.mjs
```

Expected: FAIL because Feed/Clip queues, workers and schedulers still exist.

- [x] **Step 5: 删除 Feed/Clip 队列名、payload、producer 和消费者**

`queueNames`、`QueueSet`、`createMewmoQueues()`、`createQueueHelpers()` 与 `jobs.ts` 只保留 Tag/Summary/Embedding。不要删除 Redis client、`withTimeout` 或 Summary Worker 所需契约。

- [x] **Step 6: 简化常驻 runtime 并清理 Web interval**

```ts
function createDefaultWorker(): WorkerHandle {
  return createSummaryWorker();
}

export function startWorkerRuntime(dependencies: WorkerRuntimeDependencies = {}): WorkerRuntime {
  const worker = (dependencies.createWorker ?? createDefaultWorker)();
  let stopPromise: Promise<void> | undefined;
  return { stop: () => (stopPromise ??= worker.close()) };
}
```

`instrumentation.ts` 只保留 Node 代理 dispatcher 初始化，不再导入 Feed refresh runtime。

- [x] **Step 7: 重跑聚焦测试并提交**

Run:

```bash
pnpm --filter @mewmo/queue test
pnpm --filter @mewmo/worker test
node --test tests/unit/feed-refresh-runtime.test.mjs tests/unit/clip-async-creation.test.mjs
```

Expected: PASS; Summary Worker tests继续通过。

```bash
git add packages/queue/src apps/worker/src/runtime.ts apps/worker/src/runtime.test.ts apps/web/src/instrumentation.ts apps/web/src/lib/feed-refresh-runtime.ts apps/web/src/lib/feed-refresh-service.ts tests/unit/feed-refresh-runtime.test.mjs tests/unit/clip-async-creation.test.mjs
git commit -m "refactor: retire feed and clip queue consumers"
```

### Task 7: 部署 Cron、最终验证与 Issue 交付

**Files:**
- Modify: `deploy/worker/compose.yml`
- Modify: `deploy/worker/README.md`
- Modify: `deploy/worker/.env.worker.example`
- Modify: `tests/unit/worker-deployment-static.test.mjs`
- Modify: `docs/superpowers/plans/2026-07-16-rss-cron-first-fetch-and-sync-clip.md`

- [x] **Step 1: 写失败部署测试，要求 one-shot profile 和 flock runbook**

```js
assert.match(compose, /feed-cron:[\s\S]*profiles:\s*\["cron"\]/);
assert.match(compose, /command:\s*\["pnpm",\s*"--filter",\s*"@mewmo\/worker",\s*"cron:feeds"\]/);
assert.match(readme, /flock[\s\S]*docker compose -f compose\.yml --profile cron run --rm feed-cron/);
assert.match(readme, /先.*注释.*crontab[\s\S]*再.*旧镜像/);
```

- [x] **Step 2: 运行部署静态测试并确认 Cron service 尚不存在**

Run:

```bash
node --test tests/unit/worker-deployment-static.test.mjs
```

Expected: FAIL for missing `feed-cron` profile and flock instructions.

- [x] **Step 3: 增加 Compose one-shot service**

```yaml
  feed-cron:
    image: ${WORKER_IMAGE:-mewmo-worker:local}
    profiles: ["cron"]
    env_file:
      - ${WORKER_ENV_FILE:-.env.worker}
    command: ["pnpm", "--filter", "@mewmo/worker", "cron:feeds"]
    restart: "no"
    init: true
    mem_limit: 512m
    cpus: 0.50
```

- [x] **Step 4: 更新部署文档和环境示例**

移除 `FEED_REFRESH_BASE_URL` / `FEED_CRON_SECRET`，因为 Cron 直接访问数据库，不再调用 Web。记录手动验收命令和每分钟 `flock -n /var/run/mewmo-feed-cron.lock ...` crontab；回滚顺序必须先停 Cron，再切旧镜像，避免新 Cron 与旧 Feed Worker 并跑。

- [x] **Step 5: 运行所有相关聚焦测试**

Run:

```bash
pnpm --filter @mewmo/content test
pnpm --filter @mewmo/db test
pnpm --filter @mewmo/queue test
pnpm --filter @mewmo/worker test
node --test tests/unit/clip-async-creation.test.mjs tests/unit/clip-fetch.test.mjs tests/unit/feed-async-creation.test.mjs tests/unit/feed-refresh-runtime.test.mjs tests/unit/worker-deployment-static.test.mjs
```

Expected: all pass.

- [x] **Step 6: 运行生产最低闸门**

Run:

```bash
pnpm test:unit
pnpm verify
git diff --check
```

Expected: exit 0. API integration tests use isolated PostgreSQL/Redis/Web fixtures; because Feed and Clip API behavior changed, also run `pnpm test:integration` if the local harness can start its services.

- [x] **Step 7: 更新计划复选框并提交部署与验证变更**

```bash
git add deploy/worker/compose.yml deploy/worker/README.md deploy/worker/.env.worker.example tests/unit/worker-deployment-static.test.mjs docs/superpowers/plans/2026-07-16-rss-cron-first-fetch-and-sync-clip.md
git commit -m "chore: deploy feed refresh as cron"
```

- [x] **Step 8: 在 ZOO-35 留中文实现评论并等待用户验收**

评论包含：Feed/Clip 抓取已退出 BullMQ；Redis 和 Summary Worker仍保留；首次订阅、五分钟 stale recovery、同步剪藏、`excerpt`/`summary` 边界；实际运行的测试及未运行项；分支与提交。Issue 保持 In Progress，用户明确验收通过前不设 Done。
