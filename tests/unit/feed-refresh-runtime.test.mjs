import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("web runtime exposes an opt-in feed refresh scheduler fallback", () => {
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
    /if\s*\(\s*schedulerMode\s*!==\s*["']on["']\s*\)\s*return/,
    "the worker is authoritative, so the web fallback must require explicit opt-in",
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
