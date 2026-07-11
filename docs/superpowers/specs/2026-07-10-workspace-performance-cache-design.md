# Workspace Performance Cache Design

## Goal

Make note and clip navigation feel immediate after the first load, while keeping list payloads small and refreshing server state in the background.

## Root Cause

The current pages keep loaded data only in component state. Switching between `/notes` and `/clips` unmounts that state, so returning to a section reloads its list and selected body. Clips also load the list before they know which detail to request, creating two serial network waits. During the detail request, the reader renders a list preview without `content` and incorrectly reports that no body exists.

Redis does not solve this browser interaction by itself. The configured Upstash Redis is currently used by BullMQ workers. Even if API responses were cached there, the browser would still wait for a network request before it could render. A browser memory cache can paint previously viewed data synchronously and then refresh it.

## Scope

Create a small account-session browser cache for note and clip lists and details. It lives at module scope, survives route component unmounts, deduplicates concurrent requests, and exposes cached data synchronously. It is cleared by a full page reload and does not attempt offline persistence.

Use stale-while-revalidate behavior:

- Render cached lists and details immediately.
- Refresh lists in the background when a section mounts.
- Fetch a detail only when it is absent or older than the list item's `updatedAt`.
- Keep cached content visible when refresh fails.
- Update or remove cache entries after create, edit, refresh, pin, and delete operations.

## Clip Loading Behavior

The clips page initializes from cached list/detail data. A selection with no cached body shows a neutral loading state, not "暂无正文内容". Successful detail responses are stored by id and merged into the list metadata. Returning to a viewed clip reuses the cached body without another detail request unless the list reports a newer `updatedAt`.

The clips list API remains metadata-only. This preserves the existing rule that growing libraries must not transfer every full HTML body.

## Note Loading Behavior

Server-rendered note data seeds the shared cache. Note selection reads cached detail data first and otherwise fetches `/api/notes/:id`. Editor changes update the cached detail immediately. Returning to the notes section can seed its client state from the shared cache while the server-provided data reconciles freshness.

## Non-Goals

This slice does not add IndexedDB, offline writes, Redis response caching, service workers, or a new data-fetching dependency. IndexedDB can later replace the memory storage behind the same cache API when full reload and offline startup performance become the next target.

## Success Criteria

- Returning to notes or clips during the same browser session shows the last list and viewed body immediately.
- Re-selecting an already viewed item does not repeat its detail request when unchanged.
- Concurrent callers for the same resource share one request.
- Clip detail loading never presents missing `content` as confirmed empty content.
- Existing list endpoints continue to omit full bodies.
- Targeted tests, lint, build, and browser checks pass.
