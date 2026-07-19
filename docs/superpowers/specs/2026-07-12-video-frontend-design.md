# Video Subscription Frontend Design

> Date: 2026-07-12
> Status: Approved direction for frontend prototype
> Scope: Web frontend and mock data only

## Goal

Turn the existing deferred Video subscription entry into a realistic frontend prototype without changing Prisma, APIs, queues, workers, or AI prompts. This slice validates the third-column reading experience and its interaction contract before backend fields are committed.

The prototype must stay honest: video playback, transcript, AI analysis, and highlight persistence are mock or in-memory frontend behavior. It must not imply that remote parsing, cross-device progress, or server persistence already work.

## Product Shape

Video stays inside the existing Subscription group and uses `/feeds?type=video`. It follows the established Mewmo workspace rhythm:

- Sidebar drawer: subscribed creators/channels.
- List column: cover-first video cards with one unread dot, platform-provided preview, source, date, and duration.
- Reader column: title and metadata, complete video player, original platform description, Mewmo tags, a lightweight AI-reading entry, then Transcript and Highlight Notes tabs.
- Right AI rail: video context, AI quick judgment, and Full Summary.
- Add modal: single-video and channel-subscription entry points.

Article and Media behavior remains unchanged.

## Reader Information Architecture

The main reader column uses this fixed top-to-bottom order:

1. Full video title.
2. Platform badge, creator, published date, and duration.
3. Complete native video player with controls, poster, and public mock video source.
4. The original platform description and user-owned Mewmo tags.
5. A lightweight **AI 解读** teaser that opens the right AI rail.
6. Exactly two tabs: **原文细读** and **高光笔记**.

The active tab content starts immediately below the tab bar. Low-frequency actions—knowledge-base capture, copy, export, and regeneration—live in the reader toolbar's top-right overflow menu instead of a separate action row.

The title and metadata must appear before the player so the user understands what they are about to watch before entering playback.

The reader does not expose a mark-watched button or processing-status badge. Processing remains represented through honest empty/loading copy inside the AI and transcript surfaces only when it is relevant.

## Original Description and Mewmo Tags

The platform description is preserved as source content rather than replaced by Mewmo's AI summary. It appears immediately below the player with a link back to the original video.

Mewmo tags remain the only user-facing tag system:

- Confirmed tags use the same stable colors and vocabulary as Notes, Clips, and other Feed entries.
- Users can select existing tags or create a new one from the shared picker interaction.
- AI may suggest tags from the title, description, transcript, and hidden source metadata, but a suggestion is attached only after explicit user confirmation.
- Raw Bilibili/YouTube tags remain ingestion metadata and are not rendered or automatically written into the user's tag pool.
- The backend phase should attach confirmed tags through the existing `feed_entry` taggable relationship.

## Right AI Rail: Quick Judgment and Full Summary

AI-generated interpretation belongs to the existing right AI rail rather than competing with the center reading surface. Opening the teaser activates the rail's summary tab and attaches the selected video as context.

The quick-judgment area is for fast value judgment rather than deep reading. It can be expanded or collapsed and contains four distinct, vertically stacked blocks. It must never become a two-column/table-like grid, even when the rail is resized wider:

- **摘要**: the video's central claim in compact prose.
- **亮点**: the most valuable or novel points.
- **思考**: questions, implications, or prompts worth carrying forward.
- **术语解释**: important terms paired with concise explanations.

Unavailable or still-processing analysis uses an explicit processing/empty state rather than fabricated content.

The **全文总结** section follows Quick Judgment in the same AI rail and supports two switchable modes:

- **按时间线总结**: sections follow video playback order.
- **按主题归纳**: sections are grouped/sorted by topic so related ideas can be read together.

Each section contains a timestamp or topic label, section title, and section summary. Timestamps seek the center player. Choosing **查看原文** switches the center reader to Transcript and seeks to the matching position.

Summary text remains selectable so it can become a user highlight without moving AI content back into the center reader.

## Tab 1: 原文细读

