import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("Clip schema enforces nullable per-user normalized URL identity", () => {
  const schema = read("packages/db/prisma/schema.prisma");
  assert.match(schema, /normalizedUrl\s+String\?\s+@map\("normalized_url"\)/);
  assert.match(schema, /fetchStatus\s+String\s+@default\("idle"\)/);
  assert.match(schema, /fetchError\s+String\?/);
  assert.match(schema, /fetchedAt\s+DateTime\?/);
  assert.match(schema, /@@unique\(\[userId,\s*normalizedUrl\]\)/);
});


test("clip creation persists normalized identity before queueing extraction", () => {
  const route = read("apps/web/src/app/api/clips/route.ts");
  assert.match(route, /normalizeClipUrlIdentity/);
  assert.match(route, /addClipFetchJob/);
  assert.doesNotMatch(route, /fetchClipFromUrl/,
    "remote extraction must not block clip creation");
  assert.match(route, /normalizedUrl/);
  assert.match(route, /fetchStatus:\s*"queued"/);
  assert.match(route, /existing:\s*false/);
  assert.match(route, /P2002[\s\S]*existing:\s*true/,
    "database uniqueness races should return the existing Clip");
});


test("clip background refresh is authenticated and records extraction state", () => {
  const route = read("apps/web/src/app/api/clips/[id]/route.ts");
  assert.match(route, /background[\s\S]*cronAuthorized/);
  assert.match(route, /fetchStatus:\s*"fetching"/);
  assert.match(route, /fetchStatus:\s*"success"/);
  assert.match(route, /fetchStatus:\s*"error"/);
  assert.match(route, /addSummaryJob/);
});

test("Agent starts the clip fetch worker", () => {
  const index = read("apps/agent/src/index.ts");
  assert.match(index, /createClipWorker\(\)/);
});

test("shared clip URL input awaits persistence and prevents duplicate submission", () => {
  const listColumn = read("apps/web/src/components/shell/ListColumn.tsx");
  assert.match(listColumn, /onSubmitClipUrl\?:\s*\(url:\s*string\)\s*=>\s*Promise/);
  assert.match(listColumn, /clipSubmitting/);
  assert.match(listColumn, /await onSubmitClipUrl\?\.\(url\)/);
  assert.doesNotMatch(listColumn, /showToast\("已加入剪藏/,
    "the shared input must not claim success before the owner receives persistence result");
  assert.match(listColumn, /disabled=\{clipSubmitting\}/);
});

test("clip pages insert durable responses immediately and reopen existing clips", () => {
  const page = read("apps/web/src/app/(app)/clips/page.tsx");
  assert.match(page, /clip\.existing[\s\S]*之前已剪藏/);
  assert.match(page, /setClips[\s\S]*clip[\s\S]*setCachedWorkspaceList/);
  assert.match(page, /fetchStatus !== "queued"[\s\S]*fetchStatus !== "fetching"[\s\S]*setInterval/,
    "queued clips should refresh without requiring a tab switch");
});
