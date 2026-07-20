import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const webPackage = JSON.parse(await readFile(new URL("../../apps/web/package.json", import.meta.url), "utf8"));
const ensureScript = await readFile(
  new URL("../../packages/db/scripts/ensure-development-schema.ts", import.meta.url),
  "utf8",
);

test("web development startup applies only the additive feed schema guard", () => {
  assert.equal(webPackage.scripts.predev, "pnpm --filter @mewmo/db db:ensure-development");
  assert.match(ensureScript, /ADD COLUMN IF NOT EXISTS "last_seen_entry_url" TEXT/);
  assert.doesNotMatch(ensureScript, /accept-data-loss|DROP TABLE|DROP COLUMN/i);
});
