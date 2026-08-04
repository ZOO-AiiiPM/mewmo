# ZOO-140 Per-app Environment Ownership Design

## Ownership Boundary

| Runtime | Local file | Local loader | Production loader |
| --- | --- | --- | --- |
| Web | `apps/web/.env.local` | Next.js native loading | Vercel injection |
| Agent | `apps/agent/.env.local` | local-only package scripts | deploy env injection |
| AI Workflow | `apps/ai-workflows/.env.local` | local-only package scripts | deploy env injection |

Values may be duplicated across files when runtimes share a local Docker database or provider. No runtime reads another app's file and no runtime/tooling reads a repository-root env.

## Database Tooling

Explicit `process.env.DATABASE_URL` has highest priority for CI, integration tests and one-off commands. Without it, local Prisma and database maintenance commands load only `apps/web/.env.local`, because Web owns the interactive local database boundary.

## Compatibility And Failure Behavior

- Keep Production command names and injection behavior unchanged.
- Missing app-local files or required variables fail before runtime initialization.
- Tests inject fixtures or controlled env and never consume developer files.
- Existing real env files remain ignored and untouched; only tracked examples, loaders, documentation, tests and specs change.

## Rollback

Revert the tracked loader/script changes and run local commands with explicitly injected env. Production requires no rollback because its injection path is unchanged.
