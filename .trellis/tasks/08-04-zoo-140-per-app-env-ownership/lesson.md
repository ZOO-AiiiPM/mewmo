# Lessons: ZOO-140 Per-app environment ownership

This file captures raw observations from this task. Keep evidence and uncertainty visible; a later curation pass promotes durable guidance into `.trellis/spec/`.

## Observations

- App-local files absent in a clean worktree make Agent and Workflow local commands exit before runtime initialization; neither command falls back to a repository-root env.
- Local acceptance used only ignored app-owned files against PostgreSQL `127.0.0.1:55432` and Redis `127.0.0.1:56379`; no repository-root env was created or read.
- The authenticated Web-to-Agent smoke turn completed with `deepseek-v4-flash`, and the local usage row recorded a succeeded turn.
