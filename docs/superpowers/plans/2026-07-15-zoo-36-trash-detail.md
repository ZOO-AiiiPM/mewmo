# ZOO-36 Trash Detail Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the trash page into a selectable two-column workspace with Today-style cards, on-demand read-only details, and restore/delete actions in the reader toolbar.

**Architecture:** Keep `GET /api/trash` lightweight and add a scoped detail lookup to the existing `/api/trash/[kind]/[id]` route. The client derives the selected list item, fetches only that item's full detail, and renders notes and clips through existing read-only renderers while feed and knowledge-base records use metadata views.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Prisma repository layer, Vitest, Node static tests, existing mewmo workspace components.

---

## File map

- Modify `packages/db/src/repositories/trash.ts` to expose lightweight cover metadata and a user-scoped `get` detail method.
- Modify `packages/db/src/repositories/repositories.test.ts` to cover list metadata and detail ownership/deleted guards.
- Modify `apps/web/src/app/api/trash/[kind]/[id]/route.ts` to add authenticated `GET` detail handling.
- Modify `tests/unit/trash-static.test.mjs` to lock the detail route and selectable two-column UI contract.
- Modify `apps/web/src/components/shell/ReaderToolbar.tsx` to allow pages with custom actions to hide the unrelated default menu.
- Rewrite `apps/web/src/app/(app)/trash/page.tsx` around selected-item detail loading and read-only rendering.
- Modify `apps/web/src/app/globals.css` to replace management-card styles with selected cards and reader actions.

### Task 1: Add lightweight list metadata and scoped detail lookup

**Files:**
- Modify: `packages/db/src/repositories/repositories.test.ts`
- Modify: `packages/db/src/repositories/trash.ts`

- [ ] **Step 1: Write failing repository tests**

Extend the existing trash repository tests so the clip list fixture contains `coverImage`, `favicon`, `excerpt`, and `sourceName`, and assert that these lightweight fields survive mapping without `content`. Add a detail test with a mocked `note.findFirst`:

```ts
it("loads one trashed item with ownership and deleted guards", async () => {
  const findFirst = vi.fn().mockResolvedValue({
    id: "note-1",
    title: "Deleted note",
    summary: "Summary",
    content: "# Body",
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-02T00:00:00.000Z"),
    deletedAt: new Date("2026-07-03T00:00:00.000Z"),
  });
  const repo = createTrashRepository({ note: { findFirst } });

  await expect(repo.get("user-1", "note", "note-1")).resolves.toMatchObject({
    type: "note",
    id: "note-1",
    content: "# Body",
  });
  expect(findFirst).toHaveBeenCalledWith({
    where: { id: "note-1", userId: "user-1", deletedAt: { not: null } },
    select: expect.objectContaining({ content: true, deletedAt: true }),
  });
});
```

- [ ] **Step 2: Run the repository test and verify RED**

Run:

```bash
pnpm --filter @mewmo/db test --run src/repositories/repositories.test.ts
```

Expected: FAIL because `TrashModelClient` has no `findFirst`, clip list metadata is discarded, and `repo.get` does not exist.

- [ ] **Step 3: Implement the minimal repository changes**

Add optional detail fields to `TrashItem` and `DeletedRecord`, add `findFirst` to `TrashModelClient`, and map only fields present on each record:

Add these exact optional properties to `TrashItem` and `DeletedRecord`:

```ts
content?: string;
description?: string | null;
excerpt?: string | null;
favicon?: string | null;
coverImage?: string | null;
sourceName?: string | null;
author?: string | null;
publishedAt?: Date | null;

interface TrashModelClient {
  findMany?(args: unknown): Promise<DeletedRecord[]>;
  findFirst?(args: unknown): Promise<DeletedRecord | null>;
  updateMany?(args: unknown): Promise<{ count: number }>;
  deleteMany?(args: unknown): Promise<{ count: number }>;
}
```

Add lightweight clip fields to `clipSelect`; keep `content` out of every list select. Add per-kind detail selects and the method:

