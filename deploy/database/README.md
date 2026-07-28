# Database migration deployment

`packages/db/prisma/migrations/` is the canonical database schema history. Preview
and Production use `prisma migrate deploy`; `prisma db push` is limited to disposable
local prototypes.

## Current history

- `20260723051500_init` is the immutable production baseline. Its checksum is
  `cd5ac4c25fd6bdfffc5e7dd87d32bc67e03fe4a73b297637dc38ede4d093b51e`.
- `20260725000000_reconcile_current_schema` records the additive changes that were
  previously applied outside Prisma Migrate: note-share expiry, pgvector, its shadow
  column, and the production retrieval indexes.
- `20260725070000_fix_default_agent_sessions` assigns the newest active legacy
  `mewmo` chat as each user's sidebar default and enforces one default chat per user.
  Other chats remain unkeyed, so user-created conversations are unaffected.

The historical `video_details` and `video_user_highlights` tables are intentionally
outside the Prisma schema. Migration deployment must preserve them.

## Empty database

The PostgreSQL installation must provide the `vector` extension. With the target
`DATABASE_URL` injected by the deployment environment, run:

```bash
pnpm db:migrate:deploy
pnpm db:migrate:status
```

Run `pnpm db:migrate:deploy` a second time during release verification. It must report
that no pending migrations remain.

## Existing database adoption

Before touching an existing Neon branch, create a restore point or a child branch and
record the exact target host/database. Then inspect `_prisma_migrations` and compare the
live schema with `packages/db/prisma/schema.prisma` using a read-only diff.

Production already contains `20260723051500_init` with the checksum above. Do not run
`migrate resolve` there again. Apply only pending migrations with:

```bash
pnpm db:migrate:deploy
pnpm db:migrate:status
```

For an older database that has the complete baseline schema but no migration record,
verify every baseline object and checksum first, then register the baseline without
executing its SQL:

```bash
pnpm --filter @mewmo/db exec prisma migrate resolve --applied 20260723051500_init
pnpm db:migrate:deploy
```

Never baseline a partially matching database. Add a reviewed forward migration instead.
Do not use `migrate reset`, `db push`, or a generated destructive diff against Preview or
Production. Recovery uses the Neon restore point/branch; later schema corrections use a
new forward migration.

`ai-agent-foundation.sql` is retained only as historical deployment evidence. It is not
part of the current release path and must not be run after Prisma migration adoption.
