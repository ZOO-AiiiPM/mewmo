# ZOO-41 订阅验收 UI 优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让订阅刷新提示、添加按钮状态、条目操作归属和阅读元信息与当前 Cron 机制及信息层级一致。

**Architecture:** 保留现有页面和 ListColumn 边界；订阅源刷新只修正响应契约，文章卡片复用 Clip 已验证的 `mewmo-list-card-wrap + CardActionMenu` 结构。阅读元信息继续由 `feed-display.ts` 生成，但移除阅读统计输入和输出。

**Tech Stack:** Next.js 16, React 19, TypeScript 6, Node test runner, Vitest, semantic CSS variables.

---

### Task 1: 锁定验收 UI 契约

**Files:**
- Create: `tests/unit/feed-acceptance-ui.test.mjs`
- Modify: `apps/web/src/lib/feed-display.test.ts`

- [ ] **Step 1: 写刷新、按钮、菜单位置和元信息失败测试**

```js
test("feed refresh UI reports queued work instead of a completed check", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
  assert.match(sidebar, /queued\?: boolean/);
  assert.match(sidebar, /已安排更新，后台将在一分钟内处理/);
  assert.doesNotMatch(sidebar, /已检查该订阅，暂无新文章/);
});

test("feed actions belong to cards instead of the list header", () => {
  const page = read("apps/web/src/app/(app)/feeds/page.tsx");
  assert.doesNotMatch(page, /overflowAction=\{/);
  assert.match(page, /mewmo-list-card-wrap[\s\S]*<CardActionMenu[\s\S]*kind="feed"/);
});

test("add-feed primary action has a semantic disabled appearance", () => {
  const css = read("apps/web/src/app/globals.css");
  assert.match(css, /\.addfeed__actions[\s\S]*\.mewmo-button--primary:disabled[\s\S]*cursor:\s*not-allowed/);
});
```

把 `feed-display.test.ts` 的 reader meta 期望改为只包含作者、来源和时间，并删除 `words/minutes` 输入。

- [ ] **Step 2: 运行测试确认旧实现失败**

Run:

```bash
node --test tests/unit/feed-acceptance-ui.test.mjs
pnpm --filter @mewmo/web exec vitest run src/lib/feed-display.test.ts
```

Expected: FAIL，因为旧 Sidebar 使用 `created` 文案、列表头仍传 `overflowAction`、Feed 卡片没有条目菜单、CSS 没有主按钮禁用态且 reader meta 仍含阅读统计。

### Task 2: 修正刷新反馈和添加按钮禁用态

**Files:**
- Modify: `apps/web/src/components/shell/Sidebar.tsx`
- Modify: `apps/web/src/app/globals.css`
- Test: `tests/unit/feed-acceptance-ui.test.mjs`

- [ ] **Step 1: 让 Sidebar 读取 queued 契约**

```ts
const data = (await response?.json().catch(() => null)) as { queued?: boolean } | null;
if (response?.ok && data?.queued) {
  showToast("已安排更新，后台将在一分钟内处理", "success");
} else {
  showToast("检查订阅更新失败", "error");
}
```

成功排队后不立即派发 `mewmo:feed-refreshed`，避免把一次数据库状态更新伪装成抓取完成。

- [ ] **Step 2: 为添加按钮增加视觉禁用态**

```css
.addfeed__actions .mewmo-button--primary:disabled {
  background: var(--s2);
  color: var(--ink-faint);
  cursor: not-allowed;
  opacity: 0.72;
  box-shadow: none;
}
```

保留已有 `disabled={selectedUrls.length === 0 || saving}`，不增加第二套状态。

- [ ] **Step 3: 运行聚焦测试**

Run: `node --test tests/unit/feed-acceptance-ui.test.mjs`

Expected: 刷新和禁用态断言 PASS，卡片菜单与元信息断言仍 FAIL。

### Task 3: 把文章操作移动到具体卡片

**Files:**
- Modify: `apps/web/src/components/shell/CardActionMenu.tsx`
- Modify: `apps/web/src/app/(app)/feeds/page.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `tests/unit/feed-source-menu.test.mjs`
- Test: `tests/unit/feed-acceptance-ui.test.mjs`

- [ ] **Step 1: 扩展共享 CardActionMenu 的 feed 变体**

```ts
type CardActionKind = "notes" | "clips" | "feed";

interface CardActionMenuProps {
  kind: CardActionKind;
  favoriteActive?: boolean;
  onFavorite?: () => void;
  onCopyLink?: () => void;
  onDelete?: () => void;
  // existing props remain
}
```

`feed` 分支只渲染收藏和复制链接；notes/clips 分支行为保持不变。

- [ ] **Step 2: 将收藏和复制函数改为接收具体 entry**

```ts
const favoriteEntry = useCallback(async (entry: FeedEntry) => {
  // 调用 /api/feed-entries/{id}/favorite，并按 entry.id 更新列表和缓存
}, [showToast]);

