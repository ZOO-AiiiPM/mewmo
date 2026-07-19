# Video Backend Design

> Date: 2026-07-19
> Status: Proposed backend contract for the approved frontend prototype
> Scope: Web API, PostgreSQL, queue/agent workers, AI structured analysis, and video-provider adapters

## Goal

Turn the approved Video frontend prototype into a real, user-owned data flow without changing the established Article/Media behavior. Video remains a `Feed(type=video)` plus `FeedEntry`; video-only metadata and analysis live behind an isolated one-to-one detail model.

The first backend slice must be honest about provider limits. Metadata, subtitles, and AI analysis are asynchronous. Missing subtitles are a supported result, not a fabricated transcript. YouTube/channel support may land incrementally, but unsupported work must return explicit state rather than mock success.

## Reused Product Models

- A subscribed channel/creator is a `Feed` with `type=video`.
- A saved video is a `FeedEntry` owned by the same user as its feed.
- `FeedEntry.title`, `url`, `coverImage`, `author/sourceName`, `publishedAt`, `excerpt`, and `content` remain the shared source metadata. For video, `content` stores the original platform description and `excerpt` stores the compact list preview.
- Confirmed Mewmo tags attach through the existing `TaggableType.feed_entry` relationship. Raw platform tags never attach automatically.
- Moving a video to a knowledge base reuses `KnowledgeItem(kind=feed_entry)`.
- Read/unread continues to use `FeedEntry.readAt`. No watch-completion field is introduced because the approved frontend removed that interaction.

## New Data Models

### VideoDetail

`VideoDetail` is a one-to-one extension keyed by `feedEntryId`. It isolates video-specific fields from Article/Media rows.

Required fields:

- `feedEntryId` (primary key and foreign key)
- `platform` (`bilibili` or `youtube`)
- `externalVideoId`
- `durationSeconds`
- `sourceTags` (raw provider metadata, JSON array, never auto-attached)
- `transcript` (nullable structured JSON)
- `transcriptLanguage`
- `quickJudgment` (nullable structured JSON)
- `chapters` (nullable structured JSON)
- `aiHighlights` (nullable structured JSON)
- `suggestedTags` (nullable structured JSON; confirmation required)
- `processingStatus`
- `processingError`
- `processingAttempts`
- `analysisVersion`
- `lastProcessedAt`, `createdAt`, `updatedAt`

`processingStatus` uses the frontend states: `fetching_metadata`, `fetching_transcript`, `analyzing`, `ready`, `no_transcript`, and `failed`.

### VideoUserHighlight

User-created highlights are independent rows so they can be added/deleted optimistically without rewriting a large JSON document.

Required fields:

- `id`, `feedEntryId`, `userId`
- selected `text`
- nullable `startSeconds`
- `version`, `createdAt`, `updatedAt`, `deletedAt`

Every query and mutation must verify both `userId` and active ownership.

## API Contract

### Existing routes retained

- `GET /api/feeds?type=video` returns subscribed video sources and unread counts.
- `GET /api/feed-entries?type=video&feedId=...` returns compact list rows only.
- `GET /api/feed-entries/:id` returns the owned entry; for video entries it additionally returns `videoDetail`, confirmed tags, and user highlights.
- `PATCH /api/feed-entries/:id` continues to own read/unread changes.

### New video routes

- `POST /api/videos` with `{ url }` creates or reuses the correct video feed/entry, creates `VideoDetail(fetching_metadata)`, enqueues processing, and returns `202` with the persisted entry.
- `POST /api/videos/:id/reanalyze` verifies ownership, increments processing revision, resets safe analysis fields, and enqueues a force metadata job.
- `POST /api/videos/:id/highlights` creates a user highlight.
- `DELETE /api/videos/:id/highlights/:highlightId` soft-deletes an owned user highlight.
- `PUT /api/feed-entries/:id/tags` replaces confirmed user-owned tags using existing tag IDs or normalized names. AI suggestions are never attached by this route unless the client explicitly submits them.

