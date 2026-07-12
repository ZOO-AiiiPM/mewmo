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
