import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("workspace section switches avoid loading every note body in the server payload", () => {
  for (const file of [
    "apps/web/src/app/(app)/notes/page.tsx",
    "apps/web/src/app/(app)/notes/[slug]/page.tsx",
  ]) {
    const source = read(file);
    const listSelect = source.match(/const noteListSelect = \{[\s\S]*?\n\}/)?.[0] ?? "";

    assert.ok(listSelect, `${file} should define noteListSelect`);
    assert.doesNotMatch(listSelect, /content:\s*true/, `${file} note list should not select full content`);
  }
});

test("clip list API returns preview metadata without every clip body", () => {
  const route = read("apps/web/src/app/api/clips/route.ts");
  const listSelect = route.match(/const clipListSelect = \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.ok(listSelect, "clips route should define default clipListSelect");
  assert.doesNotMatch(listSelect, /content:\s*true/, "default clip list should not select full content");
  assert.match(route, /includeContent/, "body content should require an explicit query opt-in");
});