Channel subscription remains `POST /api/feeds` with `type=video`. Unlike the current synchronous article path, video refresh must enqueue work and return promptly.

## Queue and Worker Contract

Add three explicit queues so metadata, transcript, and AI retries do not repeat successful earlier work:

- `video-metadata`
- `video-transcript`
- `video-analysis`

Each payload contains `{ userId, feedEntryId, revision, force? }`. Job IDs are deterministic from entry + revision + stage.

The workers execute idempotent stages:

1. Metadata verifies the active entry/feed belongs to the payload user and has `feed.type=video`, resolves the provider, fetches metadata, persists shared FeedEntry/provider fields, then enqueues transcript.
2. Transcript fetches and normalizes timestamped segments. If the provider confirms no usable transcript, it sets `no_transcript` as a successful terminal result; otherwise it enqueues analysis.
3. Analysis calls the video-specific structured AI contract, validates the result, persists quick judgment/chapters/highlights/suggested tags, mirrors the compact judgment summary to `FeedEntry.summary`, then sets `ready`.

Unexpected terminal failures set `failed`, store a sanitized error/failure stage, and increment attempts. Retryable 429/timeout/5xx errors rethrow so BullMQ backoff applies. A manual reanalysis increments `revision`, preventing older jobs from overwriting newer results.

## Provider Boundary

Provider-specific fetching lives behind a shared adapter interface:

- `match(url)`
- `fetchMetadata(url)`
- `fetchTranscript(metadata)`

The first implementation targets single Bilibili videos because its public metadata/subtitle endpoints support the approved flow. YouTube may initially provide metadata-only behavior and return `no_transcript` until a stable transcript source is configured. Channel refresh is a subsequent slice built on the same adapter boundary.

All provider responses are untrusted external input and must be validated/normalized before persistence.

## AI Contract

The existing string `summarizeContent()` contract remains unchanged for Clip/Article. Video adds a separate `analyzeVideoTranscript()` function in `packages/ai` with a Zod-validated structured result:

- `quickJudgment.summary/highlights/thoughts/terms`
- `chapters` with `startSeconds`, optional `endSeconds`, `title`, `theme`, and `summary`
- `highlights` with timestamp, title, note, and optional score
- `suggestedTags` as candidate names only

Invalid model JSON is a failed analysis attempt, never partially persisted as valid analysis.

## Tags

Confirmed video tags are normal Mewmo tags attached to the FeedEntry. The API must:

- resolve only tags owned by the current user;
- create a real tag when the client explicitly creates one;
- preserve stable tag colors;
- attach/detach in a transaction;
- leave raw source tags and unconfirmed AI suggestions untouched.

## Frontend Migration

Replace mock data incrementally:

1. Load video feeds and compact entries from existing APIs.
2. Load selected video detail from `GET /api/feed-entries/:id`.
3. Keep optimistic read/tag/highlight UI and roll back on failed mutations.
4. Poll only non-terminal video details with bounded backoff until `ready`, `no_transcript`, or `failed`.
5. Keep mock assets only for tests/empty examples, not as runtime fallback for persisted rows.

## Out of Scope for the First Slice

- cross-device watch progress or watched completion
- automatic attachment of platform/AI tags
- comments, likes, danmaku, or platform engagement metrics
- real-time WebSocket/SSE progress
- transcript full-text search indexing
- bulk channel history import beyond a bounded first batch
- changing Article/Media parsing or summary behavior

## Definition of Done

An authenticated user can submit a supported video URL, immediately receive a persisted processing entry, reload without losing it, observe honest status transitions, see real metadata/description/subtitles when available, receive validated structured AI analysis, confirm shared Mewmo tags, create/delete personal highlights, reanalyze safely, and never access or mutate another user's video data. Existing Article/Media tests and behavior remain green.
