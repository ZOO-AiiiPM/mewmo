# Protected Note Sharing Design

## Goal

Build first-version note sharing: the owner can copy a share link for a note, and anyone with the link can view the note only after logging in or registering.

## Scope

Only notes are shareable in this version. Clips, feeds, knowledge bases, folders, password-protected links, anonymous public links, invite-only access, analytics, and per-recipient permissions are out of scope.

## User Experience

The existing note card menu and note reader toolbar "分享" actions become real actions. When the owner clicks share, the app creates or reuses an active share token for that note, copies `/share/notes/<token>` to the clipboard, and shows "已复制分享链接".

Opening a share link requires authentication. If the visitor is not logged in, middleware redirects to `/login?callbackUrl=<share-url>`. Login should return to the callback URL. Register should preserve the callback URL by sending the user to `/login?callbackUrl=<share-url>` after account creation. A logged-in visitor sees a read-only note page with the title, metadata, and markdown content. The page must not show edit, delete, pin, export, or workspace navigation actions.

## Data Model

Add a separate `NoteShare` model instead of adding share fields to `Note`.

Each share has `id`, `noteId`, `ownerId`, `token`, `createdAt`, and `revokedAt`. `token` is globally unique. A note may have many historical shares, but first-version create/reuse returns the active share where `revokedAt` is null. Separating this table keeps future revoke/regenerate/history behavior straightforward and keeps the note record focused on note content.

## API

`POST /api/notes/[id]/share` requires the current authenticated owner. It only creates shares for active notes owned by the session user. It returns `{ url, token }`, where `url` is the relative share URL.

The share page reads by token server-side. Missing token, revoked share, deleted note, or deleted owner-owned note returns 404. The page is available to any authenticated user with the link, including users who do not own the note.

## Security

Share tokens must be random, unguessable, and not derived from note IDs or slugs. The owner can create a link only for their own active note. Shared pages never expose write APIs or ownership-only controls. Authentication gates the whole `/share/:path*` route through middleware.

## Testing

Static tests cover the Prisma model, protected middleware matcher, share API route, share page route, login/register callback behavior, and note UI wiring. Repository or route tests cover active-share reuse and owner-only creation where practical. Full verification runs `pnpm test`, `pnpm lint`, `pnpm build`, and `git diff --check`.
