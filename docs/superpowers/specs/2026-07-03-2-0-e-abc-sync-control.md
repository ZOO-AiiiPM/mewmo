# mewmo 2.0 E-ABC + Sync Control Spec

> Date: 2026-07-03
> Status: Draft for review
> Branch/worktree: `2.0` at `/Users/zoo/zoo/CC工作目录/进行中/mewmo/worktree/2.0`
> Scope: high-fidelity Web UI implementation, Notes polish, Clips, RSS, and minimum sync loop

## 1. Goal

Build the first dogfood-ready mewmo 2.0 slice by combining four workstreams:

- **E: Prototype to Web app** — move the useful interaction and visual structure from `docs/prototypes/notes-home.html` into `apps/web`.
- **A: Notes polish** — finish the existing real-DB Notes path so writing, saving, listing, deleting, and basic edge states feel reliable.
- **B: Clips** — replace mock clip pages with real PostgreSQL-backed clipping APIs and UI.
- **C: RSS** — replace mock feed pages with real feed source APIs, feed entry storage, article reading, and a worker fetch path.
- **Sync** — add the minimum server-backed sync contract so clients can pull changes by version and push local mutations without inventing a second data model.

The objective is not a polished public launch. The objective is a coherent dogfood loop: a logged-in user can write notes, save clips, add feeds, read fetched entries, see a prototype-aligned workspace, and rely on a first versioned sync API.

## 2. Operating Constraint

All work for this effort happens only inside the 2.0 worktree:

`/Users/zoo/zoo/CC工作目录/进行中/mewmo/worktree/2.0`

The main worktree is a 1.0/legacy surface and must not receive specs, plans, code, generated files, or validation side effects for this effort. If a command or path does not clearly point to the 2.0 worktree, stop and re-check before acting.

Existing uncommitted prototype files are treated as user work unless an assigned UI task explicitly claims them.

## 3. Recommended Execution Model

Use a control-agent pattern rather than one large sequential implementation.

The control agent owns the spec, plan, contracts, agent dispatch, review, conflict resolution, and final verification. Worker agents get narrow file boundaries and return summaries plus validation evidence. Shared contracts are decided before implementation, because schema and sync changes can otherwise force every stream to rewrite.

This effort should use four implementation agents plus the control agent:

- **UI Agent** owns the Web shell, navigation, list/detail surfaces, theme behavior, and prototype alignment in `apps/web` and `packages/ui`.
- **Content Agent** owns Notes polish and Clips persistence/API/UI across `apps/web`, `packages/db`, and shared validators.
- **RSS Agent** owns feed source APIs, feed entry APIs, queue jobs, parser/fetch worker, and read-state behavior.
- **Sync Agent** owns `packages/sync`, sync API routes, sync-related validators/types, and version/tombstone behavior.
- **Control Agent** reviews and integrates changes, runs full verification, and keeps agent boundaries intact.

Agents may read any relevant documentation, but they should edit only their assigned boundaries. Schema changes and shared type changes require control-agent approval before implementation.

## 4. Phase Plan

### Phase 0: Stabilize Baseline

Fix the current lint failure in `apps/web/src/components/editor/highlight-plugin.ts` without changing editor behavior. Confirm `pnpm test`, `pnpm lint`, and a targeted web build path are available before opening larger work.

This phase is intentionally small because parallel work on a red baseline makes later failures ambiguous.

### Phase 1: Shared Contracts

Lock the minimum shared contracts before UI and feature work diverge:

- Content models used by Web APIs: note, clip, feed, feed entry, taggable content.
- Mutation shapes: create, update, delete, mark-read, add-feed, refresh-feed.
- Sync shapes: client mutation envelope, server diff response, entity version metadata, tombstone representation.
- Ownership rule: every API and repository operation is scoped by authenticated `userId`.

The contract should prefer the existing Prisma schema where possible. If a schema gap appears, change the schema once in this phase rather than patching it later from multiple agents.

### Phase 2: Parallel Feature Work

