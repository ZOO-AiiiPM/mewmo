# ZOO-63 Production Agent/Workflow Acceptance

## Goal

Complete the reproducible, observable, and rollback-capable Production release and acceptance flow for ZOO-63. Real Web Agent conversations, Langfuse tracing, fixed AI Workflows, Automation boundaries, Usage accounting, database migrations, and historical backfill must be proven from authoritative Production evidence.

## Confirmed Facts

- Production Agent is healthy on `127.0.0.1:3101` and runs merge commit `3cd852569a625e20ce9656a1b65007a1567f7772`.
- A direct Agent canary succeeds, but the real Vercel BFF request receives `502` before creating an `AiTurn`.
- Caddy resolves `mewmo-agent-agent-1` on the wrong Docker network and logs `no such host`.
- Vercel `AGENT_INTERNAL_SECRET` and Agent `AGENT_IDENTITY_SECRET` hashes differ.
- Production Worker still runs image `7399c034...`; its shared AI Runtime hash predates the Google relay `supportsStore: false` fix.
- Production Langfuse accepts Agent canary traces with environment/release and Usage/Cost metadata.
- Production migrations are already deployed; Preview/Production must never use `prisma db push`.

## Requirements

### Agent and Web BFF

- Make the Caddy-to-Agent network route persistent in deployment configuration while keeping port `3101` bound to host loopback.
- Make Vercel and Agent identity secrets identical without exposing secret values.
- Redeploy Production Web after environment changes.
- Verify a real Production BFF SSE request emits `turn.started`, text deltas, `turn.completed`, and `result`; its `AiTurn` must succeed with assistant entry and output.
- Verify context-bound clip/note conversation, retry with a fresh request id, idempotent duplicate request handling, and restart recovery without duplicate writes.

### Fixed Workflows and Automation

- Rebuild and deploy Worker from the accepted `main` commit.
- Verify Cron one-shot execution and empty-queue fast exit.
- Verify `summary`, `embedding`, `relation`, and `note_insight` enqueue/claim/complete chains with current-version result rows and `AiUsageEvent` entries.
- Keep fixed Workflow claims isolated from `agent_automation`; verify scheduler/executor claim boundaries and a controlled automation canary when an enabled automation exists.
- Verify retry/fail/revive behavior for provider failures and lease expiry.
- Run a dry-run inventory, one-item canary, then controlled historical backfill without deleting or overwriting user content.

### Observability and Operations

- Verify real Web Agent traces in Langfuse Production: root Agent, generation, tool when invoked, session, hashed user, release, Usage/Cost, and fail-open behavior.
- Verify Workflow/Automation observability honestly: if Production code does not instrument them, record and implement the missing tracing before acceptance.
- Confirm trace payloads omit user messages, model text, prompts, context, tool arguments/results, email, and secrets.
- Cross-check Langfuse Usage/Cost with `AiUsageEvent` for the same canary.
- Confirm migration history, repeat `migrate deploy` no-op, container health, restart counts, logs, disk headroom, and rollback images.

## Acceptance Criteria

- [ ] Production Web BFF Agent conversation succeeds end to end; no `502`, `401`, or generic Agent error.
- [ ] Agent SSE, persistence, idempotency, restart recovery, Tool/Skill and confirmation boundaries are verified.
- [ ] Production Langfuse contains the real Agent trace tree with correct environment, release, privacy, tokens, and cost.
- [ ] Production Worker runs the accepted commit and each fixed Workflow kind succeeds from enqueue through current-version persisted output.
- [ ] Historical backlog is inventoried and backfilled through dry-run, canary, and bounded batches; failures remain auditable.
- [ ] Workflow retry, lease, idempotency, and Automation claim isolation are verified.
- [ ] Product `AiUsageEvent` remains the auditable usage ledger and agrees with trace metadata for canaries.
- [ ] Migration and deployment checks pass without `db push` or destructive schema changes.
- [ ] CI is green, Production is healthy after release, rollback remains available, and Linear contains reproducible evidence.

## Out of Scope

- Redesigning Pi AgentHarness, Workflow orchestration, the Prisma domain model, or the product UX beyond blocking correctness fixes.
- Adding a new model provider, vector database, long-term memory, or automatic tagging.
- Deploying a Preview Agent or connecting Preview to Production data.
- Deleting user content or silently replacing user credentials.

## Constraints

- Secrets stay in protected environment files or deployment secret stores and never enter Git, logs, Linear, or screenshots.
- Large changes use an isolated branch and PR; merge only after CI and automated Production acceptance pass.
- Production schema changes use reviewed migrations and `prisma migrate deploy` only.
- Current and one prior Agent/Worker image remain available for rollback.
