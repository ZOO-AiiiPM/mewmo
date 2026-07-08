import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const routePath = "apps/web/src/app/api/ai/summary/route.ts";
const sidebarPath = "apps/web/src/components/shell/AISidebar.tsx";
const clipDetailPath = "apps/web/src/app/(app)/clips/[id]/ClipDetailClient.tsx";
const feedsPagePath = "apps/web/src/app/(app)/feeds/page.tsx";

const read = (path) => readFileSync(path, "utf8");

test("AI summary API only summarizes saved clips and feed entries", () => {
  assert.ok(existsSync(routePath), "summary route should exist");
  const route = read(routePath);

  assert.match(route, /summarizeContent/, "route should call the shared AI summarizer");
  assert.match(route, /targetType:\s*z\.enum\(\["clip",\s*"feed_entry"\]\)/, "route should reject notes");
  assert.match(route, /auth\(\)/, "route should require the current user session");
  assert.match(route, /deletedAt:\s*null/, "route should scope reads and writes to active rows");
  assert.match(route, /prisma\.clip\.updateMany/, "clip summaries should be written back safely");
  assert.match(route, /prisma\.feedEntry\.updateMany/, "feed entry summaries should be written back safely");
  assert.match(route, /version:\s*\{\s*increment:\s*1\s*\}/, "summary writes should bump sync version");
});

test("AI sidebar requests real summaries for the current saved article", () => {
  const sidebar = read(sidebarPath);
  const clipDetail = read(clipDetailPath);
  const feedsPage = read(feedsPagePath);

  assert.match(sidebar, /id:\s*string/, "sidebar context should carry the saved article id");
  assert.match(sidebar, /fetch\("\/api\/ai\/summary"/, "summary action should call the backend API");
  assert.match(sidebar, /targetType:\s*context\.kind/, "summary action should send the current context type");
  assert.match(sidebar, /targetId:\s*context\.id/, "summary action should send the current context id");
  assert.doesNotMatch(sidebar, /setTimeout\(\(\)\s*=>\s*\{[\s\S]*setSummaryStatus\("failed"\)/, "summary action should not fake generation failure");

  assert.match(clipDetail, /id:\s*selectedClip\.id/, "clip pages should provide the selected clip id to the sidebar");
  assert.match(feedsPage, /id:\s*selectedEntry\.id/, "feed pages should provide the entry id to the sidebar");
});