Run UI, Content, RSS, and Sync agents in parallel after Phase 1.

UI can continue using adapter functions while Content/RSS wire real APIs. Content can land Notes/Clips behind stable route shapes. RSS can build queue and worker behavior behind repository functions. Sync can expose diff and mutation APIs using the same repository-level ownership and tombstone semantics.

The control agent should integrate in small batches, not wait for every stream to finish.

### Phase 3: Integration

Replace remaining mock data on Notes, Clips, and RSS primary paths. Keep mock-only surfaces only where the first dogfood slice explicitly excludes a feature.

Integration checks must cover logged-in ownership, empty states, error states, optimistic UI rollback where used, and dark/light visual readability.

### Phase 4: Verification and Handoff

Run full verification and produce a concise handoff:

- `pnpm test`
- `pnpm lint`
- `pnpm build` or the narrowest equivalent if full build is blocked by an external service
- Browser smoke test for `/notes`, `/clips`, `/feeds`, representative detail pages, theme switching, create/edit/delete flows, and sync routes
- Worker smoke test for one feed fetch path

Any blocked verification must include the exact command, failure reason, and the next concrete fix.

## 5. Feature Design

### E: Prototype to Web App

The Web app should take the prototype as interaction evidence, not as a literal HTML transplant. The implementation should preserve the prototype's product shape: persistent navigation, collection grouping, dense lists, a calm reading/editing area, and AI as a contextual side rail.

The first pass should prioritize structure over ornament:

- Sidebar grouping for home/today, collection types, feeds, tags, and settings/account affordances.
- List/detail rhythm consistent across notes, clips, and feeds.
- Reader/editor toolbar behavior that does not resize or flash during route changes.
- Dark and light modes with the same information hierarchy.
- No decorative-only rebuilds that delay functional dogfood.

The UI agent should not implement backend logic. It should consume typed data adapters and keep missing capabilities visually honest through disabled or empty states.

### A: Notes Polish

Notes already have a real DB path and Crepe editor. The polish work should make that path dependable:

- Fix lint and stale tests around the editor.
- Ensure save status reflects idle/saving/saved/error.
- Ensure title/content autosave does not write during initial editor normalization.
- Add resilient empty, loading, and not-found states.
- Keep slug stable after creation for this slice.
- Keep delete as soft delete.

This phase should not add collaborative editing or version history.

### B: Clips

Clips should move from mock data to real user-owned data:

- API routes for list, create, read, update metadata, and soft delete.
- Repository calls scoped by `userId`.
- List page shows title, source/domain, saved time, summary/preview, and tags if present.
- Reader page displays sanitized HTML/content and source URL.
- Create flow accepts at least a URL and title/content payload; browser extension capture can use the same API later.

The first dogfood version may accept user-provided content rather than implementing full remote article extraction. The API should leave room for an async extraction job later.

### C: RSS

RSS should support a real subscription loop:

- Feed source CRUD scoped by `userId`.
- Feed source list with unread counts.
- Feed entry list by feed, backed by DB.
- Feed entry reader with content/summary and source URL.
- Mark read/unread state.
- Worker job that fetches a feed URL, parses entries, upserts new entries, and enqueues summary/tag work when available.

The worker must be idempotent: fetching the same feed twice should not duplicate entries. Entry uniqueness should use existing feed/user ownership plus entry URL or GUID-like identifier.

### Sync

The minimum sync loop should be versioned and server-authoritative:

- Each syncable entity has `id`, `version`, `updatedAt`, and optional `deletedAt`.
- Pull: client sends `sinceVersion` or cursor; server returns changed notes, clips, feeds, and feed entries for the authenticated user.
- Push: client sends mutations; server validates ownership, applies changes, increments versions, and returns authoritative records.
- Delete is a tombstone, never a hard delete in syncable content.
- Conflict handling for this slice is last-write-wins by server update time/version.

This is a Web/server contract first. Apple and extension clients can consume it later, but the spec should not overbuild offline queues for platforms that are not yet implemented in this slice.

