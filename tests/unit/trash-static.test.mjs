import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("trash routes keep recovery, retention, and permanent delete behind authenticated APIs", () => {
  const listRoutePath = "apps/web/src/app/api/trash/route.ts";
  const itemRoutePath = "apps/web/src/app/api/trash/[kind]/[id]/route.ts";

  assert.ok(existsSync(listRoutePath), "trash list API route should exist");
  assert.ok(existsSync(itemRoutePath), "trash item API route should exist");

  const listRoute = read(listRoutePath);
  const itemRoute = read(itemRoutePath);

  assert.match(listRoute, /auth\(\)/, "trash list should require the current user");
  assert.match(listRoute, /createTrashRepository\(\)\.list\(session\.user\.id\)/, "trash list should use the scoped repository");
  assert.match(itemRoute, /z\.enum\(\["note",\s*"clip",\s*"feed",\s*"knowledge_base"\]\)/, "trash item route should validate supported kinds");
  assert.match(itemRoute, /export async function GET/, "trash item route should expose deleted item details");
  assert.match(itemRoute, /get\(session\.user\.id,\s*parsedKind\.data,\s*id\)/, "GET should read through the scoped repository");
  assert.match(itemRoute, /if \(!item\) return notFound\(\)/, "GET should return 404 for missing trash items");
  assert.match(itemRoute, /restore\(session\.user\.id,\s*parsedKind\.data,\s*id\)/, "PATCH should restore through the scoped repository");
  assert.match(itemRoute, /deletePermanently\(session\.user\.id,\s*parsedKind\.data,\s*id\)/, "DELETE should permanently remove through the scoped repository");
});

test("trash page exposes restore, manual permanent delete, and 14-day retention", () => {
  const pagePath = "apps/web/src/app/(app)/trash/page.tsx";
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
  const toolbar = read("apps/web/src/components/shell/ReaderToolbar.tsx");
  const styles = read("apps/web/src/app/globals.css");

  assert.ok(existsSync(pagePath), "trash page should exist");

  const page = read(pagePath);
  assert.match(sidebar, /href="\/trash"[\s\S]*label="废纸篓"/, "sidebar trash entry should navigate to /trash");
  assert.match(page, /fetch\("\/api\/trash"\)/, "trash page should load trashed items");
  assert.match(page, /method:\s*"PATCH"/, "trash page should restore items");
  assert.match(page, /method:\s*"DELETE"/, "trash page should support permanent delete");
  assert.match(page, /ConfirmDialog/, "permanent delete should be confirmed");
  assert.match(page, /14\s*天/, "trash page should expose the 14-day retention policy");
  assert.match(page, /永久删除/, "trash page should label permanent delete explicitly");
  assert.match(page, /mewmo-list-card--button/, "trash items should use selectable workspace cards");
  assert.match(page, /mewmo-list-card--selected/, "trash cards should expose the selected state");
  assert.match(page, /refreshWorkspaceResource\(/, "trash details should load only for the selected item");
  assert.match(page, /SharedNoteMarkdown/, "deleted notes should render through the read-only markdown renderer");
  assert.match(page, /ClipContentRenderer/, "deleted clips should use the sanitized clip renderer");
  assert.match(page, /<ReaderToolbar[\s\S]*actions=/, "trash mutations should live in the reader toolbar");
  assert.doesNotMatch(
    page,
    /onToggleList=/,
    "trash reader should not expose the fullscreen list toggle",
  );
  assert.match(page, /mewmo-reader-surface--trash/, "trash reader should expose a focused responsive surface");
  assert.doesNotMatch(page, /mewmo-trash-card__actions/, "trash list cards should not contain management buttons");
  assert.match(toolbar, /showMenu\?: boolean/, "reader toolbar should allow custom-action pages to hide its default menu");
  assert.match(toolbar, /hidden=\{!showMenu\}/, "hidden trash menu should not remain interactive");
  assert.match(styles, /\.mewmo-trash-reader-actions/, "trash reader actions should have focused toolbar layout");
  assert.match(
    styles,
    /\.mewmo-trash-reader-actions \.mewmo-button\s*\{[^}]*white-space:\s*nowrap/,
    "trash reader actions should remain readable in a narrow reader toolbar",
  );
  assert.match(styles, /\.mewmo-document--trash-detail/, "trash details should use a reader document layout");
  assert.match(
    styles,
    /@media \(max-width:\s*900px\)[\s\S]*?\.mewmo-reader-surface--trash \.mewmo-reader-toolbar__nav\s*\{[^}]*display:\s*none/,
    "narrow trash readers should reserve toolbar space for restore and delete",
  );
  assert.doesNotMatch(styles, /\.mewmo-trash-card__actions/, "obsolete card action styles should be removed");
});
