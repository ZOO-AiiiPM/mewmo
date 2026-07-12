# Feed Creation Flow Design

## Scope

This batch jointly resolves Linear issues ZOO-10, ZOO-12, and ZOO-9 because they share the add-feed modal, `POST /api/feeds`, feed fetch queue, and first-sync UI state.

## Current root causes

The discovery input relies on implicit browser form submission, which is not reliably firing for Enter in the current app. Feed creation synchronously calls `fetchAndStoreFeed`, so the response waits for RSS download and sequential article fetches. Discovery results store only one selected index, so the UI cannot submit multiple sources or retain per-source outcomes.

## User flow

The discovery input explicitly handles Enter by requesting submission from the same form used by the search button. IME composition Enter is ignored. Search keeps the existing loading, empty, and error states.

Discovery results use checkboxes with selected count, select-all, and clear-all actions. One result remains easy to add: selecting one and pressing the primary action is the single-source path. The chosen category applies to the current selection, preserving the existing category control.

The add action submits selected sources independently. It prevents a second submission while active and records each result as added, already subscribed, or failed. Successes are persisted even when another source fails. If every source succeeds or already exists, the modal closes and navigates to the first result. On partial failure, the modal stays open with only failed sources selected for retry.

## API and queue architecture

`POST /api/feeds` validates and persists the Feed first with `lastFetchStatus = "queued"`. It then enqueues a BullMQ feed-fetch job and returns immediately. The response includes `existing` and `queued` flags so the UI can distinguish a new feed, an existing feed, and a saved feed whose queue submission failed.

Queue jobs use a stable `feed-<id>` job id, retry transient failures three times with exponential backoff, and are removed after completion or terminal failure. This prevents concurrent duplicate work while allowing a later manual retry.

If queue submission fails after persistence, the API records `lastFetchStatus = "error"` and returns the saved Feed with `queued = false`; it must not pretend that persistence failed and induce duplicate clicks.

Existing active feeds are not recreated. Feeds already queued or fetching are returned without another job. Failed feeds are requeued. Successful existing feeds are returned unchanged.

## Worker and visible progress

The feed worker sets status to `fetching` before network work. It processes parsed entries independently so one bad entry does not stop the rest. It writes each entry as soon as it succeeds. Final status is `success`, `partial`, or `error`, with counts and error text persisted on the Feed.

The Web page polls the selected Feed and its entries only while status is `queued` or `fetching`. This makes newly stored entries appear incrementally without permanent polling. The existing empty-state component shows queued/fetching, error/partial, and retry messaging. Manual retry enqueues work and returns immediately rather than running the fetch inside the request.

## Compatibility and boundaries

No Prisma schema change is needed: the required status fields and unique `(userId, url, type)` constraint already exist. The API remains backward-compatible for existing consumers because the Feed fields remain at the response top level. Apple and extension clients can use the same endpoint later.

This batch does not implement WebSocket delivery, a new feed-search provider, or full client offline sync.

## Verification

Tests must prove explicit Enter submission with IME protection, multi-selection state and partial outcomes, persist-before-queue API behavior, duplicate job idempotency, worker progress/failure isolation, and polling/status copy. Browser verification covers Enter versus button, selection controls, loading/disabled states, and both themes. API integration verifies fast persistence and duplicate creation behavior without requiring a live external RSS site.
