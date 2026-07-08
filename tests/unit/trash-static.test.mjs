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
  assert.match(itemRoute, /restore\(session\.user\.id,\s*parsedKind\.data,\s*id\)/, "PATCH should restore through the scoped repository");
  assert.match(itemRoute, /deletePermanently\(session\.user\.id,\s*parsedKind\.data,\s*id\)/, "DELETE should permanently remove through the scoped repository");
});

test("trash page exposes restore, manual permanent delete, and 14-day retention", () => {
  const pagePath = "apps/web/src/app/(app)/trash/page.tsx";
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");

  assert.ok(existsSync(pagePath), "trash page should exist");

  const page = read(pagePath);
  assert.match(sidebar, /href="\/trash"[\s\S]*label="废纸篓"/, "sidebar trash entry should navigate to /trash");
  assert.match(page, /fetch\("\/api\/trash"\)/, "trash page should load trashed items");
  assert.match(page, /method:\s*"PATCH"/, "trash page should restore items");
  assert.match(page, /method:\s*"DELETE"/, "trash page should support permanent delete");
  assert.match(page, /ConfirmDialog/, "permanent delete should be confirmed");
  assert.match(page, /14\s*天/, "trash page should expose the 14-day retention policy");
  assert.match(page, /永久删除/, "trash page should label permanent delete explicitly");
});