```ts
async get(userId: string, kind: TrashKind, id: string) {
  const record = await delegateFor(db, kind)?.findFirst?.({
    where: { id, userId, deletedAt: { not: null } },
    select: detailSelectFor(kind),
  });
  return record ? toTrashItem(kind, record) : null;
}
```

- [ ] **Step 4: Run the repository test and verify GREEN**

Run the same package test. Expected: PASS with the new list and detail assertions.

- [ ] **Step 5: Commit the repository slice**

```bash
git add packages/db/src/repositories/trash.ts packages/db/src/repositories/repositories.test.ts
git commit -m "feat(db): add trash detail lookup"
```

### Task 2: Expose authenticated trash detail GET

**Files:**
- Modify: `tests/unit/trash-static.test.mjs`
- Modify: `apps/web/src/app/api/trash/[kind]/[id]/route.ts`

- [ ] **Step 1: Write the failing route contract**

Add assertions requiring an exported `GET`, the same authentication and kind validation used by mutations, the scoped repository call, and a 404 for missing deleted records:

```js
assert.match(itemRoute, /export async function GET/);
assert.match(itemRoute, /get\(session\.user\.id,\s*parsedKind\.data,\s*id\)/);
assert.match(itemRoute, /if \(!item\) return notFound\(\)/);
```

- [ ] **Step 2: Run the static test and verify RED**

Run:

```bash
pnpm exec tsx --test tests/unit/trash-static.test.mjs
```

Expected: FAIL because the route does not export `GET`.

- [ ] **Step 3: Implement authenticated GET**

Add a handler before `PATCH`:

```ts
export async function GET(
  _request: Request,
  { params }: { params: Promise<TrashItemRouteParams> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { kind, id } = await params;
  const parsedKind = trashKindSchema.safeParse(kind);
  if (!parsedKind.success) return invalidKind();

  const item = await createTrashRepository().get(session.user.id, parsedKind.data, id);
  if (!item) return notFound();
  return NextResponse.json(item);
}
```

- [ ] **Step 4: Run the static test and verify GREEN**

Run the same test. Expected: PASS.

- [ ] **Step 5: Commit the API slice**

```bash
git add apps/web/src/app/api/trash/[kind]/[id]/route.ts tests/unit/trash-static.test.mjs
git commit -m "feat(web): expose trash item details"
```

### Task 3: Build selectable cards and on-demand reader details

**Files:**
- Modify: `tests/unit/trash-static.test.mjs`
- Modify: `apps/web/src/components/shell/ReaderToolbar.tsx`
- Modify: `apps/web/src/app/(app)/trash/page.tsx`

- [ ] **Step 1: Write failing page assertions**

Require the page to use button cards with selection, fetch one item detail, use the existing read-only renderers, place actions in `ReaderToolbar`, and remove per-card management actions:

```js
assert.match(page, /mewmo-list-card--button/);
assert.match(page, /mewmo-list-card--selected/);
assert.match(page, /fetch\(itemPath\(selectedListItem\)\)/);
assert.match(page, /SharedNoteMarkdown/);
assert.match(page, /ClipContentRenderer/);
assert.match(page, /<ReaderToolbar[\s\S]*actions=/);
assert.doesNotMatch(page, /mewmo-trash-card__actions/);
```

Add a toolbar assertion for `showMenu` so trash can render only its explicit actions.

- [ ] **Step 2: Run the static test and verify RED**

Run:

```bash
pnpm exec tsx --test tests/unit/trash-static.test.mjs
```

Expected: FAIL because the current trash cards are not selectable and the right side only shows counts.

- [ ] **Step 3: Add the minimal toolbar escape hatch**

Add this exact property to `ReaderToolbarProps`:

```tsx
showMenu?: boolean;
```

Default it while destructuring props:

```tsx
showMenu = true,
```

Then make the current menu wrapper non-rendering and non-accessible when the page supplies custom actions:

```tsx
<div className="mewmo-reader-toolbar__menu-wrap" hidden={!showMenu}>
```

- [ ] **Step 4: Rewrite trash selection and detail loading**

Use a stable `${type}-${id}` key, derive the selected list item from visible results, and fetch details only for that item:

