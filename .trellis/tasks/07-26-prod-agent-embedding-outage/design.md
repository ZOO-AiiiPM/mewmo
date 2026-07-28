# Design

## Boundaries

- `apps/web`: authenticated BFF and stable SSE proxy only.
- `apps/agent`: real-time Agent runtime, session persistence, tool/confirmation flow, and Agent Langfuse instrumentation.
- `apps/ai-workflows`: fixed Workflow and Automation one-shot executors.
- `packages/ai`: shared provider/runtime compatibility, including Google relay request shape.
- `packages/application`: run/turn ownership, leases, retries, idempotency, version checks, and Usage events.
- `packages/db`: migration history and persisted state/results.

## Production Data Flows

### Agent

`Browser -> Vercel Web BFF -> HTTPS Caddy -> Agent container -> PostgreSQL / AI relay -> SSE -> Browser`

- Caddy and Agent share an explicit external Docker network; the host port remains loopback-only.
- The BFF signs a short-lived HS256 token with the same secret verified by Agent.
- Acceptance uses a temporary isolated user through the real Production BFF, captures only structural evidence, then removes the canary user and cascaded test data.

### Fixed Workflow

`Content mutation/backfill -> AiRun queued -> minute Cron -> claim lease -> AI runtime -> result + AiUsageEvent -> follow-up AiRun`

- Worker image is tagged by the full accepted Git SHA.
- Backfill is inventory-first and bounded. It re-enqueues missing/current-version work without mutating source content.
- Failed same-version runs are explicitly revived only through the application service contract.

### Observability

`Agent/Workflow operation -> Langfuse observation tree` runs in parallel with `AiUsageEvent` persistence.

- Langfuse is fail-open and never becomes the product ledger.
- Release equals the deployed full Git SHA; environment is `production`.
- Payload masking is verified from retrieved observation fields, not inferred from code alone.

## Compatibility and Rollback

- Preserve current database schema and migration history.
- Preserve the current and immediately previous Agent/Worker images.
- A failed Web deployment rolls back through Vercel; a failed server deployment retags the previous image and recreates the service.
- External Docker network wiring is declared in the Agent compose file so container recreation does not reintroduce the 502.

## Risks

- Vercel environment changes require a Production redeploy before functions receive them.
- Historical backfill can create model cost and load; batches must be bounded and observed between stages.
- Workflow Langfuse coverage may require implementation because existing Production Cron code is not assumed instrumented.
- Automation canary must not execute a destructive or user-visible action without a pre-existing safe automation contract.
