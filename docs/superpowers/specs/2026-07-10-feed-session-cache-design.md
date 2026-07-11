# Feed Session Cache Design

## Goal

Make returning to subscriptions immediate without retaining an unbounded copy of the user's feed library in browser memory.

## Current Behavior

The feeds page initializes sources and entries as empty arrays. It first loads `/api/feeds`, waits until the selected source is known, and then loads `/api/feed-entries`. Leaving the route destroys both arrays, so every return repeats the serial requests. The entries endpoint currently returns complete entry bodies.

## Cache Shape

Extend the browser-only workspace cache with two feed stores:

- Feed source lists keyed by feed type.
- Feed entry lists keyed by feed id, capped at the newest 10 entries.

Only sources the user opens are cached. The cache is scoped to the signed-in account and cleared by full reload, matching the current notes and clips cache.

## Loading Behavior

When the user opens a feed type, cached sources render synchronously and `/api/feeds` refreshes them in the background. When a source is selected, its cached entries render synchronously and `/api/feed-entries` refreshes the full visible list in the background. The UI may show the complete response for the active source, but only the newest 10 entries are retained after route unmount.

Cached entry bodies remain readable while refresh is in flight or fails. Read and favorite mutations update both visible state and the cached copy. Manual feed refresh reloads the active source and replaces its 10-entry cache.

## Limits

The cache limit is per feed source, not per feed type. It does not prefetch every source and does not limit server history. Category-wide views without a source id remain network-driven because mixing ten entries from every source would create an unbounded aggregate cache.

## Success Criteria

- Returning to an opened subscription immediately shows up to 10 cached entries.
- Each feed source cache contains at most 10 newest entries.
- Feed source lists render from cache while refreshing in the background.
- Read, favorite, source deletion, and manual refresh cannot leave stale cache state.
- Existing article/media type isolation remains intact.
