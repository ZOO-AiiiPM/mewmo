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


test("clip creation fetches content before persistence without a Clip queue", () => {
  const route = read("apps/web/src/app/api/clips/route.ts");
  assert.match(route, /normalizeClipUrlIdentity/);
  assert.match(route, /await fetchClipFromUrl\(parsed\.data\.url\)/);
  assert.ok(route.indexOf("await fetchClipFromUrl") < route.indexOf("prisma.clip.create"));
  assert.doesNotMatch(route, /addClipFetchJob|withQueueTimeout/);
  assert.match(route, /normalizedUrl/);
  assert.match(route, /summary:\s*null/);
  assert.match(route, /fetchStatus:\s*"success"/);
  assert.match(route, /addSummaryJob/);
  assert.match(route, /existing:\s*false/);
  assert.match(route, /P2002[\s\S]*existing:\s*true/,
    "database uniqueness races should return the existing Clip");
});


test("clip refresh is synchronous, authenticated, and preserves the AI summary", () => {
  const route = read("apps/web/src/app/api/clips/[id]/route.ts");
  assert.doesNotMatch(route, /background|cronAuthorized|addClipFetchJob/);
  assert.match(route, /fetchStatus:\s*"fetching"/);
  assert.match(route, /fetchStatus:\s*"success"/);
  assert.match(route, /fetchStatus:\s*"error"/);
  assert.match(route, /addSummaryJob/);
  assert.doesNotMatch(route, /summary:\s*fetched\.summary/, "source refresh must preserve the existing AI summary");
});

test("Worker does not start a clip fetch worker", () => {
  const runtime = read("apps/worker/src/runtime.ts");
  assert.doesNotMatch(runtime, /createClipWorker/);
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

test("clip pages use synchronous responses without polling", () => {
  const page = read("apps/web/src/app/(app)/clips/page.tsx");
  assert.match(page, /clip\.existing[\s\S]*之前已剪藏/);
  assert.match(page, /setClips[\s\S]*clip[\s\S]*setCachedWorkspaceList/);
  assert.doesNotMatch(page, /setInterval|clip\.queued/);
});

test("every clip URL write path maintains normalized identity", () => {
  const detailRoute = read("apps/web/src/app/api/clips/[id]/route.ts");
  const syncPush = read("apps/web/src/app/api/sync/push/route.ts");
  assert.match(detailRoute, /parsed\.data\.url[\s\S]*normalizedUrl:\s*normalizeClipUrlIdentity\(parsed\.data\.url\)/,
    "PATCH should update URL and normalized identity together");
  assert.match(syncPush, /normalizeClipUrlIdentity/);
  assert.match(syncPush, /normalizedUrl[\s\S]*prisma\.clip\.create/,
    "sync-created clips should use the same per-user identity");
  assert.match(syncPush, /clipData\.url[\s\S]*normalizedUrl:\s*normalizeClipUrlIdentity\(clipData\.url\)/,
    "sync URL updates should maintain normalized identity");
});