This tab displays the full available subtitle/transcript rather than a chapter preview. Transcript timestamps seek the player, and transcript search may filter or emphasize matching segments.

Transcript text must remain selectable. Selecting text invokes the same highlight interaction used in the AI rail's Full Summary.

## Text Selection and One-click Highlight

When the user selects non-empty text inside the AI rail's Full Summary/Quick Judgment or the center Transcript, show a floating toolbar near the selection. The toolbar displays the selected character count and a prominent **高光** action.

Choosing **高光**:

- creates a user highlight from the selected text;
- associates the nearest video timestamp when available;
- clears the browser selection and closes the toolbar;
- makes the new item visible under **我的高光** in the Highlight Notes tab.

For this frontend slice, user highlights live only in component/session memory. Selection outside the supported content surfaces must not create the toolbar. Share or explain actions are optional prototype affordances; one-click highlight is required to work.

## Tab 2: 高光笔记

AI-generated highlights and user-created highlights are separate concepts and must remain visually and semantically distinguishable.

The tab provides filters for **全部**, **AI 高光**, and **我的高光**:

- AI highlight cards use mock analysis data and may show topic/title, note, timestamp, and importance score.
- User highlight cards show the selected text, character count, and nearest timestamp when available.
- A newly created user highlight appears immediately without a backend request.

## Shared Interaction Contract

- Opening Video restores `feedId` and `entryId` from the URL without exposing or changing a watched-completion field.
- Opening an unread video optimistically clears its unread dot. Read state remains separate from playback progress.
- Selecting a video updates stable query parameters while keeping the list mounted.
- Video cards follow the existing subscription rhythm: unread dot, title, gray platform preview, cover/duration, source, and time. They do not expose AI-processing, subtitle, or watch-completion badges.
- Processing states include metadata, transcript, analysis, ready, no-transcript, and failed.
- Right-rail timestamps control the center player; **查看原文** changes the center tab without closing or replacing the AI context.
- Adding a mock video or channel changes only in-memory frontend state and shows explicit prototype feedback.
- Knowledge-base capture, copy, export, and regeneration remain prototype actions in the top-right overflow menu unless separately implemented.

## Frontend Data Boundary

Reusable video types and mock data belong under `apps/web/src/lib/`. List items and details stay separate so a future list API does not need to return full transcripts. The mock detail shape may include the original platform description, hidden source tags, confirmed Mewmo tags, AI tag suggestions, quick-judgment content, chapter/theme summaries, transcript segments, and AI highlights.

No persistence contract is established for user highlights in this phase. Backend field names and API routes must not be inferred from temporary component state.

## File Boundary

Allowed changes for this slice:

- `apps/web/src/components/video/**`
- `apps/web/src/lib/video-*`
- `apps/web/src/app/(app)/feeds/page.tsx` for small route delegation
- `apps/web/src/components/shell/Sidebar.tsx` for enabling Video and mock drawer sources
- `apps/web/src/components/shell/AISidebar.tsx` and `AppShell.tsx` for contextual video insight and programmatic opening
- `apps/web/src/app/globals.css` for `mewmo-video-*` styles
- targeted tests and this spec/plan

Explicitly out of scope:

- Prisma schema and repositories
- Feed/video APIs and sync contracts
- Agent queues/workers and AI prompts
- server persistence for progress or highlights
- broad refactors of Article/Media feeds
- unrelated dirty files

## Definition of Done

With mock data, a user can open Video, clear an unread dot, read a stable list preview, play a complete sample video, retain the platform's original description, manage colored cross-content Mewmo tags, explicitly confirm AI tag suggestions, avoid redundant watched/processing state fields, open AI interpretation in the right rail, expand/collapse a vertically stacked four-part Quick Judgment, change Full Summary mode, seek the center player from a right-rail timestamp, open the matching Transcript section, switch only between Transcript and Highlight Notes in the center, select text in AI interpretation or Transcript, save it with one click, and find it separately from AI highlights. Light and dark themes continue to use existing tokens.
