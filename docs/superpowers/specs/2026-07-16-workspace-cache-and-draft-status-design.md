# Workspace Cache and Draft Status Design

## Scope

This design resolves ZOO-38 for the logged-in workspace content surfaces: Notes, Clips, Feeds, Today, Trash, and Knowledge. Every surface follows one cache contract instead of opting into unrelated page-specific behavior. Settings and Chat keep their existing domain-specific state because they are not collection/list/detail consumers covered by this issue.

The goal is perceptual immediacy without weakening authentication or changing PostgreSQL as the source of truth. Navigation gives feedback within 100 ms, previously visited content renders from account-scoped session memory, and current server data refreshes in the background. The batch also preserves the current note being edited when a save cannot reach the server and makes that state visible.

This is not a complete offline application. It does not add IndexedDB, a Service Worker, an offline mutation queue for arbitrary resources, automatic conflict merging, Redis response caching, or public/cross-user server caching. It only detects a version conflict for the protected current-note draft so newer server content is not silently overwritten.

## Current causes

The logged-in root layout is forced dynamic and runs Auth.js on the server, so navigation can wait for an RSC payload before the target route commits. The workspace has no shared route-level loading boundary or navigation pending signal, leaving the existing shell visually unchanged during that wait.

The existing client cache covers Notes, Clips, and Feeds through several specialized maps. Today, Trash, and Knowledge mount with empty state and fetch again. Knowledge separately loads the knowledge-base list in Sidebar and in the page, then may write a default `kbId` before loading the tree and contents. The Today API returns full note, clip, and feed-entry content in a list response; Knowledge contents include full related records.

The note editor already writes content drafts to `localStorage` and retries failed PATCH requests with exponential backoff, but the key is not account-scoped and save failures remain silent. Title saves use a separate silent path. The UI therefore cannot distinguish saved, saving, locally preserved, and failed states.

## Unified cache contract

One browser-memory workspace cache owns all session data for the six content surfaces. It exposes typed resource operations over stable string keys rather than adding a new map and custom loading branch for each page.

Every cached resource records its value and the time it was accepted. The cache has no authority over the server: it is only an immediate rendering source. Pages use the same read flow:

1. Read the account-scoped cached value synchronously.
2. Render it immediately when present; otherwise retain the workspace shell and show the target surface skeleton.
3. Start or reuse one in-flight refresh for the resource key.
4. Replace the cached value after a successful response.
5. On refresh failure, keep usable cached data visible and show a non-blocking stale/error state. If no cached value exists, show the page's normal blocking error state.

No surface may clear visible cached data merely because a refresh started. Background refresh state is separate from initial-loading state.

The concrete resource families are:

- Notes list and note detail.
- Clips list and clip detail.
- Feed sources by feed type and feed entries by feed ID or aggregate feed view.
- Today list and selected-item detail.
- Trash list and trash detail by type and ID.
- Knowledge-base list, knowledge-base tree, folder contents, and selected-item detail.

Feed-entry cache size may remain bounded, but bounds and freshness behavior live in the shared cache policy rather than individual pages. Resource keys include every input that changes the result, such as feed type, feed ID, knowledge-base ID, folder ID, and filters represented by server queries.

## Account isolation and stale-response protection

The cache scope is the authenticated immutable user ID, not email. Changing or removing the account ID clears values and in-flight registrations.

Each account scope receives a generation token. A request captures the token when it starts and may populate cache only if the same account and generation remain active when it resolves. This prevents a delayed response from the previous account repopulating the next account's cache after logout or account switching.

Local note drafts use keys containing both user ID and note ID. Legacy unscoped draft keys are not trusted across accounts. They may be removed after a successful server load rather than migrated into an authenticated account automatically.

## Mutations and consistency

Successful create, update, restore, delete, favorite, read-state, or import mutations update or invalidate every affected cached resource through shared helpers. Pages do not maintain a second contradictory cache policy.

Optimistic updates remain appropriate for reversible user actions. They update visible state and cache together, retain a rollback snapshot, and restore both if the server rejects the mutation. Mutations that return canonical server objects replace optimistic values with the returned version.

Cross-surface effects are explicit. For example, deleting a note updates Notes and may invalidate Today, Trash, and Knowledge resources that can contain the note. Restoring a trash item updates Trash and invalidates its owning collection. The first implementation may choose invalidation over complex cross-resource patching when the affected representation differs, but it must preserve currently visible cached content until revalidation completes.

## Navigation feedback

The authenticated workspace gains a shared loading boundary that renders inside the existing AppShell geometry. Sidebar, AI controls, and stable columns do not disappear during route transitions.

