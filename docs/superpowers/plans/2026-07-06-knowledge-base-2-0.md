# Knowledge Base 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the 2.0 knowledge base feature as a real Postgres-backed workflow that matches the high-fidelity prototype behavior, not a visual-only clone.

**Architecture:** Knowledge bases are first-class user-owned records in Postgres. A knowledge base has folders and mixed items; items can point to notes, clips, feed entries, or imported asset metadata. The Web UI uses the existing shell rhythm: sidebar push drawer, list column cards, reader surface, floating row menus, and centered import modal.

**Tech Stack:** Next.js 16 App Router, React 19 client components, Prisma 7, PostgreSQL, shared Zod validators, Vitest, node:test static UI contract tests.

---

## File Structure

- `packages/db/prisma/schema.prisma`: add `KnowledgeBase`, `KnowledgeFolder`, `KnowledgeItem`, `KnowledgeItemKind`, `KnowledgeAssetType`.
- `packages/db/src/repositories/knowledge-bases.ts`: centralize tenant-scoped tree, contents, folder CRUD, import, rename, delete.
- `packages/db/src/index.ts`: export the knowledge repository.
- `packages/shared/src/validators/content.ts`: add route-boundary validators for knowledge bases, folders, item imports, and asset placeholders.
- `packages/shared/src/validators/content.test.ts`: verify validators enforce prototype limits like four folder levels and supported item kinds.
- `packages/db/src/repositories/repositories.test.ts`: verify repository calls always include `userId`, soft-delete guards, and max-depth behavior helpers.
- `apps/web/src/app/api/knowledge-bases/[[...parts]]/route.ts`: implement list, detail, folder CRUD, contents, import, local asset placeholder, and soft delete.
- `apps/web/src/lib/knowledge-content.ts`: map mixed knowledge items to prototype card metadata, icons, source badges, and reader copy.
- `apps/web/src/lib/knowledge-tree.ts`: keep folder tree depth/select/collapse semantics out of `Sidebar.tsx`.
- `apps/web/src/components/knowledge/KnowledgeImportModal.tsx`: prototype import modal with `笔记` / `剪藏` tabs, selectable left list, right preview, preselection count, and import action.
- `apps/web/src/components/shell/Sidebar.tsx`: replace deferred knowledge entries with real KB rows and an Apple Notes-style drawer.
- `apps/web/src/app/(app)/knowledge-bases/page.tsx`: mixed content list + reader for selected KB root/folder/item.
- `apps/web/src/app/globals.css`: add drawer, folder tree, mixed item badges, and import modal styles while reusing existing shell classes.
- `tests/unit/workspace-prototype-ui.test.mjs`: add static contract checks for knowledge base drawer, import modal, mixed list, and prototype labels.

## Tasks

### Task 1: Shared Contracts

- [ ] Write failing validator tests for knowledge base create/update, folder create/update with depth `0..3`, import payloads for notes/clips/feed entries, and asset placeholders for `pdf` / `ebook`.
- [ ] Run `pnpm --filter @mewmo/shared test -- content.test.ts` and confirm the new tests fail because schemas are missing.
- [ ] Add validators and exported schemas in `packages/shared/src/validators/content.ts`.
- [ ] Re-run the shared validator test and confirm it passes.

### Task 2: Data Model and Repository

- [ ] Write failing repository tests for user-scoped KB listing, active tree retrieval, folder creation under a parent, max-depth rejection, root/folder contents ordering, item import, and soft delete.
- [ ] Run `pnpm --filter @mewmo/db test -- repositories.test.ts` and confirm the new tests fail because the repository does not exist.
- [ ] Add Prisma models/enums and repository methods.
- [ ] Export the repository from `packages/db/src/index.ts`.
- [ ] Run `pnpm db:generate` so Prisma client types include knowledge models.
- [ ] Re-run the db repository tests and confirm they pass.

### Task 3: API Routes

- [ ] Add route tests or static API contract tests for `/api/knowledge-bases`, `/api/knowledge-bases/:id`, `/folders`, `/contents`, `/items/import`, and `/items/asset`.
- [ ] Confirm the tests fail before route implementation.
- [ ] Implement a catch-all knowledge route using shared validators and `packages/db` repository methods.
- [ ] Re-run the API tests.

### Task 4: Sidebar Drawer

- [ ] Add static UI tests requiring the knowledge group to stop using the deferred toast path, render `mewmo-knowledge-pane`, preserve `产品设计` / `技术笔记`, and include root/folder menus matching the prototype labels.
- [ ] Confirm the tests fail.
- [ ] Extract folder-tree helpers into `apps/web/src/lib/knowledge-tree.ts`.
- [ ] Update `Sidebar.tsx` to fetch knowledge bases, open the drawer, render recursive folders with depth, support root/folder row actions, and navigate to `/knowledge-bases?kbId=...&folderId=...`.
- [ ] Add CSS for `mewmo-knowledge-pane`, folder rows, collapse state, active root row, and row action visibility.
- [ ] Re-run UI contract tests.

### Task 5: Mixed Content Page and Import Modal

- [ ] Add tests for `knowledge-content` mapping icons/source badges for note, clipped article, clipped video/feed entry, PDF, and ebook.
- [ ] Confirm the tests fail.
- [ ] Implement `knowledge-content.ts` and the `/knowledge-bases` page with the list/reader split.
- [ ] Implement `KnowledgeImportModal` with prototype tabs, checkbox list, right preview, default two clip selections, and `导入 N 项` submit text.
- [ ] Wire import, local asset placeholder creation, export toast, rename, and delete menu actions.
- [ ] Re-run targeted tests.

### Task 6: Runtime Verification

- [ ] Run `pnpm --filter @mewmo/shared test`.
- [ ] Run `pnpm --filter @mewmo/db test`.
- [ ] Run `pnpm test`.
- [ ] Start `pnpm --filter @mewmo/web dev` on an available port.
- [ ] Verify in browser: sidebar KB rows open the push drawer, root click shows all files, folder click changes list title, chevron collapses folder, menus show the prototype options, import modal tabs/preview/count work, mixed cards render correct icons and reader content.
