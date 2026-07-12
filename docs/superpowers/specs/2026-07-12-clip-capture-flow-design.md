# Clip Capture Flow Design

## Scope

This batch jointly resolves ZOO-8 and ZOO-11 because URL identity, duplicate submission, immediate list insertion, and slow page fetching all meet in `POST /api/clips` and the shared ListColumn URL input.

## Root causes

The API fetches the remote page for up to twelve seconds before creating a Clip, so the UI cannot show a durable record promptly. ListColumn displays a success toast and clears the input immediately after invoking an asynchronous callback, before persistence is known. The database stores only the submitted URL and has no per-user normalized identity, so repeated and concurrent equivalent URLs create separate rows.

## URL identity

A pure shared normalizer lowercases protocol/host, removes fragments, default ports, trailing path slashes, and common tracking parameters, sorts remaining query parameters, and uses one protocol-independent identity key. The original usable URL remains in `url`; `normalizedUrl` is only the deduplication key.

Clip gains nullable `normalizedUrl` plus a unique `(userId, normalizedUrl)` constraint. Nullable keeps existing data deployable without inventing normalized values or failing on historical duplicates. Every new URL-created Clip writes a non-null normalized value. A Prisma unique conflict is resolved by loading and returning the existing active Clip.

## Persist-first asynchronous capture

`POST /api/clips` validates and normalizes the URL, checks an existing active Clip, then creates a placeholder Clip with `fetchStatus = queued`. The title falls back to the submitted title/domain and content remains empty. It enqueues a stable retryable `clip-fetch-<id>` job and immediately returns the durable row with `existing` and `queued` flags.

The Agent clip worker calls the authenticated internal background-refresh path on the Web service. This intentionally reuses the existing mature HTML extraction code rather than duplicating parser logic across apps. The existing deployment secret used for authenticated background refresh protects the path in production. BullMQ owns retries and duplicate-job suppression.

Background refresh sets `fetchStatus = fetching`, fetches/extracts the page, updates all content metadata and `fetchStatus = success`, then enqueues summary generation. Failure stores `fetchStatus = error` and an actionable message before returning a failing response so BullMQ retries.

## UI contract

ListColumn awaits `onSubmitClipUrl`, disables the URL input and submit button while pending, and never emits success itself. The owning clip page is the source of truth for created, existing, and failed messages.

A successful API response is inserted into the current list and cache immediately. Existing responses select the previous Clip and show “之前已剪藏”. New queued Clips show a synchronizing status. The selected Clip is polled only while queued/fetching; successful background updates replace the list/detail cache. Error state exposes the existing refresh action as retry.

The same shared callback contract applies to `/clips` and `/clips/[id]`, preventing contradictory behavior between list and detail routes.

## Boundaries

Historical duplicate cleanup is not automatic in this batch. The nullable normalized key prevents new duplicates without destructive migration. This batch does not add browser-extension capture or offline queues.

## Verification

Tests cover URL equivalence, database uniqueness, concurrent duplicate API requests, persist-before-fetch behavior, queue idempotency, worker/background state transitions, disabled submit behavior, immediate cache insertion, existing-record navigation, and failure copy. Browser verification covers slow submission feedback, duplicate response, live update, and both themes.
