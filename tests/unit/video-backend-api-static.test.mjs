import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("video API exposes authenticated create, reanalysis, highlight, and tag routes", () => {
  const routes = [
    "apps/web/src/app/api/videos/route.ts",
    "apps/web/src/app/api/videos/[id]/reanalyze/route.ts",
    "apps/web/src/app/api/videos/[id]/highlights/route.ts",
    "apps/web/src/app/api/videos/[id]/highlights/[highlightId]/route.ts",
    "apps/web/src/app/api/feed-entries/[id]/tags/route.ts",
  ];

  for (const route of routes) {
    assert.ok(existsSync(route), `${route} should exist`);
    assert.match(read(route), /auth\(\)/, `${route} should require the current session`);
  }

  const createRoute = read(routes[0]);
  assert.match(createRoute, /createVideoSchema/);
  assert.match(createRoute, /addVideoMetadataJob/);
  assert.match(createRoute, /status:\s*202/);

  const reanalyzeRoute = read(routes[1]);
  assert.match(reanalyzeRoute, /analysisVersion:\s*\{\s*increment:\s*1\s*\}/);
  assert.match(reanalyzeRoute, /force:\s*true/);

  const highlightRoute = read(routes[2]);
  assert.match(highlightRoute, /createVideoHighlightSchema/);
  assert.match(highlightRoute, /createHighlight/);

  const tagRoute = read(routes[4]);
  assert.match(tagRoute, /replaceFeedEntryTagsSchema/);
  assert.match(tagRoute, /replaceFeedEntryTags/);
});

test("feed entry detail exposes video-only data behind an owned video guard", () => {
  const route = read("apps/web/src/app/api/feed-entries/[id]/route.ts");

  assert.match(route, /entry\.feed\.type === "video"/);
  assert.match(route, /createVideosRepository\(\)\.findDetail/);
  assert.match(route, /taggableType:\s*"feed_entry"/);
  assert.match(route, /userId:\s*session\.user\.id/);
  assert.match(route, /export async function DELETE/);
  assert.match(route, /entry\.feed\.type !== "video"/);
  assert.match(route, /deletedAt:\s*new Date\(\)/);
});
