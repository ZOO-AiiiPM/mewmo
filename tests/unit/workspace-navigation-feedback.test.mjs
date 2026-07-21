import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("workspace navigation exposes an immediate pending target and shared route skeleton", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
  const shell = read("apps/web/src/components/shell/AppShell.tsx");
  const routeLoading = read("apps/web/src/components/shell/WorkspaceRouteLoading.tsx");
  const css = read("apps/web/src/app/globals.css");

  assert.ok(existsSync("apps/web/src/app/(app)/loading.tsx"));
  assert.ok(existsSync("apps/web/src/components/shell/WorkspaceRouteLoading.tsx"));
  assert.match(sidebar, /beginNavigation/);
  assert.match(shell, /WorkspaceNavigationProvider/);
  assert.doesNotMatch(shell, /mewmo-workspace-navigation-progress/);
  assert.doesNotMatch(css, /mewmo-workspace-navigation-progress/);
  assert.match(routeLoading, /mewmo-skeleton-block/);
  assert.match(routeLoading, /mewmo-workspace-route-loading__card-title/);
  assert.match(css, /\.mewmo-skeleton-sweep/);
  assert.match(css, /@keyframes mewmo-skeleton-extend/);
  assert.doesNotMatch(
    css,
    /mewmo-skeleton-shimmer|mewmo-skeleton-breath|mewmo-reader-content-enter/,
  );
  assert.doesNotMatch(css, /\.mewmo-skeleton-block[\s\S]{0,240}infinite/);
  assert.ok(existsSync("apps/web/src/components/shell/ReaderContentSkeleton.tsx"));
  assert.ok(existsSync("apps/web/src/components/shell/ListContentSkeleton.tsx"));
  assert.ok(existsSync("apps/web/src/lib/use-skeleton-gate.ts"));
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