```ts
const [selectedKey, setSelectedKey] = useState<string | null>(null);
const [selectedDetail, setSelectedDetail] = useState<TrashItem | null>(null);
const [loadingDetailKey, setLoadingDetailKey] = useState<string | null>(null);

const selectedListItem =
  visibleItems.find((item) => itemKey(item) === selectedKey) ??
  visibleItems[0] ??
  null;

useEffect(() => {
  if (!selectedListItem) {
    setSelectedDetail(null);
    return;
  }
  const item = selectedListItem;
  let cancelled = false;
  setLoadingDetailKey(itemKey(item));
  fetch(itemPath(item))
    .then((response) => {
      if (!response.ok) throw new Error("detail");
      return response.json() as Promise<TrashItem>;
    })
    .then((detail) => {
      if (!cancelled) setSelectedDetail(detail);
    })
    .catch(() => {
      if (!cancelled) setSelectedDetail(null);
    })
    .finally(() => {
      if (!cancelled) setLoadingDetailKey(null);
    });
  return () => { cancelled = true; };
}, [selectedListItem]);
```

Render Today-style button cards with preview text, optional `coverImage`, bottom type/source metadata, deletion time, and remaining days. Render a `ReaderToolbar` with `showMenu={false}` and two explicit action buttons. Use `SharedNoteMarkdown` for notes, `ClipContentRenderer` for clips, and metadata paragraphs for feed and knowledge-base details.

After restore or delete, remove the item from `items`, clear the stale detail, and let the derived selection fall through to the next visible card.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
pnpm exec tsx --test tests/unit/trash-static.test.mjs
pnpm --filter @mewmo/web lint
```

Expected: trash tests PASS and web lint exits 0.

- [ ] **Step 6: Commit the UI behavior slice**

```bash
git add tests/unit/trash-static.test.mjs apps/web/src/components/shell/ReaderToolbar.tsx 'apps/web/src/app/(app)/trash/page.tsx'
git commit -m "feat(web): add trash detail workspace"
```

### Task 4: Match Today-style visual hierarchy and verify the feature

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `tests/unit/trash-static.test.mjs`

- [ ] **Step 1: Add a failing style assertion**

Require trash-specific reader actions and remove the obsolete management-card selector:

```js
const styles = read("apps/web/src/app/globals.css");
assert.match(styles, /\.mewmo-trash-reader-actions/);
assert.match(styles, /\.mewmo-document--trash-detail/);
assert.doesNotMatch(styles, /\.mewmo-trash-card__actions/);
```

- [ ] **Step 2: Run the static test and verify RED**

Run the trash static test. Expected: FAIL because the new selectors do not exist and old card-action styles remain.

- [ ] **Step 3: Implement focused styles**

Delete the obsolete trash summary/card-action rules. Add only layout-specific styles while relying on the shared list-card system:

```css
.mewmo-trash-reader-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mewmo-trash-reader-actions .mewmo-button {
  min-height: 30px;
  padding: 6px 10px;
  font-size: 12px;
}

.mewmo-document--trash-detail {
  min-height: 100%;
}

.mewmo-trash-detail__empty {
  color: var(--ink-faint);
}
```

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
pnpm exec tsx --test tests/unit/trash-static.test.mjs
pnpm --filter @mewmo/db test --run src/repositories/repositories.test.ts
pnpm test
pnpm lint
pnpm test:theme
pnpm build
```

Expected: every command exits 0 with no failing tests or theme violations.

- [ ] **Step 5: Run browser verification**

Start the web app with the established development environment, open `/trash`, and verify desktop plus narrow viewport states: selected card, cover image, note detail, clip detail, feed detail, knowledge-base detail, restore flow, delete confirmation, empty state, and no console errors.

- [ ] **Step 6: Commit the visual slice**

```bash
git add apps/web/src/app/globals.css tests/unit/trash-static.test.mjs
git commit -m "style(web): polish trash detail workspace"
```

- [ ] **Step 7: Complete Linear handoff**

Comment on `ZOO-36` with the implementation summary and verification evidence, then set the issue to Done only after the branch is pushed or otherwise handed off according to the user's requested integration path.