const copyEntryLink = useCallback((entry: FeedEntry) => {
  if (!entry.url) return;
  void navigator.clipboard?.writeText(entry.url);
  showToast("已复制原文链接", "success");
}, [showToast]);
```

ReaderToolbar 使用 `selectedEntry` 包装调用，卡片菜单直接传当前 entry。

- [ ] **Step 3: 用 Clip 同款容器包裹 Feed 卡片**

```tsx
<article className={`mewmo-list-card-wrap ${menuOpen ? "mewmo-list-card-wrap--menu-open" : ""}`}>
  <button className={`mewmo-list-card mewmo-list-card--button mewmo-feed-entry-card ...`}>
    {/* existing card content */}
  </button>
  <CardActionMenu
    kind="feed"
    open={menuOpen}
    ariaLabel="订阅文章操作"
    favoriteActive={Boolean(entry.isFavorited)}
    onOpenChange={(open) => setOpenMenuId(open ? entry.id : null)}
    onFavorite={() => void favoriteEntry(entry)}
    onCopyLink={() => copyEntryLink(entry)}
  />
</article>
```

删除 ListColumn 的 `overflowAction`；ReaderToolbar 保留 `menuKind="feed"`。

- [ ] **Step 4: 让收藏标记在操作态让位**

```css
.mewmo-feed-entry-card__favorite {
  transition: opacity 0.12s;
}

.mewmo-list-card-wrap:hover .mewmo-feed-entry-card__favorite,
.mewmo-list-card-wrap--menu-open .mewmo-feed-entry-card__favorite {
  opacity: 0;
}
```

- [ ] **Step 5: 更新旧测试并运行聚焦套件**

Run:

```bash
node --test tests/unit/feed-acceptance-ui.test.mjs tests/unit/feed-source-menu.test.mjs tests/unit/workspace-prototype-ui.test.mjs
```

Expected: PASS；旧“列表头必须有菜单”断言被替换为“卡片有菜单、reader toolbar 保留菜单”。

### Task 4: 删除阅读统计并完成验证

**Files:**
- Modify: `apps/web/src/lib/feed-display.ts`
- Modify: `apps/web/src/lib/feed-display.test.ts`
- Modify: `apps/web/src/app/(app)/feeds/page.tsx`

- [ ] **Step 1: 简化 reader meta 契约**

```ts
export function buildFeedReaderMeta({ entry }: { entry: FeedDisplayEntry }): string[] {
  return compactMeta([
    entry.author,
    preferredFeedReaderSource({
      sourceName: entry.sourceName,
      url: entry.url,
      feedTitle: entry.feed.title,
    }),
    entry.publishedAt ?? entry.createdAt,
  ]);
}
```

- [ ] **Step 2: 删除页面端 countWords/minutes 计算**

`FeedReader` 只传 `{ entry }`，删除仅服务该功能的 `countWords()` 和无用 `plainText` 导入。

- [ ] **Step 3: 运行所有相关验证**

Run:

```bash
node --test tests/unit/feed-acceptance-ui.test.mjs tests/unit/feed-source-menu.test.mjs tests/unit/workspace-prototype-ui.test.mjs
pnpm --filter @mewmo/web exec vitest run src/lib/feed-display.test.ts
pnpm test:theme
pnpm --filter @mewmo/web lint
pnpm --filter @mewmo/web build
git diff --check
```

Expected: 全部 PASS。

- [ ] **Step 4: 浏览器验收**

在 `http://localhost:3017/feeds` 验证深色和浅色：空弹窗按钮降级、选择结果后恢复、栏目头无三点、卡片右下角操作可用、收藏图标不重叠、元信息精简、刷新提示为排队语义。

- [ ] **Step 5: 提交并回写 ZOO-41**

```bash
git add apps/web/src/components/shell/Sidebar.tsx apps/web/src/components/shell/CardActionMenu.tsx apps/web/src/app/'(app)'/feeds/page.tsx apps/web/src/app/globals.css apps/web/src/lib/feed-display.ts apps/web/src/lib/feed-display.test.ts tests/unit/feed-acceptance-ui.test.mjs tests/unit/feed-source-menu.test.mjs tests/unit/workspace-prototype-ui.test.mjs docs/superpowers/specs/2026-07-18-zoo-41-feed-ui-acceptance-design.md docs/superpowers/plans/2026-07-18-zoo-41-feed-ui-acceptance.md
git commit -m "fix: align feed UI with cron workflow"
```

在 ZOO-41 留中文实现评论，状态保持 In Progress，等待用户验收。
