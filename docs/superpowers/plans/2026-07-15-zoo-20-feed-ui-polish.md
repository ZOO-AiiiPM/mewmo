# ZOO-20 Feed UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Decode feed-title entities, keep the left article-list title on one line, and expose the selected article's shared favorite/copy menu in both list and reader headers.

**Architecture:** Normalize titles at the existing feed-discovery text boundary so encoded data is corrected before display and persistence. Extract the feed-specific reader menu into a focused `FeedArticleMenu` component, then render that same component in `ReaderToolbar` and the feed page's list-header overflow slot. Keep the full title value and solve overflow only in layout CSS.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest, Node test runner, existing `PopoverMenu` and `PrototypeIcon` primitives.

---

### Task 1: Decode numeric feed-title entities

**Files:**
- Modify: `apps/web/src/lib/feed-discovery.test.ts`
- Modify: `apps/web/src/lib/feed-discovery.ts`

- [x] **Step 1: Add failing discovery tests**

Add direct-RSS and website-alternate cases whose titles include decimal and hexadecimal entities:

```ts
it("decodes numeric entities in direct feed titles", async () => {
  const fetchFeed = vi.fn(async () =>
    xmlResponse("<rss><channel><title>产品设计 &#8211; 人人都是产品经理 &#x2014; 精选</title></channel></rss>"),
  );

  const [feed] = await discoverFeeds("https://example.com/feed.xml", { fetchFeed });
  expect(feed?.title).toBe("产品设计 – 人人都是产品经理 — 精选");
});

it("decodes numeric entities in website feed-link titles", async () => {
  const fetchFeed = vi.fn(async () =>
    htmlResponse('<link rel="alternate" type="application/rss+xml" title="产品运营 &#8211; 精选" href="/feed.xml">'),
  );

  const [feed] = await discoverFeeds("https://example.com", { fetchFeed });
  expect(feed?.title).toBe("产品运营 – 精选");
});
```

- [x] **Step 2: Run the focused test and confirm RED**

Run: `pnpm exec vitest run apps/web/src/lib/feed-discovery.test.ts`

Expected: both new assertions fail because the titles still contain `&#8211;` / `&#x2014;`.

- [x] **Step 3: Decode decimal and hexadecimal entities safely**

Extend `decodeEntities` after its named-entity replacements:

```ts
.replace(/&#(\d+);/g, (entity, code) => decodeNumericEntity(entity, code, 10))
.replace(/&#x([0-9a-f]+);/gi, (entity, code) => decodeNumericEntity(entity, code, 16));

function decodeNumericEntity(entity: string, code: string, radix: number) {
  const point = Number.parseInt(code, radix);
  if (!Number.isFinite(point) || point < 0 || point > 0x10ffff) return entity;
  try {
    return String.fromCodePoint(point);
  } catch {
    return entity;
  }
}
```

- [x] **Step 4: Run the focused test and confirm GREEN**

Run: `pnpm exec vitest run apps/web/src/lib/feed-discovery.test.ts`

Expected: all feed-discovery tests pass.

### Task 2: Share article actions across both headers

**Files:**
- Create: `apps/web/src/components/shell/FeedArticleMenu.tsx`
- Modify: `apps/web/src/components/shell/ReaderToolbar.tsx`
- Modify: `apps/web/src/components/shell/ListColumn.tsx`
- Modify: `apps/web/src/app/(app)/feeds/page.tsx`
- Modify: `tests/unit/feed-source-menu.test.mjs`

- [x] **Step 1: Add a failing shared-menu contract**

Extend `feed-source-menu.test.mjs` to assert:

```js
const sharedMenu = read("apps/web/src/components/shell/FeedArticleMenu.tsx");
const toolbar = read("apps/web/src/components/shell/ReaderToolbar.tsx");
const listColumn = read("apps/web/src/components/shell/ListColumn.tsx");

assert.match(sharedMenu, /favoriteActive \? "已收藏" : "收藏"/);
assert.match(sharedMenu, /复制链接/);
assert.match(toolbar, /<FeedArticleMenu/);
assert.match(listColumn, /overflowAction/);
assert.match(feedsPage, /overflowAction=\{[\s\S]*<FeedArticleMenu[\s\S]*disabled=\{!selectedEntry\}/);
```

