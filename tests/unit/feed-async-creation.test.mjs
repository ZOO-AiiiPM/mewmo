import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("feed creation persists status and queues first fetch without synchronous article work", () => {
  const route = read("apps/web/src/app/api/feeds/[[...parts]]/route.ts");
  const client = read("packages/queue/src/client.ts");

  assert.match(route, /addFeedFetchJob/, "feed routes should enqueue through the shared queue contract");
  const afterStart = route.indexOf("after(async () =>");
  const fetchStart = route.indexOf("await fetchAndStoreFeed");
  assert.ok(afterStart >= 0 && fetchStart > afterStart, "article collection must run inside the response-after callback, not the request path");
  assert.match(route, /lastFetchStatus:\s*"queued"/, "newly persisted feeds should expose queued status before returning");
  assert.match(route, /existing:\s*false,\s*queued/, "successful queue submission should be explicit in the response");
  assert.match(route, /existing:\s*(?:true|false)/, "callers should be able to distinguish existing feeds from new records");
  assert.match(route, /Promise\.race\([\s\S]*addFeedFetchJob[\s\S]*setTimeout/, "queue submission must have a request-level timeout after persistence");
  assert.match(route, /after\([\s\S]*fetchAndStoreFeed/, "feed creation should start a response-after Web fallback while the Agent has no deployment");
  assert.match(client, /maxRetriesPerRequest:\s*\d+/, "HTTP producers must not keep retrying Redis forever when the queue is unavailable");
});

test("feed refresh routes enqueue work instead of waiting for fetch results", () => {
  const route = read("apps/web/src/app/api/feeds/[[...parts]]/route.ts");

  assert.match(route, /parts\[0\] === "refresh"[\s\S]*enqueueFeedFetch/, "bulk refresh should enqueue each feed");
  assert.match(route, /parts\[1\] === "refresh"[\s\S]*enqueueFeedFetch/, "single-feed retry should enqueue the selected feed");
});

test("feed page polls only while the selected source is actively syncing", () => {
  const page = read("apps/web/src/app/(app)/feeds/page.tsx");

  assert.match(page, /isFeedSyncActive\(selectedFeed\?\.lastFetchStatus\)[\s\S]*setInterval/, "active first sync should poll feed and entry state");
  assert.match(page, /clearInterval/, "polling must stop when the source leaves an active state or the page unmounts");
});

test("single-source add waits for the first article before closing and times out recoverably", () => {
  const page = read("apps/web/src/app/(app)/feeds/page.tsx");

  assert.match(page, /waitForFirstFeedEntry/, "single-source creation should wait for the first persisted article");
  assert.match(page, /waitForFirstFeedEntry\([\s\S]*15_?000/, "first-article waiting must be bounded");
  assert.match(page, /onAdded\(\[feed\],\s*false\)/, "a persisted feed should be surfaced before the modal closes");
  assert.match(
    page,
    /waitForFirstFeedEntry[\s\S]*try\s*\{[\s\S]*catch/,
    "polling transport failures must settle through the bounded timeout instead of escaping",
  );
  assert.match(page, /首篇文章[\s\S]*重试|同步超时[\s\S]*重试/, "first-article timeout must leave a recoverable retry message");
});
