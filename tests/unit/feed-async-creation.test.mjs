import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("feed creation persists status and queues first fetch without synchronous article work", () => {
  const route = read("apps/web/src/app/api/feeds/[[...parts]]/route.ts");

  assert.match(route, /addFeedFetchJob/,
    "feed routes should enqueue through the shared queue contract");
  assert.doesNotMatch(route, /fetchAndStoreFeed/,
    "feed create and refresh requests must not synchronously fetch article content");
  assert.match(route, /lastFetchStatus:\s*"queued"/,
    "newly persisted feeds should expose queued status before returning");
  assert.match(route, /existing:\s*false,\s*queued/,
    "successful queue submission should be explicit in the response");
  assert.match(route, /existing:\s*(?:true|false)/,
    "callers should be able to distinguish existing feeds from new records");
});

test("feed refresh routes enqueue work instead of waiting for fetch results", () => {
  const route = read("apps/web/src/app/api/feeds/[[...parts]]/route.ts");

  assert.match(route, /parts\[0\] === "refresh"[\s\S]*enqueueFeedFetch/,
    "bulk refresh should enqueue each feed");
  assert.match(route, /parts\[1\] === "refresh"[\s\S]*enqueueFeedFetch/,
    "single-feed retry should enqueue the selected feed");
});


test("feed page polls only while the selected source is actively syncing", () => {
  const page = read("apps/web/src/app/(app)/feeds/page.tsx");

  assert.match(page, /isFeedSyncActive\(selectedFeed\?\.lastFetchStatus\)[\s\S]*setInterval/,
    "active first sync should poll feed and entry state");
  assert.match(page, /clearInterval/,
    "polling must stop when the source leaves an active state or the page unmounts");
});
