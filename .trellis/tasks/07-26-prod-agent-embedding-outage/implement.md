# Implementation Plan

## 1. Establish and Repair Agent Path

- [ ] Persist the Agent container attachment to Caddy's external Docker network and update deployment docs/tests.
- [ ] Deploy the compose change and verify public `/health`.
- [ ] Synchronize the Production BFF secret from the protected Agent environment and redeploy Vercel.
- [ ] Run an isolated real BFF SSE canary and verify `AiTurn`, session entries, Usage, idempotency, and cleanup.
- [ ] Verify contextual read/tool behavior and restart recovery.

## 2. Upgrade and Verify Worker

- [ ] Build `linux/amd64` Worker from the accepted full SHA, upload, tag, and recreate scheduled jobs.
- [ ] Verify Worker source hash, env fingerprint, Cron cadence, and empty-run exit.
- [ ] Inventory `AiRun`/result coverage by kind and current version.
- [ ] Run isolated canaries for summary, embedding, relation, and note insight.
- [ ] Verify retries, terminal failures, lease expiry, stale-version supersession, idempotency, and fixed/automation claim isolation.
- [ ] Execute dry-run, single-item canary, and bounded historical backfill with post-batch error checks.

## 3. Complete Observability

- [ ] Query real Production Agent traces and verify trace tree, release, environment, session/user hashing, Usage/Cost, and privacy fields.
- [ ] Add or correct Workflow/Automation tracing if Production runs are not observable.
- [ ] Cross-check Langfuse and `AiUsageEvent` for canaries and verify fail-open behavior.

## 4. Quality and Release Gates

- [ ] Run scoped lint, type checks, and tests during development.
- [ ] Run full repository CI-equivalent checks and secret scanning.
- [ ] Verify migration status, empty replay evidence, Production no-op deploy, and preservation of unrelated tables.
- [ ] Open PR, wait for all checks, merge, rebuild affected images from merge SHA, and perform final Production regression.
- [ ] Update ZOO-63 and related issues with exact evidence, risks, and rollback instructions.

## Rollback Points

- Before editing server compose/env, save permission-preserving backups.
- Before Agent/Worker retagging, retain the currently running tag and image id.
- Before historical backfill, record counts by kind/status/version; do not delete source or result rows.
- On any canary regression, stop batch work and restore the previous image/deployment before further diagnosis.
