import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(path, "utf8");
}

test("feed article and media categories stay independent", () => {
  const schema = read("packages/db/prisma/schema.prisma");
  const feedEntriesRoute = read("apps/web/src/app/api/feed-entries/route.ts");
  const feedsRoute = read("apps/web/src/app/api/feeds/[[...parts]]/route.ts");
  const feedsPage = read("apps/web/src/app/(app)/feeds/page.tsx");

  assert.match(
    schema,
    /@@unique\(\[userId,\s*url,\s*type\]\)/,
    "the same RSS URL should be allowed once per feed category",
  );
  assert.match(
    feedsRoute,
    /where:\s*\{\s*url:\s*parsed\.data\.url,\s*userId,\s*type:\s*parsed\.data\.type,\s*deletedAt:\s*null\s*\}/,
    "duplicate feed lookup should be scoped by type",
  );
  assert.match(
    feedEntriesRoute,
    /select:\s*\{\s*id:\s*true,\s*type:\s*true\s*\}/,
    "feed entry queries with feedId should load the source type",
  );
  assert.match(
    feedEntriesRoute,
    /feed\.type !== parsedType\.data/,
    "feed entry queries with feedId should reject a source from another category",
  );
  assert.match(
    feedsPage,
    /autoDetectType=\{addOpen && !parsedType\}/,
    "discover results should only switch category when the add modal was opened without an explicit type",
  );
});

test("main subscription add uses discovery type while typed add stays pinned", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
  const feedsPage = read("apps/web/src/app/(app)/feeds/page.tsx");

  assert.match(
    sidebar,
    /if \(!feedDrawer\) \{\s*router\.push\("\/feeds\?add=1"\);/,
    "adding from the main subscription group should not force an article type",
  );
  assert.match(
    sidebar,
    /router\.push\(`\/feeds\?type=\$\{feedDrawer\}&add=1`\)/,
    "adding from a typed drawer should stay pinned to that drawer type",
  );
  assert.match(
    feedsPage,
    /autoDetectType=\{addOpen && !parsedType\}/,
    "the add modal should only auto-detect type when the URL has no explicit type",
  );
  assert.match(
    feedsPage,
    /autoDetectType[\s\S]*setAutoType\(autoDetectType\)/,
    "the add modal should reset auto-detection from the opening context",
  );
  assert.match(
    feedsPage,
    /autoType[\s\S]*nextResults\[0\]\?\.type[\s\S]*setType\(nextResults\[0\]\.type\)/,
    "main-directory search should adopt the discovered first result type",
  );
  assert.match(
    feedsPage,
    /autoType[\s\S]*result\.type[\s\S]*setType\(result\.type\)/,
    "main-directory result selection should adopt that result's discovered type",
  );
  assert.match(
    feedsPage,
    /setAutoType\(false\);[\s\S]*setType\(item\.type\)/,
    "manual category selection should stop automatic discovery overrides",
  );
});
