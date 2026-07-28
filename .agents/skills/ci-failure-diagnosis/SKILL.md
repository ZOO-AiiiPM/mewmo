---
name: ci-failure-diagnosis
description: Diagnose and fix GitHub Actions CI failures on mewmo PRs. Use when `gh pr checks` shows a red ✗ on `CI / ci (pull_request)` and the user asks "ci没成功啊" or similar. Covers the three common failure modes (lint / test:unit / build), how to read `gh run view --log-failed` to classify, and the local pre-push verification sequence that catches these issues before pushing.
agent_created: true
---

# CI failure diagnosis for mewmo PRs

When a mewmo PR's GitHub Actions CI goes red, the failure almost always falls into one of three buckets. Diagnose the bucket first, then fix.

## 1. Pull the failure context

```bash
cd .worktrees/<branch>
gh pr checks <N>                          # current state
gh run list --workflow=ci --branch=<branch> --limit=3
gh run view <run-id> --log-failed         # raw log of the failing step
gh run watch <run-id> --exit-status       # block until next attempt finishes
```

The CI command sequence is fixed (`.github/workflows/ci.yml`):
`pnpm install --frozen-lockfile` → `pnpm db:generate` → `pnpm lint` → `pnpm build` → `pnpm test:unit` → `pnpm test:theme`.

The failing step narrows the bucket.

## 2. The three buckets

### Bucket A — lint fails (`@typescript-eslint/no-unused-vars`)

Symptom in `--log-failed`:
```
'X' is defined but never used. Allowed unused vars must match /^_/u
```

Cause: a previous edit replaced the call site but the import statement was not deleted. The rule is strict — you **cannot** rename to `_X` to silence it.

Fix:
- Delete the unused import from the file (e.g. `import { X, Y } from "..."` → `import { Y } from "..."`).
- Keep the export if other files still use it (check via `grep -rn "X" apps/web/src/`).

Common mewmo offenders: `formatClipListTime`, `clipPreviewText`, `articleMetaItems`, `knowledgeMetaItems`.

### Bucket B — test:unit fails with stale contract assertions

Symptom in `--log-failed`:
```
# Subtest: <some test name>
not ok <N> - <some test name>
  error: 'The input did not match the regular expression /<some string>/'
```

This is the most common bucket when a ZOO-** issue reverses behavior from a prior commit (e.g. ZOO-60 restored the deleted "浏览器打开" anchor, deleted the "知识库根级" root option, replaced `formatClipListTime` with `articleMetaItems`). The test was updated **at the time of the regression** to lock in the broken state as the new contract, so reversing the regression now makes the test fail.

**Decision rule**: if the failing assertion is `assert.doesNotMatch(source, /X/)` or `assert.match(source, /Y/)` where the asserted string/function/option is **opposite** to your issue's intended direction → the test is stale. **Change the test, not the implementation.**

Common stale patterns in this repo:
- `tests/unit/workspace-prototype-ui.test.mjs` (`doesNotMatch` for `浏览器打开` in `ReaderToolbar`/`FeedArticleMenu`; `match` for `formatClipListTime` in list cards)
- `tests/unit/knowledge-move-ui-static.test.mjs` (`match` for `知识库根级` string in `MoveToKnowledgeProvider.tsx`)

When updating, also re-read the test's variable setup block — it calls `const X = read("path/to/file")` for each file the assertions reference. If you add a new assertion that needs a new file, add its `read()` too (forgetting this yields `ReferenceError: X is not defined`).

### Bucket C — build fails on stale Prisma client

Symptom in `--log-failed`:
```
Type error: Property 'aiRun' does not exist on type 'PrismaClient'
Type error: Property 'contentEmbedding' does not exist on type 'PrismaClient'
Type error: Property 'noteInsight' does not exist on type 'PrismaClient'
```

Cause: the generated client at `packages/db/generated/client` is older than `schema.prisma`. Either the local worktree never ran `db:generate` since pulling main, or a schema change happened in main that was never regenerated.

Fix:
```bash
NODE_OPTIONS="" pnpm db:generate
```

This regenerates only the client, it does not touch the database.

## 3. Local pre-push gate (catches all three before push)

Always run this trio before pushing, exactly matching CI order:

```bash
cd .worktrees/<branch>

# Bucket A
NODE_OPTIONS="" pnpm --filter @mewmo/web lint

# Bucket C (run BEFORE build so build sees fresh client types)
NODE_OPTIONS="" pnpm db:generate
NODE_OPTIONS="" pnpm --filter @mewmo/web build

# Bucket B (runs all 17 packages' unit suites)
NODE_OPTIONS="" pnpm test:unit
```

`NODE_OPTIONS=""` is mandatory — the WorkBuddy shim exports `--use-system-ca` which crashes Turbopack workers with `ERR_WORKER_INVALID_EXEC_ARGV`.

## 4. After fixing, push and re-watch

```bash
git -c http.version=HTTP/1.1 push origin <branch>   # HTTP/1.1 avoids the local HTTP2 framing flake
gh run watch $(gh run list --workflow=ci --branch=<branch> --limit=1 --json databaseId -q '.[0].databaseId') --exit-status
```

## 5. Closing the loop

After CI turns green, append a "CI 已修复" comment to the Linear issue with the run id and the three buckets you hit (so the next agent sees the diagnostic trail). Don't move the issue to `Done` until browser-side acceptance has been completed by the user (preview testing is the user's job — sandbox proxy blocks `*.vercel.app`).
