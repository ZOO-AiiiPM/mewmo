# Local Workflow Test Environment Design

## Architecture and Boundaries

The local Agent and local Workflow remain separate runtimes:

- Agent Preview runtime: `apps/agent`, existing process on `127.0.0.1:3101`, configured by `.env.local` and connected to Preview Neon.
- Workflow test runtime: `apps/ai-workflows`, invoked manually, configured only by `.env.workflow.local`.
- Workflow production runtime: remote `deploy/worker/.env.worker` plus Cron; no behavior or configuration changes.

`.env.workflow.local` is gitignored by the existing `.env*.local` rule. A tracked `.env.workflow.local.example` documents only variable names and safe defaults.

## Local Execution Contract

Add a dedicated local command which loads `.env.workflow.local`, runs a fail-closed preflight, then invokes the existing one-shot Workflow entrypoint.

Preflight requires:

- `WORKFLOW_RUNTIME_ENV=development`
- `NODE_ENV` is not `production`
- `LANGFUSE_ENVIRONMENT=development`
- `LANGFUSE_PROMPT_LABEL=development`
- `AI_WORKFLOW_BATCH_LIMIT=1` and `AI_WORKFLOW_CONCURRENCY=1` for the canary
- complete Langfuse public/secret keys and a local `LANGFUSE_USER_HASH_SECRET` of at least 32 characters
- `DATABASE_URL` SHA-256 equals the explicit approved Preview-database fingerprint

The preflight must never print URLs, credentials, or full fingerprints. Failure exits before database adapters or observability are initialized.

## Configuration Bootstrap

During implementation, after the exposed Preview credential has been rotated, create the ignored `.env.workflow.local` from the existing local Agent Preview configuration:

- copy the rotated Preview Neon URL
- copy only the Workflow-relevant AI provider/model credentials
- copy the existing Langfuse Cloud keys/base URL
- force both Langfuse environment and prompt label to `development`
- generate a separate random `LANGFUSE_USER_HASH_SECRET`
- record the approved Preview-database fingerprint used by preflight

After bootstrap, Workflow does not import or source `.env.local`; the two files can evolve independently.

## Runtime Data Flow

1. Developer runs the local Workflow canary command.
2. Node loads `.env.workflow.local`.
3. Preflight validates the environment and test database identity.
4. Existing `run-due.ts` claims at most one due `AiRun` from Preview Neon.
5. Existing adapters call the configured AI provider and write result plus `AiUsageEvent` to Preview Neon.
6. Existing observability emits a `development` trace to the current Langfuse Cloud project.
7. The process shuts down and exits; no scheduler remains running.

## Compatibility and Rollback

- The production `cron:ai` command remains unchanged.
- Local execution is additive and opt-in; no port, daemon, or Cron is added.
- Rollback removes the local command, preflight module/tests, example/docs, and the ignored local env file. Production requires no rollback action.

## Trade-offs

- A positive fingerprint allowlist is stricter than trusting an environment name and prevents accidental URL substitution.
- Batch size and concurrency of one make canaries slower but keep test blast radius small.
- Local prompt sync is intentionally excluded because runtime prompts are code-owned Markdown and sync would mutate shared Langfuse labels.
