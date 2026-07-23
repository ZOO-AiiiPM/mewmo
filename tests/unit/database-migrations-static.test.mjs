import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migration = "packages/db/prisma/migrations/20260722010000_ai_agent_runtime/migration.sql";
const baseline = "packages/db/prisma/migrations/20260722000000_baseline/migration.sql";
const read = (path) => readFileSync(path, "utf8");

test("AI Runtime migration is additive and preserves legacy tables", () => {
  assert.equal(existsSync(baseline), true);
  assert.equal(existsSync(migration), true);
  const sql = read(migration);
  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|COLUMN|TYPE|INDEX|SCHEMA)\b/i);
  assert.doesNotMatch(sql, /\bRENAME\s+(TABLE|COLUMN)\b/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ai_chats"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ai_messages"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ai_context_attachments"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ai_actions"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ai_runs"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ai_session_entries"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ai_turns"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ai_usage_events"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ai_skills"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "ai_automations"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "content_embeddings"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "content_relations"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "note_insights"/);
  assert.doesNotMatch(sql, /video_details|video_user_highlights/);
});

test("deployment exposes all independent Cron entry points", () => {
  const workerCompose = read("deploy/worker/compose.yml");
  const agentCompose = read("deploy/agent/compose.yml");
  const workerReadme = read("deploy/worker/README.md");
  const agentReadme = read("deploy/agent/README.md");
  assert.match(workerCompose, /agent-automation-scheduler:[\s\S]*cron:agent-automations/);
  assert.match(agentCompose, /agent-automation-executor:[\s\S]*cron:automations/);
  assert.match(workerReadme, /agent-automation-scheduler/);
  assert.match(agentReadme, /agent-automation-executor/);
});
