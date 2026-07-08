# Knowledge Base Reuse Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the knowledge base page reuse the existing note, clip, and today-page card/reader mechanisms for previews, TOC, and per-card actions.

**Architecture:** Keep the knowledge base data model and API unchanged. Move preview text decisions into `apps/web/src/lib/knowledge-content.ts` by calling existing note and clip helpers, then wire `ReaderToc` and `CardActionMenu` into `apps/web/src/app/(app)/knowledge-bases/page.tsx`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, node:test static UI contracts.

---

## File Structure

- Modify `tests/unit/knowledge-content.test.ts`: add failing behavior tests for Markdown preview cleanup through `buildKnowledgeCardView`.
- Modify `tests/unit/knowledge-ui-static.test.mjs`: add failing static checks for `ReaderToc`, `buildNoteToc`, `buildHtmlToc`, per-card `CardActionMenu`, and menu-open card wrapper state.
- Modify `apps/web/src/lib/knowledge-content.ts`: reuse `notePreviewText` and `clipPreviewText` instead of local generic preview stripping for note/clip/feed summaries.
- Modify `apps/web/src/app/(app)/knowledge-bases/page.tsx`: add TOC calculation, render `ReaderToc`, add card action menus, track hovered/menu-open cards, and route menu handlers by item kind.

## Task 1: Preview Cleanup Contract

- [ ] Add a test to `tests/unit/knowledge-content.test.ts` that calls `buildKnowledgeCardView` for a note whose content includes `# 标题`, Markdown image syntax, table divider rows, `**bold**`, and checklist/list prefixes. Expected summary is clean text without Markdown control symbols.
- [ ] Run `pnpm exec vitest run tests/unit/knowledge-content.test.ts` and confirm the new test fails because `buildKnowledgeCardView` still uses generic `previewText`.
- [ ] Update `apps/web/src/lib/knowledge-content.ts` so note cards call `notePreviewText({ summary, content })`, clip cards call `clipPreviewText({ summary, excerpt, content, url })`, and feed entries use `clipPreviewText` with their URL/content fields.
- [ ] Re-run `pnpm exec vitest run tests/unit/knowledge-content.test.ts` and confirm it passes.

## Task 2: Knowledge Page Reuse Contract

- [ ] Add static assertions to `tests/unit/knowledge-ui-static.test.mjs` requiring the knowledge page to import and render `ReaderToc`, import `buildNoteToc` and `buildHtmlToc`, render `CardActionMenu` inside list cards, use `mewmo-list-card-wrap--menu-open`, and pass `kind={item.kind === "note" ? "notes" : "clips"}`.
- [ ] Run `node --test tests/unit/knowledge-ui-static.test.mjs` and confirm the new checks fail.
- [ ] Update `apps/web/src/app/(app)/knowledge-bases/page.tsx` to compute TOC from selected note Markdown or selected clip/feed HTML, render `ReaderToc`, add per-card `CardActionMenu`, and keep card click/menu click behavior separate.
- [ ] Re-run `node --test tests/unit/knowledge-ui-static.test.mjs` and confirm it passes.

## Task 3: Verification

- [ ] Run `pnpm exec vitest run tests/unit/knowledge-content.test.ts tests/unit/knowledge-import-preview.test.ts`.
- [ ] Run `node --test tests/unit/knowledge-api-static.test.mjs tests/unit/knowledge-ui-static.test.mjs`.
- [ ] Run `pnpm --filter @mewmo/web lint`.
