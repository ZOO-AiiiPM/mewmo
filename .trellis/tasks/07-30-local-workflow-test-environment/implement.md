# Local Workflow Test Environment Implementation

## Execution Checklist

1. Create `feature/local-workflow-test-environment` in a new worktree from the latest `origin/main`; preserve the dirty current worktree.
2. Load the `ai-workflows` and shared backend Trellis specs through `trellis-before-dev`.
3. Add a pure, unit-tested local preflight module that validates environment markers, Langfuse completeness, canary limits, and the approved database fingerprint without exposing secrets.
4. Add a dedicated local command/script that loads `.env.workflow.local`, runs preflight, and only then invokes the existing one-shot Workflow command.
5. Add a tracked `.env.workflow.local.example` with no credentials and update Workflow/worker documentation with bootstrap, run, expected output, and safety behavior.
6. After the exposed Preview database password is rotated, create the ignored `.env.workflow.local` using the updated Preview Neon URL, relevant AI/Langfuse development values, a newly generated Workflow-only user hash secret, and canary limits of one.
7. Run static and unit verification before any live canary.
8. Insert or identify one controlled due `AiRun` in Preview Neon, record the Preview/Production baseline needed for comparison, then execute one local canary.
9. Verify the Preview `AiRun` result, `AiUsageEvent`, and Langfuse `development` trace; confirm Production Neon and production Langfuse labels were untouched and no scheduler remains running.
10. Run `trellis-check`, review the diff for secrets, and report results without committing or merging until the user tests and approves.

## Validation

```bash
pnpm --filter @mewmo/ai-workflows test
pnpm --filter @mewmo/ai-workflows lint
pnpm --filter @mewmo/ai-workflows build
pnpm --filter @mewmo/ai-workflows cron:ai:local
git diff --check
git grep -nE 'postgres(ql)?://|LANGFUSE_SECRET_KEY=.+' -- ':!*.example'
```

The live command must first be exercised with a deliberately wrong fingerprint and with `LANGFUSE_ENVIRONMENT=production`; both runs must exit before claiming an `AiRun`.

## Risk and Rollback Points

- Do not run the live canary until the fingerprint guard tests pass.
- Do not execute `sync:prompts` from the local Workflow environment.
- Never print or commit `.env.workflow.local` contents.
- Stop before creating Preview rows if the configured database no longer matches the approved Preview fingerprint.
- Production Compose, `.env.worker`, server Cron, and Agent `.env.local` are outside the edit scope.
