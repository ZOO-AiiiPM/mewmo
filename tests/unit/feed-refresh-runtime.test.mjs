import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("web runtime starts the feed refresh scheduler when only the Next server is running", () => {
  const instrumentation = read("apps/web/src/instrumentation.ts");
  const runtime = read("apps/web/src/lib/feed-refresh-runtime.ts");

  assert.match(
    instrumentation,
    /startWebFeedRefreshScheduler/,
    "Next instrumentation should start the feed refresh scheduler in the web process",
  );
  assert.match(
    runtime,
    /globalThis[\s\S]*mewmoFeedRefreshScheduler/,
    "web scheduler should use a global guard so dev reloads do not create duplicate intervals",
  );
  assert.match(
    runtime,
    /FEED_REFRESH_SCHEDULER[\s\S]*off/,
    "scheduler should keep an environment escape hatch for deployments that run a separate agent",
  );
  assert.match(
    runtime,
    /refreshDueFeeds/,
    "web scheduler should call the refresh service directly instead of making a localhost HTTP request",
  );
  assert.doesNotMatch(
    runtime,
    /\/api\/feeds\/cron-refresh|feedRefreshEndpoint/,
    "web scheduler must not call localhost because proxy env vars can route it through an external proxy",
  );
});
