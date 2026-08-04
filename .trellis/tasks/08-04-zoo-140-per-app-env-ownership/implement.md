# ZOO-140 Per-app Environment Ownership Implementation

## Execution

1. Reuse the applicable hunks from historical commit `f33363b` against latest `origin/main`; do not import its parent commit or old task artifacts.
2. Re-inventory current Web, Agent and Workflow env consumers before finalizing tracked examples.
3. Update local-only Agent/Workflow scripts and DB tooling loaders; keep Production commands unchanged.
4. Add/update ownership spec, deployment docs and focused regression tests.
5. Materialize only app-local ignored env files for this worktree without printing values; use local Docker endpoints for acceptance.
6. Run focused tests, lint, TypeScript/build, secret/reference scans and `git diff --check`.
7. Start unused local ports and verify Web login, Agent health and a real Agent turn against local Docker.

## Validation

```bash
pnpm --filter @mewmo/agent test
pnpm --filter @mewmo/agent lint
pnpm --filter @mewmo/agent build
pnpm --filter @mewmo/ai-workflows test
pnpm --filter @mewmo/ai-workflows lint
pnpm --filter @mewmo/ai-workflows build
pnpm test:unit
git diff --check
python3 ./.trellis/scripts/task.py validate .trellis/tasks/08-04-zoo-140-per-app-env-ownership
```

No live Workflow run is required because this task changes loading only. A real Web-to-Agent turn is required because the reported failure crossed both runtimes and the database boundary.
