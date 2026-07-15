import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("web runtime leaves recurring feed work to the one-shot server Cron", () => {
  const instrumentation = read("apps/web/src/instrumentation.ts");

  assert.doesNotMatch(instrumentation, /startWebFeedRefreshScheduler|setInterval/);
  assert.equal(existsSync("apps/web/src/lib/feed-refresh-runtime.ts"), false);
  assert.equal(existsSync("apps/web/src/lib/feed-refresh-service.ts"), false);
});
