# Local Environment Ownership Contract

## 1. Scope / Trigger

This contract applies whenever a local runtime, maintenance command, test, or worktree adds or changes environment configuration. A monorepo root is not a runtime, so local configuration is owned by the app that consumes it.

| Runtime | Real local file | Tracked contract | Loader |
| --- | --- | --- | --- |
| Web | `apps/web/.env.local` | `apps/web/.env.local.example` | Next.js native loading |
| Agent | `apps/agent/.env.local` | `apps/agent/.env.local.example` | local-only package scripts |
| AI Workflow | `apps/ai-workflows/.env.local` | `apps/ai-workflows/.env.local.example` | local-only package scripts |

Shared local Docker or provider values are duplicated into the app files that need them. Shared values do not create a shared file owner.

## 2. Signatures

Local commands:

```text
pnpm --filter @mewmo/web dev
pnpm --filter @mewmo/agent dev
pnpm --filter @mewmo/agent start:local
pnpm --filter @mewmo/agent cron:automations:local
pnpm --filter @mewmo/ai-workflows cron:ai:local
```

Production commands accept deployment-injected env and never contain `--env-file`:

```text
pnpm --filter @mewmo/agent start
pnpm --filter @mewmo/agent cron:automations
pnpm --filter @mewmo/ai-workflows cron:ai
```

Database tooling accepts an explicitly injected `DATABASE_URL`; otherwise it may load `apps/web/.env.local` only.

## 3. Contracts

- Real app-local files are ignored by Git and Docker, use mode `0600`, and are never printed.
- Tracked examples contain only app-owned keys and empty credential values.
- Repository-root `.env.local` and `.env.workflow.local` are unsupported legacy files. Runtime and maintenance code must never read them.
- A worktree may link each app-local file to the same app's ignored source file. It must not create a root env link or link one app to another app's file.
- Tests inject fixtures or CI env and never auto-load developer files.
- Explicit process env wins over app-local files, preserving CI and Production injection.
- `apps/web/.env.local:AGENT_INTERNAL_SECRET` and `apps/agent/.env.local:AGENT_IDENTITY_SECRET` contain the same value, but neither runtime reads the other file.

## 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| App-local file missing for a local-only command | Exit before runtime initialization; never fall back to root env |
| Required runtime key missing or invalid | Fail with sanitized variable names only |
| Explicit `DATABASE_URL` exists | Use it; do not read any local file |
| Production Agent/Workflow command runs | Accept deployment env; never require `.env.local` |
| Root env reference enters runtime/tooling | Static ownership test fails |
| Example contains a credential value | Static ownership test fails |

## 5. Good / Base / Bad Cases

- Good: Web and Agent each store the same local Docker `DATABASE_URL` in their own ignored files.
- Good: a worktree links `apps/agent/.env.local` to the main workspace's `apps/agent/.env.local`.
- Base: optional Langfuse configuration is absent and tracing disables safely.
- Bad: a worktree root `.env.local` links to the main workspace root file.
- Bad: Agent `dev` inherits Web or root credentials because its app-local file is missing.
- Bad: Production `start` includes `--env-file=.env.local`.

## 6. Tests Required

- Assert exact local loader commands and that Production commands exclude `env-file`.
- Assert all real app-local paths are Git/Docker ignored.
- Scan runtime and tooling sources for repository-root env loading.
- Scan tracked examples for credential values and embedded database credentials.
- Validate blank optional Web fields normalize to `undefined`.
- Smoke Agent health and a real Web-to-Agent turn against a mechanically verified local Docker database.

## 7. Wrong vs Correct

Wrong: source a worktree root env before starting multiple runtimes.

```text
source .env.local
pnpm --filter @mewmo/agent dev
```

Correct: run the local command whose package owns and loads its env.

```text
pnpm --filter @mewmo/agent dev
```
