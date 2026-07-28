# Bootstrap Task: Fill Project Development Guidelines

**You (the AI) are running this task. The developer does not read this file.**

The developer just ran `trellis init` on this project for the first time.
`.trellis/` now exists with empty spec scaffolding, and this bootstrap task
exists under `.trellis/tasks/`. When they want to work on it, they should start
this task from a session that provides Trellis session identity.

**Your job**: help them populate `.trellis/spec/` with the team's real
coding conventions. Every future AI session — this project's
`trellis-implement` and `trellis-check` sub-agents — auto-loads spec files
listed in per-task jsonl manifests. Empty spec = sub-agents write generic
code. Real spec = sub-agents match the team's actual patterns.

Don't dump instructions. Open with a short greeting, figure out if the repo
has any existing convention docs (CLAUDE.md, .cursorrules, etc.), and drive
the rest conversationally.

---

## Status (update the checkboxes as you complete each item)

- [ ] Fill guidelines for @mewmo/admin
- [ ] Fill guidelines for @mewmo/agent
- [ ] Fill guidelines for @mewmo/ai-workflows
- [ ] Fill guidelines for @mewmo/extension
- [ ] Fill guidelines for @mewmo/feed-ingestion
- [ ] Fill guidelines for @mewmo/web
- [ ] Fill guidelines for worker
- [ ] Fill guidelines for @mewmo/ai
- [ ] Fill guidelines for @mewmo/application
- [ ] Fill guidelines for @mewmo/auth
- [ ] Fill guidelines for @mewmo/content
- [ ] Fill guidelines for @mewmo/db
- [ ] Fill guidelines for @mewmo/email
- [ ] Fill guidelines for @mewmo/queue
- [ ] Fill guidelines for @mewmo/shared
- [ ] Fill guidelines for @mewmo/storage
- [ ] Fill guidelines for @mewmo/sync
- [ ] Fill guidelines for @mewmo/ui
- [ ] Add code examples

---

## Spec files to populate

### Package: @mewmo/admin (`spec/admin/`)

- Backend guidelines: `.trellis/spec/admin/backend/`

- Frontend guidelines: `.trellis/spec/admin/frontend/`

### Package: @mewmo/agent (`spec/agent/`)

- Backend guidelines: `.trellis/spec/agent/backend/`

- Frontend guidelines: `.trellis/spec/agent/frontend/`

### Package: @mewmo/ai-workflows (`spec/ai-workflows/`)

- Backend guidelines: `.trellis/spec/ai-workflows/backend/`

- Frontend guidelines: `.trellis/spec/ai-workflows/frontend/`

### Package: @mewmo/extension (`spec/extension/`)

- Backend guidelines: `.trellis/spec/extension/backend/`

- Frontend guidelines: `.trellis/spec/extension/frontend/`

### Package: @mewmo/feed-ingestion (`spec/feed-ingestion/`)

- Backend guidelines: `.trellis/spec/feed-ingestion/backend/`

- Frontend guidelines: `.trellis/spec/feed-ingestion/frontend/`

### Package: @mewmo/web (`spec/web/`)

- Backend guidelines: `.trellis/spec/web/backend/`

- Frontend guidelines: `.trellis/spec/web/frontend/`

### Package: worker (`spec/worker/`)

- Backend guidelines: `.trellis/spec/worker/backend/`

- Frontend guidelines: `.trellis/spec/worker/frontend/`

### Package: @mewmo/ai (`spec/ai/`)

- Backend guidelines: `.trellis/spec/ai/backend/`

- Frontend guidelines: `.trellis/spec/ai/frontend/`

### Package: @mewmo/application (`spec/application/`)

- Backend guidelines: `.trellis/spec/application/backend/`

- Frontend guidelines: `.trellis/spec/application/frontend/`

### Package: @mewmo/auth (`spec/auth/`)

- Backend guidelines: `.trellis/spec/auth/backend/`

- Frontend guidelines: `.trellis/spec/auth/frontend/`

### Package: @mewmo/content (`spec/content/`)

- Backend guidelines: `.trellis/spec/content/backend/`

- Frontend guidelines: `.trellis/spec/content/frontend/`

### Package: @mewmo/db (`spec/db/`)

- Backend guidelines: `.trellis/spec/db/backend/`

