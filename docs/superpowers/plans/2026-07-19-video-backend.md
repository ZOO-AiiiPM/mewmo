# Video Backend Implementation Plan

> Date: 2026-07-19
> Depends on: `docs/superpowers/specs/2026-07-19-video-backend-design.md`

## 1. Contract Tests

- Add failing validator tests for video metadata, transcript segments, structured AI analysis, processing status, and video API inputs.
- Add failing queue tests for metadata/transcript/analysis payloads, deterministic job IDs, and stable retry options.
- Add repository tests for owned video details and user highlights.

## 2. Isolated Persistence

- Add `VideoDetail`, `VideoUserHighlight`, and processing/platform enums to Prisma.
- Add repository methods with user ownership, soft-delete/version behavior, and one-to-one FeedEntry constraints.
- Generate Prisma Client; use `db:push` only against the explicitly selected development database after approval.

## 3. Shared Contracts and AI

- Add Zod schemas/types in `@mewmo/shared`.
- Add `analyzeVideoTranscript()` and a dedicated prompt in `@mewmo/ai` without changing article summarization.
- Test valid JSON, fenced JSON, malformed output, and provider failures.

## 4. Video Queue and Providers

- Add metadata/transcript/analysis queues/helpers and tests.
- Add provider adapter resolution and a Bilibili single-video adapter with mocked HTTP tests.
- Add the worker stage machine, retries/backoff, ownership checks, and failure persistence.
- Start the worker from `apps/agent/src/index.ts`.

## 5. API Vertical Slice

- Add `POST /api/videos` and reanalyze/highlight routes.
- Extend feed-entry detail responses with owned video detail, confirmed tags, and highlights.
- Add the generic confirmed-tag replacement route for FeedEntry.
- Add authorization/not-found/validation tests or targeted route-contract tests.

## 6. Frontend Integration

- Replace video feed/list/detail mock reads with API data while retaining local optimistic state.
- Wire add-video, tag confirmation, highlight CRUD, and reanalysis.
- Add bounded processing polling and honest terminal states.
- Keep channel subscription and unsupported-provider feedback explicit until their provider slice lands.

## 7. Verification

- Run targeted package/unit tests for shared, db, queue, ai, agent, and video frontend.
- Run lint, TypeScript builds, and `git diff --check`.
- Verify ownership failures and Article/Media regression paths.
- Run local browser acceptance for create → process → read → tag → highlight → reanalyze.