Navigation interactions set an immediate pending target so the clicked destination visibly acknowledges the action before the RSC route commits. The pending signal clears on route change or failed/cancelled navigation. A cached target page renders its content as soon as mounted; an uncached target uses a surface-shaped skeleton rather than a blank or full-screen spinner.

The forced-dynamic layout and server authentication are measured before changing their boundary. Authentication is not removed or converted into public caching for speed. Instrumentation separates click-to-pending, click-to-URL commit, RSC/auth time, API time, database time, response size, and client rendering time so later optimization addresses the measured bottleneck.

## List and detail API contracts

List endpoints return only fields required to render list cards, selection identity, ordering, freshness comparison, and lightweight previews. Note, clip, and feed-entry body content is excluded from Today and Knowledge list responses. Trash keeps its existing lightweight list and separate detail endpoint.

Selected content is loaded through a detail resource and cached independently. This keeps list refreshes small while allowing recently opened content to reappear immediately within the session.

Knowledge-base list loading is shared between Sidebar and the page. The page does not fetch the same list merely to select a default base. Default knowledge-base selection is derived from the shared cached/refreshed result, and tree plus folder contents load without an avoidable list-fetch/navigation/list-fetch chain.

## Current-note draft behavior

Only the currently edited existing note receives persistent temporary protection. The draft contains title and body content, the authenticated user ID, note ID, local update time, and the last server version or update time known when editing began.

Editor save state is one of:

- `saving`: a debounced save or retry is active.
- `saved`: the server confirmed the latest local title and body.
- `offline`: the browser is offline or the request failed with a network-level error; the latest draft remains on this device.
- `error`: the server responded but rejected the save, or local draft persistence failed.

The editor displays these states in its existing chrome without blocking typing. Content changes continue to write the local draft before the network save. Title changes join the same visible save state instead of failing silently.

When the browser emits `online`, the editor immediately retries the latest draft instead of waiting only for the backoff timer. Retries remain bounded by one active save per note. A successful response for the latest draft clears the local draft; a response for an older edit must not clear a newer draft.

On reopening the same authenticated note, a local draft is restored before editing and resubmitted. This design does not support offline note creation, offline deletion, offline image upload, multiple-note mutation queues, background sync after the app closes, or automatic conflict merging. If the server version changed since the draft was created, the client keeps the draft and reports a save conflict/error rather than silently overwriting newer server content.

## Error behavior

Cached pages distinguish initial failure from refresh failure. Initial failure with no data uses the existing page error treatment. Refresh failure leaves content readable and exposes a retry action or status. A stale indicator must not claim data is current when refresh failed.

Authentication failures clear account-scoped cache and follow the existing login flow. Authorization and not-found responses remove only resources proven inaccessible or deleted; they are not treated as transient offline errors.

The note editor distinguishes browser offline/network failure from an HTTP rejection. Both preserve the local draft, but the copy and recovery action differ. Local-storage quota or serialization failure is surfaced as an error because the application cannot honestly promise that the draft is protected.

## Verification

Unit tests cover cache reads, background refresh, in-flight deduplication, mutation updates/invalidation, resource-key inputs, account clearing, and generation-token rejection of delayed responses. Page behavior tests cover all six surfaces using cached data without clearing it during refresh and uncached surfaces showing their own skeleton.

API contract tests prove Today and Knowledge list responses omit full body content while detail responses still return it. Knowledge tests verify Sidebar and the page share one knowledge-base list request and avoid the default-selection request chain.

Editor tests cover account-scoped draft keys, title and body persistence, save-state transitions, immediate retry on `online`, exponential retry after network failure, no clearing by stale responses, HTTP rejection, local-storage failure, draft restoration, and server-version conflict handling.

Browser verification covers cold and warm navigation among Notes, Clips, Feeds, Today, Trash, and Knowledge; visible feedback within 100 ms; cached return without a blank/full loading state; failed refresh with content retained; account switching; offline note editing and recovery; and light/dark themes. Production verification records click-to-pending, URL commit, API timing, response size, and cold/warm round trips for the required surfaces.

## Acceptance outcome

All six workspace content surfaces obey one account-scoped cache contract. Returning to a visited surface in the same authenticated browser session shows cached content immediately and refreshes it in the background. Duplicate reads share a request, list payloads exclude unnecessary full bodies, and delayed previous-account responses cannot cross the account boundary.

Navigation visibly responds within 100 ms without removing real authentication. The current note's latest title and body survive transient offline or save failures on the same device, the editor states whether the content is saving, saved, locally preserved, or rejected, and recovery retries when connectivity returns. No broader offline-editing claim is made.