- Frontend guidelines: `.trellis/spec/db/frontend/`

### Package: @mewmo/email (`spec/email/`)

- Backend guidelines: `.trellis/spec/email/backend/`

- Frontend guidelines: `.trellis/spec/email/frontend/`

### Package: @mewmo/queue (`spec/queue/`)

- Backend guidelines: `.trellis/spec/queue/backend/`

- Frontend guidelines: `.trellis/spec/queue/frontend/`

### Package: @mewmo/shared (`spec/shared/`)

- Backend guidelines: `.trellis/spec/shared/backend/`

- Frontend guidelines: `.trellis/spec/shared/frontend/`

### Package: @mewmo/storage (`spec/storage/`)

- Backend guidelines: `.trellis/spec/storage/backend/`

- Frontend guidelines: `.trellis/spec/storage/frontend/`

### Package: @mewmo/sync (`spec/sync/`)

- Backend guidelines: `.trellis/spec/sync/backend/`

- Frontend guidelines: `.trellis/spec/sync/frontend/`

### Package: @mewmo/ui (`spec/ui/`)

- Backend guidelines: `.trellis/spec/ui/backend/`

- Frontend guidelines: `.trellis/spec/ui/frontend/`


### Thinking guides (already populated)

`.trellis/spec/guides/` contains general thinking guides pre-filled with
best practices. Customize only if something clearly doesn't fit this project.

---

## How to fill the spec

### Step 1: Import from existing convention files first (preferred)

Search the repo for existing convention docs. If any exist, read them and
extract the relevant rules into the matching `.trellis/spec/` files —
usually much faster than documenting from scratch.

| File / Directory | Tool |
|------|------|
| `CLAUDE.md` / `CLAUDE.local.md` | Claude Code |
| `AGENTS.md` | Codex / Claude Code / agent-compatible tools |
| `.cursorrules` | Cursor |
| `.cursor/rules/*.mdc` | Cursor (rules directory) |
| `.windsurfrules` | Windsurf |
| `.clinerules` | Cline |
| `.roomodes` | Roo Code |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.vscode/settings.json` → `github.copilot.chat.codeGeneration.instructions` | VS Code Copilot |
| `CONVENTIONS.md` / `.aider.conf.yml` | aider |
| `CONTRIBUTING.md` | General project conventions |
| `.editorconfig` | Editor formatting rules |

### Step 2: Analyze the codebase for anything not covered by existing docs

Scan real code to discover patterns. Before writing each spec file:
- Find 2-3 real examples of each pattern in the codebase.
- Reference real file paths (not hypothetical ones).
- Document anti-patterns the team clearly avoids.

### Step 3: Document reality, not ideals

**Critical**: write what the code *actually does*, not what it should do.
Sub-agents match the spec, so aspirational patterns that don't exist in the
codebase will cause sub-agents to write code that looks out of place.

If the team has known tech debt, document the current state — improvement
is a separate conversation, not a bootstrap concern.

---

## Quick explainer of the runtime (share when they ask "why do we need spec at all")

- Every AI coding task spawns two sub-agents: `trellis-implement` (writes
  code) and `trellis-check` (verifies quality).
- Each task has `implement.jsonl` / `check.jsonl` manifests listing which
  spec files to load.
- The platform hook auto-injects those spec files + the task's `prd.md`
  into every sub-agent prompt, so the sub-agent codes/reviews per team
  conventions without anyone pasting them manually.
- Source of truth: `.trellis/spec/`. That's why filling it well now pays
  off forever.

---

## Completion

When the developer confirms the checklist items above are done with real
examples (not placeholders), guide them to run:

```bash
python3 ./.trellis/scripts/task.py finish
python3 ./.trellis/scripts/task.py archive 00-bootstrap-guidelines
```

After archive, every new developer who joins this project will get a
`00-join-<slug>` onboarding task instead of this bootstrap task.

---

## Suggested opening line

"Welcome to Trellis! Your init just set me up to help you fill the project
spec — a one-time setup so every future AI session follows the team's
conventions instead of writing generic code. Before we start, do you have
any existing convention docs (CLAUDE.md, .cursorrules, CONTRIBUTING.md,
etc.) I can pull from, or should I scan the codebase from scratch?"
