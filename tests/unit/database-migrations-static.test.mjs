import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const baselinePath =
  "packages/db/prisma/migrations/20260723051500_init/migration.sql";
const reconciliationPath =
  "packages/db/prisma/migrations/20260725000000_reconcile_current_schema/migration.sql";
const read = (path) => readFileSync(path, "utf8");

test("production baseline stays byte-identical to its recorded checksum", () => {
  assert.equal(existsSync(baselinePath), true);
  const checksum = createHash("sha256")
    .update(read(baselinePath))
    .digest("hex");
  assert.equal(
    checksum,
    "cd5ac4c25fd6bdfffc5e7dd87d32bc67e03fe4a73b297637dc38ede4d093b51e",
  );
});

test("schema reconciliation is additive and records manual production changes", () => {
  assert.equal(existsSync(reconciliationPath), true);
  const sql = read(reconciliationPath);

  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|COLUMN|TYPE|INDEX|SCHEMA)\b/i);
  assert.doesNotMatch(sql, /\bRENAME\s+(TABLE|COLUMN)\b/i);
  assert.doesNotMatch(sql, /video_details|video_user_highlights/);
  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS "vector"/);
  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS "pg_trgm"/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP\(3\)/);
  assert.match(
    sql,
    /ADD COLUMN IF NOT EXISTS "embedding_vector" vector\(768\)/,
  );
  assert.match(sql, /content_embeddings_embedding_vector_hnsw/);
  assert.match(sql, /notes_title_trgm/);
  assert.match(sql, /clips_content_trgm/);
  assert.match(sql, /feed_entries_content_trgm/);
});

test("deployment exposes migration commands and forbids db push in production runbooks", () => {
  const rootPackage = JSON.parse(read("package.json"));
  const dbPackage = JSON.parse(read("packages/db/package.json"));
  const databaseReadme = read("deploy/database/README.md");
  const agentReadme = read("deploy/agent/README.md");

  assert.match(rootPackage.scripts["db:migrate:deploy"], /db:migrate:deploy/);
  assert.equal(dbPackage.scripts["db:migrate:deploy"], "prisma migrate deploy");
  assert.match(databaseReadme, /20260723051500_init/);
  assert.match(databaseReadme, /video_details/);
  assert.match(agentReadme, /db:migrate:deploy/);
  assert.doesNotMatch(agentReadme, /可执行 `pnpm db:push`/);
});
