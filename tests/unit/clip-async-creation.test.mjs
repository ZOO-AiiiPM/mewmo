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
