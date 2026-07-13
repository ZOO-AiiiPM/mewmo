# 2.0 E-ABC + Sync Handoff

## Completed

- UI: App shell now follows the high-fidelity prototype direction with grouped sidebar, collapsed/peek shell behavior, list column, reader toolbar, toast provider, floating menus, confirm dialog, and AI rail shell. Deferred entries are visible but honest.
- Notes: Note PATCH validates updates, empty updates are rejected, and soft delete increments version.
- Clips: Clips now have authenticated real APIs, user-scoped list/read/create/update/delete, versioned soft delete, and real list/detail UI with safe text rendering.
- RSS: Feeds and feed entries now have authenticated real APIs, feed list/detail pages use real data, feed entry read/unread state is versioned, RSS/Atom parser is covered by tests, and the agent starts a feed fetch worker.
- Sync: Minimum server-authoritative pull/push APIs are implemented for notes, clips, feeds, and feed entries. Pull includes tombstones. Push supports note and clip create/update/delete plus feed entry read/unread mutations.

## Verification

- `pnpm test`: PASS, 13 package tasks plus root scaffold tests.
- `pnpm lint`: PASS, 13 package tasks.
- `pnpm build`: PASS with one-time dummy env values for required production env vars. Next.js still warns that `middleware` should migrate to `proxy`.
- `pnpm --filter @mewmo/web build`: PASS with the same dummy env values.
- `pnpm --filter @mewmo/sync test -- --run`: PASS, 2 tests.
- `pnpm --filter @mewmo/worker test -- --run`: PASS, 2 parser tests.
- `pnpm --filter @mewmo/worker build`: PASS.
- API smoke: Notes, Clips, Feeds, and Sync smoke tests passed against the local dev server and `zoo@mewmo.app` test user.
- Browser smoke: Local login reached `/notes`; `/notes`, `/clips`, and `/feeds` rendered the new shell without horizontal overflow. Deferred toast, list search input, and clip URL input were exercised.
- Worker smoke: Parser tests and agent build passed. A live queue-backed RSS fetch against an external feed was not completed in this verification pass.

## Remaining Dogfood Gaps

- AI rail is a UI shell only; streaming and page-context actions are intentionally disabled.
- Back-to-top was captured in the prototype audit but is not implemented as a real scroll-triggered control yet.
- RSS worker should get one live end-to-end queue smoke with Redis and a stable test feed before calling RSS fully dogfood-complete.
- Sync is server-authoritative and last-write-wins; it is not a full offline conflict engine.
- Next.js `middleware` to `proxy` migration remains as a warning.

## Deferred Product Areas

- PDF: visible as deferred navigation only.
- Books: visible as deferred navigation only.
- Video: visible as deferred navigation only.
- Podcast: visible as deferred navigation only.
- Knowledge Base: visible as deferred navigation only.
- Import/export: visible from account menu but deferred.
- Proactive AI: deferred.

## Known Bugs

- None found in this verification pass.
