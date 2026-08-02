# Lessons: ZOO-115 笔记标题 IME Enter 修复

This file captures raw observations from this task. Keep evidence and uncertainty visible; a later curation pass promotes durable guidance into `.trellis/spec/`.

## Observations

- AO shared Browser panel for this worker session returned a persistent `INTERNAL_ERROR` on every `ao browser` command (snapshot/open/scroll/tab) once a `ao browser scroll` call failed and hung (~120s). Survived a full `ao stop`/desktop-app restart. The daemon healthz/readyz stayed ok the whole time; only browser commands broke, isolating the failure to the Electron webcontents-debugger transport, not the daemon.
- Unit tests fully cover the title IME decision matrix (isComposing, keyCode 229, plain Enter, non-Enter). Real-Chromium pinyin composition browser acceptance was NOT achievable this session because of the above panel failure; flagged as the single outstanding acceptance item.
- Provisioning a throwaway local account for browser work: POST `/api/auth/send-code` writes the 6-digit code to Redis (`otp:<email>:register`); the code can be read back via the project's ioredis client to complete `/api/register` and log in with credentials. Handy for isolated UI verification.
- Root repo `pnpm test:unit` fails on `worker-deployment-static.test.mjs` until `pnpm --filter @mewmo/db db:generate` has run (missing generated `.prisma/client`). `db:generate` is normally run by `predev`/`prebuild`.