## 6. Data and API Boundaries

All database access should stay behind `packages/db` repositories where practical. API routes may orchestrate auth, validation, and response formatting, but should not duplicate complex Prisma query logic.

All external input should pass Zod validators from `packages/shared`. This includes content mutations, feed URLs, clip creation payloads, and sync envelopes.

API route groups expected in this slice:

- `/api/notes` and `/api/notes/[id]` — existing path, polished.
- `/api/clips` and `/api/clips/[id]`.
- `/api/feeds` and `/api/feeds/[id]`.
- `/api/feeds/[id]/entries` and `/api/feed-entries/[id]`.
- `/api/sync` for pull and push, or split into `/api/sync/pull` and `/api/sync/push` if the implementation reads cleaner.

Auth is mandatory for every app data route.

## 7. Testing Strategy

Testing should be risk-weighted:

- Repository tests for ownership filters, soft deletes, version increments, and idempotent feed upserts.
- Validator tests for clips, feeds, feed entries, and sync payloads.
- API tests where route behavior is more than a thin repository wrapper.
- UI smoke checks for the main flows, because current web tests are not a full component test harness.

Do not rely on placeholder test scripts for completed work. If a package gains real logic, its test script should run meaningful tests or the final report must call out the gap.

## 8. Agent Boundaries

### UI Agent

May edit:

- `apps/web/src/app/(app)/**`
- `apps/web/src/components/**`
- `apps/web/src/lib/**`
- `packages/ui/**`
- CSS/theme files

Must not edit:

- Prisma schema
- Repository internals
- Worker code
- Sync protocol package

### Content Agent

May edit:

- `apps/web/src/app/api/notes/**`
- `apps/web/src/app/api/clips/**`
- Notes and Clips pages/components
- `packages/db/src/repositories/notes.ts`
- `packages/db/src/repositories/clips.ts`
- relevant shared validators/types

Must coordinate before editing:

- `packages/db/prisma/schema.prisma`
- shared sync types

### RSS Agent

May edit:

- `apps/web/src/app/api/feeds/**`
- `apps/web/src/app/api/feed-entries/**`
- Feed pages/components
- `packages/db/src/repositories/feeds.ts`
- `packages/db/src/repositories/feed-entries.ts`
- `packages/queue/**`
- `apps/agent/**`

Must coordinate before editing:

- schema fields for feed entry identity
- AI queue payload contracts

### Sync Agent

May edit:

- `packages/sync/**`
- sync validators/types in `packages/shared`
- sync API routes in `apps/web/src/app/api/sync/**`
- repository helpers needed for version/tombstone behavior

Must coordinate before editing:

- Prisma schema
- existing Notes/Clips/Feeds API response shapes

## 9. Risks

The largest risk is schema churn after agents start. Control mitigates this by freezing minimum contracts in Phase 1 and approving schema changes centrally.

The second risk is visual work consuming the whole effort. Control mitigates this by defining prototype alignment as shell/list/detail behavior first, not pixel-perfect replication.

The third risk is sync overbuild. Control mitigates this by implementing a server-authoritative minimum contract and deferring platform-specific offline queues.

The fourth risk is hidden mock data. Control mitigates this by requiring final integration to identify any remaining mock-only primary path.

## 10. Definition of Done

The first dogfood slice is done when:

- The 2.0 worktree has no unintended edits outside assigned files.
- `pnpm test` passes.
- `pnpm lint` passes.
- Build verification passes or has a documented external blocker.
- Notes, Clips, and RSS primary pages use authenticated real data.
- Sync pull returns versioned changes for notes, clips, feeds, and feed entries.
- Sync push applies at least create/update/delete mutations for notes and clips, and read-state mutations for feed entries.
- Worker can fetch one feed source without duplicating entries.
- UI shell is recognizably aligned with the prototype's main navigation, list, and detail layout.
- The final handoff lists remaining non-dogfood features separately from bugs.