- [x] **Step 2: Run the contract and confirm RED**

Run: `node --test tests/unit/feed-source-menu.test.mjs`

Expected: failure because `FeedArticleMenu.tsx` and `overflowAction` do not exist.

- [x] **Step 3: Implement the shared menu**

Create `FeedArticleMenu.tsx` with props:

```ts
interface FeedArticleMenuProps {
  disabled?: boolean;
  favoriteActive?: boolean;
  onFavorite?: () => void;
  onCopyLink?: () => void;
}
```

Use the existing `PopoverMenu`, `PrototypeIcon`, menu button classes, and two current feed actions. The trigger uses `more-vertical`, closes after an action, and stays disabled when no article is selected.

- [x] **Step 4: Wire both headers to the component**

In `ReaderToolbar`, render `FeedArticleMenu` for `menuKind === "feed"`; preserve the existing notes and clips menus unchanged.

Add `overflowAction?: ReactNode` to `ListColumnProps` and render it after the search button. In `feeds/page.tsx`, pass:

```tsx
overflowAction={
  <FeedArticleMenu
    disabled={!selectedEntry}
    favoriteActive={Boolean(selectedEntry?.isFavorited)}
    onFavorite={() => void favoriteSelectedEntry()}
    onCopyLink={copySelectedEntryLink}
  />
}
```

Use the same `copySelectedEntryLink` callback for the left menu and `ReaderToolbar`.

- [x] **Step 5: Run the contract and focused TypeScript tests**

Run: `node --test tests/unit/feed-source-menu.test.mjs`

Expected: all feed-source-menu contracts pass.

### Task 3: Keep the full title on one line

**Files:**
- Modify: `apps/web/src/components/shell/ListColumn.tsx`
- Modify: `apps/web/src/app/globals.css`
- Modify: `tests/unit/feed-source-menu.test.mjs`

- [x] **Step 1: Add a failing layout contract**

Assert that the title exposes the complete value through `title={title}` and that CSS applies `min-width: 0`, `overflow: hidden`, `text-overflow: ellipsis`, and `white-space: nowrap` to the title text.

- [x] **Step 2: Run the contract and confirm RED**

Run: `node --test tests/unit/feed-source-menu.test.mjs`

Expected: failure because the title text can still wrap.

- [x] **Step 3: Implement stable single-line layout**

Add `title={title}` to `.mewmo-list-title`, allow its wrapper and button to shrink with `min-width: 0`, and style the child span:

```css
.mewmo-list-title > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Keep the action buttons fixed-size so opening menus or changing favorite state cannot resize the header.

- [x] **Step 4: Run focused tests and confirm GREEN**

Run:

```bash
node --test tests/unit/feed-source-menu.test.mjs
pnpm exec vitest run apps/web/src/lib/feed-discovery.test.ts
```

Expected: both commands pass.

### Task 4: Verify, review, commit, and merge

**Files:**
- Modify: `docs/superpowers/plans/2026-07-15-zoo-20-feed-ui-polish.md` only to record completed checks

- [x] **Step 1: Run repository verification**

Run focused tests, `pnpm test:theme`, web lint/type/build checks selected from the project testing SOP, and `git diff --check`.

- [x] **Step 2: Browser-test the Issue reproduction**

On port 3018, discover `https://www.woshipm.com/category/pd/feed` and confirm the title shows a real dash, remains one line, and the left three-dot menu matches the right reader menu for favorite and copy.

- [x] **Step 3: Review the implementation**

Compare the final diff against the design spec, then run a code-quality review for regressions, accessibility, stale selected-entry state, and unrelated changes.

- [ ] **Step 4: Commit only ZOO-20 implementation files**

Use path-limited staging/commit so existing user-staged and unrelated working-tree changes remain intact.

- [ ] **Step 5: Update Linear and merge**

Add a Chinese completion comment with implementation and verification evidence, leave ZOO-20 in progress for user acceptance unless acceptance is explicitly given, then merge `codex/linear-todo-batches` into `main` and rerun the verification gate on the merged result.
