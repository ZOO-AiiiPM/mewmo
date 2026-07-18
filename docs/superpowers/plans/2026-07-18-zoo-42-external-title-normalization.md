# ZOO-42 External Title Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一清洗 RSS、Atom、订阅发现和网页剪藏标题，并提供可重复运行的历史数据回填命令。

**Architecture:** `@mewmo/content` 持有唯一的 `normalizeExternalTitle()`，所有外部标题提取器在写库前调用它。根目录 tooling 组合 `@mewmo/content` 与 `@mewmo/db` 执行分页、并发安全、dry-run-first 的回填，避免让数据库 package 反向依赖内容 package。

**Tech Stack:** TypeScript 6, Vitest, `entities` 7, Prisma 7, pnpm workspace, tsx.

---

### Task 1: 建立共享外部标题规范化契约

**Files:**
- Create: `packages/content/src/title.ts`
- Create: `packages/content/src/title.test.ts`
- Modify: `packages/content/src/index.ts`
- Modify: `packages/content/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: 写失败测试**

覆盖十进制、十六进制、命名、双重转义、CDATA、标签、空白、emoji、普通连字符与真实 `&`，并断言二次调用结果不变：

```ts
expect(normalizeExternalTitle("A &amp;#8211; B")).toBe("A – B");
expect(normalizeExternalTitle("<![CDATA[<b>标题</b> &amp; emoji 🐈]]>")).toBe("标题 & emoji 🐈");
expect(normalizeExternalTitle(normalized)).toBe(normalized);
```

- [ ] **Step 2: 运行红灯**

Run: `pnpm --filter @mewmo/content exec vitest run src/title.test.ts`

Expected: FAIL，因为模块和函数尚不存在。

- [ ] **Step 3: 添加标准解码依赖并实现最小函数**

```ts
import { decodeHTMLStrict } from "entities";

const MAX_ENTITY_DECODE_PASSES = 3;

export function normalizeExternalTitle(value: string): string {
  let normalized = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ");
  for (let pass = 0; pass < MAX_ENTITY_DECODE_PASSES; pass += 1) {
    const decoded = decodeHTMLStrict(normalized);
    if (decoded === normalized) break;
    normalized = decoded;
  }
  return normalized.replace(/[\u00a0\u2007\u202f]/g, " ").replace(/\s+/g, " ").trim();
}
```

从 `src/index.ts` 导出，并在 `packages/content/package.json` 声明 `entities: 7.0.1`。

- [ ] **Step 4: 运行绿灯**

Run: `pnpm --filter @mewmo/content exec vitest run src/title.test.ts`

Expected: PASS。

### Task 2: 所有外部标题提取器接入共享入口

**Files:**
- Modify: `packages/content/src/feed.ts`
- Modify: `packages/content/src/feed.test.ts`
- Modify: `packages/content/src/article.ts`
- Modify: `packages/content/src/article.test.ts`
- Modify: `apps/web/src/lib/feed-discovery.ts`
- Modify: `apps/web/src/lib/feed-discovery.test.ts`

- [ ] **Step 1: 写 RSS、Atom、网页与发现链路失败测试**

测试 RSS/Atom title、`og:title`/`<title>`、Feed XML title、alternate link title 和搜索 fallback title 都能把 `&amp;#8211;` 还原为 `–`，同时保留真实 `&`。

- [ ] **Step 2: 运行红灯**

Run:

```bash
pnpm --filter @mewmo/content exec vitest run src/feed.test.ts src/article.test.ts
pnpm --filter @mewmo/web exec vitest run src/lib/feed-discovery.test.ts
```

Expected: 至少 RSS/Atom 与 article 用例 FAIL。

- [ ] **Step 3: 最小接入共享入口**

在 Feed parser 的 title 字段调用 `normalizeExternalTitle(textValue(...))`。Article extractor 对最终 title 候选调用 `normalizeExternalTitle()`，空结果回退到域名。Feed discovery 仅在 title 候选处调用共享函数，不把标题函数扩散到 URL 或描述清洗。

- [ ] **Step 4: 运行聚焦绿灯**

重复 Step 2 命令，Expected: PASS。

### Task 3: 提供 dry-run-first 历史标题回填

**Files:**
- Create: `tooling/external-title-backfill.ts`
- Create: `tooling/run-external-title-backfill.ts`
- Create: `tests/unit/external-title-backfill.test.ts`
- Modify: `package.json`

- [ ] **Step 1: 写失败测试**

使用注入式假 client 验证：dry-run 只返回 matched；apply 更新 Feed、FeedEntry、Clip 并传入 `version: { increment: 1 }`；更新条件包含原 title；第二次运行 matched/updated 为 0；真实 `&` 标题不更新。

- [ ] **Step 2: 运行红灯**

Run: `pnpm exec vitest run tests/unit/external-title-backfill.test.ts`

Expected: FAIL，因为回填模块尚不存在。

- [ ] **Step 3: 实现分页和并发安全更新**

`backfillExternalTitles(client, { apply, batchSize })` 分别扫描 `feed`、`feedEntry`、`clip`，每批按 id 排序并使用 cursor。仅结果变化时计 matched；apply 调用：

```ts
model.updateMany({
  where: { id: row.id, title: row.title },
  data: { title: normalized, version: { increment: 1 } },
});
```

CLI 默认 dry-run，只有 `--apply` 才写入，并始终在 finally 中 disconnect。根脚本命名为 `titles:cleanup` 与 `titles:cleanup:apply`。

- [ ] **Step 4: 运行绿灯**

Run: `pnpm exec vitest run tests/unit/external-title-backfill.test.ts`

Expected: PASS。

### Task 4: 工程验证与当前数据库回填

**Files:**
- Verify all files above

- [ ] **Step 1: 运行相关自动化验证**

```bash
pnpm --filter @mewmo/content test
pnpm --filter @mewmo/web exec vitest run src/lib/feed-discovery.test.ts
pnpm exec vitest run tests/unit/external-title-backfill.test.ts
pnpm --filter @mewmo/content lint
pnpm --filter @mewmo/web lint
pnpm --filter @mewmo/content build
pnpm --filter @mewmo/web build
git diff --check
```

Expected: 全部 PASS；构建后恢复 `apps/web/next-env.d.ts` 的 dev routes 引用。

- [ ] **Step 2: 执行 dry-run、apply、二次 dry-run**

```bash
pnpm titles:cleanup
pnpm titles:cleanup:apply
pnpm titles:cleanup
```

Expected: 第一次报告当前实际 matched；apply 的 updated 不超过 matched；第二次 matched/updated 均为 0。若首次 matched 为 0，如实记录，不宣称修改了历史行。

- [ ] **Step 3: 提交并回写 ZOO-42**

```bash
git add packages/content apps/web/src/lib/feed-discovery.ts apps/web/src/lib/feed-discovery.test.ts tooling tests/unit/external-title-backfill.test.ts package.json pnpm-lock.yaml docs/superpowers/specs/2026-07-18-zoo-42-external-title-normalization-design.md docs/superpowers/plans/2026-07-18-zoo-42-external-title-normalization.md
git commit -m "fix: normalize external article titles"
```

在 ZOO-42 留中文实现评论，状态保持 In Progress，等待用户验收。
