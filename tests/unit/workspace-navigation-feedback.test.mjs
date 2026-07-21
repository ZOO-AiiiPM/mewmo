import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("workspace navigation keeps the current page and exposes only lightweight pending feedback", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
  const shell = read("apps/web/src/components/shell/AppShell.tsx");
  const css = read("apps/web/src/app/globals.css");

  assert.ok(!existsSync("apps/web/src/app/(app)/loading.tsx"));
  assert.ok(!existsSync("apps/web/src/components/shell/WorkspaceRouteLoading.tsx"));
  assert.match(sidebar, /beginNavigation/);
  assert.match(sidebar, /pendingHref === href/);
  assert.match(sidebar, /mewmo-nav-row--pending/);
  assert.match(sidebar, /aria-busy=\{pending\}/);
  assert.match(shell, /WorkspaceNavigationProvider/);
  assert.doesNotMatch(shell, /mewmo-workspace-navigation-progress/);
  assert.doesNotMatch(css, /mewmo-workspace-navigation-progress/);
  assert.doesNotMatch(css, /mewmo-workspace-route-loading/);
  assert.match(css, /\.mewmo-nav-row--pending/);
  assert.match(css, /@keyframes mewmo-skeleton-sweep/);
  assert.match(css, /\.mewmo-list-card--skeleton/);
  assert.match(css, /\.mewmo-list-card-skeleton__preview/);
  assert.match(css, /\.mewmo-reader-content-skeleton[\s\S]{0,180}min-height:\s*calc\(100vh/);
  assert.doesNotMatch(
    css,
    /mewmo-skeleton-breath|mewmo-skeleton-shimmer|mewmo-skeleton-extend|mewmo-route-skeleton-sweep|mewmo-reader-content-enter/,
  );
  assert.ok(existsSync("apps/web/src/components/shell/ReaderContentSkeleton.tsx"));
  assert.ok(existsSync("apps/web/src/components/shell/ListContentSkeleton.tsx"));
  assert.ok(!existsSync("apps/web/src/lib/use-skeleton-gate.ts"));
});

test("workspace navigation records click-to-route-commit timing", () => {
  const navigation = read("apps/web/src/lib/workspace-navigation.tsx");
  assert.match(navigation, /performance\.mark\("mewmo:workspace-navigation:start"/);
  assert.match(navigation, /performance\.mark\("mewmo:workspace-navigation:commit"/);
  assert.match(navigation, /performance\.measure\(\s*"mewmo:workspace-navigation"/);
  assert.match(navigation, /if \(!navigationTargetCommitted\(currentHref, pendingHref\)\) return/);
});

test("primary workspace GET APIs expose auth db and total server timing", () => {
  for (const path of [
    "apps/web/src/app/api/notes/route.ts",
    "apps/web/src/app/api/notes/[id]/route.ts",
    "apps/web/src/app/api/clips/route.ts",
    "apps/web/src/app/api/clips/[id]/route.ts",
    "apps/web/src/app/api/feeds/[[...parts]]/route.ts",
    "apps/web/src/app/api/feed-entries/route.ts",
    "apps/web/src/app/api/feed-entries/[id]/route.ts",
    "apps/web/src/app/api/today/route.ts",
    "apps/web/src/app/api/trash/route.ts",
    "apps/web/src/app/api/trash/[kind]/[id]/route.ts",
    "apps/web/src/app/api/knowledge-bases/[[...parts]]/route.ts",
  ]) {
    const source = read(path);
    assert.match(source, /createServerTiming/);
    assert.match(source, /timing\.measure\("auth"/);
    assert.match(source, /timing\.measure\("db"/);
    assert.match(source, /attachServerTiming/);
  }
});
