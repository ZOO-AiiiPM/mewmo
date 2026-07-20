import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("feed creation awaits a bounded initial RSS fetch without BullMQ", () => {
  const route = read("apps/web/src/app/api/feeds/[[...parts]]/route.ts");

  assert.match(
    route,
    /await fetchInitialFeed\(userId,\s*feedRecord,\s*\{[\s\S]*?limit:\s*parsed\.data\.initialEntryLimit,[\s\S]*?\}\)/,
    "the validated per-add limit should control only the synchronous initial RSS import",
  );
  assert.doesNotMatch(route, /addFeedFetchJob|enqueueFeedFetch|after\(/);
  assert.match(route, /initialFetch/);
  assert.match(route, /existing:\s*false/);
  assert.match(route, /existing:\s*(?:true|false)/, "callers should be able to distinguish existing feeds from new records");
});

test("add-feed UI offers 5, 10, 20, and 50 initial entries with ten as the reset default", () => {
  const page = read("apps/web/src/app/(app)/feeds/page.tsx");

  assert.match(page, /const INITIAL_FEED_LIMITS = \[5,\s*10,\s*20,\s*50\] as const/);
  assert.match(page, /useState<InitialFeedLimit>\(DEFAULT_INITIAL_FEED_LIMIT\)/);
  assert.match(page, /setInitialEntryLimit\(DEFAULT_INITIAL_FEED_LIMIT\)/);
  assert.match(page, /initialEntryLimit,/);
  assert.match(page, /首次导入/);
  assert.match(page, /\{initialEntryLimit\} 篇/);
});

test("feed refresh routes mark database work for the next Cron run", () => {
  const route = read("apps/web/src/app/api/feeds/[[...parts]]/route.ts");

  assert.match(route, /parts\[0\] === "refresh"[\s\S]*requestFeedRefresh/, "bulk refresh should mark each feed queued");
  assert.match(route, /parts\[1\] === "refresh"[\s\S]*requestFeedRefresh/, "single-feed retry should mark the selected feed queued");
  assert.doesNotMatch(route, /enqueueFeedFetch|addFeedFetchJob/);
});

test("feed page does not poll Cron work in the browser", () => {
  const page = read("apps/web/src/app/(app)/feeds/page.tsx");

  assert.doesNotMatch(page, /setInterval|waitForFirstFeedEntry/);
});

test("single-source add trusts the synchronous API result and closes without polling", () => {
  const page = read("apps/web/src/app/(app)/feeds/page.tsx");
  const status = read("apps/web/src/lib/feed-status.ts");

  assert.doesNotMatch(page, /waitForFirstFeedEntry|FEED_ENTRY_REQUEST_TIMEOUT_MS/);
  assert.match(page, /initialFetch/);
  assert.match(status, /首次读取失败[\s\S]*稍后重试/);
  assert.match(page, /onAdded\(\[feed\],\s*true\)/);
});
