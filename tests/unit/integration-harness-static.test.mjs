import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("API integration tests own services, fixtures, identity, and cleanup", () => {
  const harness = read("tooling/run-api-integration-tests.mjs");
  const env = read("tests/integration/api-test-env.mjs");
  const clipTest = read("tests/integration/clips-api.test.mjs");

  assert.match(harness, /docker\/docker-compose\.yml/);
  assert.match(harness, /pnpm db:push/);
  assert.match(harness, /pnpm --filter @mewmo\/web dev/);
  assert.match(harness, /waitForHttp/);
  assert.match(harness, /cleanupTestUser/);
  assert.match(harness, /finally/);
  assert.match(env, /API_TEST_EMAIL/);
  assert.match(env, /API_TEST_ARTICLE_URL/);
  assert.doesNotMatch(clipTest, /zoo@mewmo\.app|example\.com/);
});
