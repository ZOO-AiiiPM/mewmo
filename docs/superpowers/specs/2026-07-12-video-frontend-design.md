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
- List column: cover-first video cards with source, duration, processing state, and watch state.
- Reader column: title and metadata, complete video player, AI quick judgment, then three content tabs.
- Add modal: single-video and channel-subscription entry points.

Article and Media behavior remains unchanged.

## Reader Information Architecture

The main reader column uses this fixed top-to-bottom order:

1. Full video title.
2. Platform badge, creator, published date, duration, and mark-watched action.
3. Complete native video player with controls, poster, and public mock video source.
4. Processing status and current chapter state.
5. Collapsible AI quick-judgment area.
6. Exactly three tabs: **全文总结**, **原文细读**, and **高光笔记**.

The title and metadata must appear before the player so the user understands what they are about to watch before entering playback.

## AI Quick Judgment

The area immediately after the player/status is for fast value judgment rather than deep reading. It can be expanded or collapsed and contains four distinct blocks:

- **摘要**: the video's central claim in compact prose.
- **亮点**: the most valuable or novel points.
- **思考**: questions, implications, or prompts worth carrying forward.
- **术语解释**: important terms paired with concise explanations.

Unavailable or still-processing analysis uses an explicit processing/empty state rather than fabricated content.

## Tab 1: 全文总结

The summary supports two switchable modes:

- **按时间线总结**: sections follow video playback order.
- **按主题归纳**: sections are grouped/sorted by topic so related ideas can be read together.

Each section contains a timestamp or topic label, section title, and section summary. A user can choose **展开原文** to reveal the transcript segments belonging to that section and **收起原文** to collapse them again. Timestamps seek the video to the matching position.

Summary text and expanded original text are selectable so either can become a user highlight.

## Tab 2: 原文细读

This tab displays the full available subtitle/transcript rather than a chapter preview. Transcript timestamps seek the player, and transcript search may filter or emphasize matching segments.

Transcript text must remain selectable. Selecting text invokes the same highlight interaction used in Full Summary.

## Text Selection and One-click Highlight

When the user selects non-empty text inside Full Summary or Transcript, show a floating toolbar near the selection. The toolbar displays the selected character count and a prominent **高光** action.

Choosing **高光**:

- creates a user highlight from the selected text;
- associates the nearest video timestamp when available;
- clears the browser selection and closes the toolbar;
- makes the new item visible under **我的高光** in the Highlight Notes tab.

For this frontend slice, user highlights live only in component/session memory. Selection outside the two supported content surfaces must not create the toolbar. Share or explain actions are optional prototype affordances; one-click highlight is required to work.

## Tab 3: 高光笔记

AI-generated highlights and user-created highlights are separate concepts and must remain visually and semantically distinguishable.

The tab provides filters for **全部**, **AI 高光**, and **我的高光**:

- AI highlight cards use mock analysis data and may show topic/title, note, timestamp, and importance score.
- User highlight cards show the selected text, character count, and nearest timestamp when available.
- A newly created user highlight appears immediately without a backend request.

## Shared Interaction Contract

- Opening Video restores `feedId` and `entryId` from the URL without automatically marking the video watched.
- Selecting a video updates stable query parameters while keeping the list mounted.
- Video cards follow the existing Clip rhythm: title, preview, cover, source, and time, with video-specific duration and states layered on top.
- Processing states include metadata, transcript, analysis, ready, no-transcript, and failed.
- Adding a mock video or channel changes only in-memory frontend state and shows explicit prototype feedback.
- Knowledge-base capture, copy, export, and regeneration remain prototype actions unless separately implemented.

## Frontend Data Boundary

Reusable video types and mock data belong under `apps/web/src/lib/`. List items and details stay separate so a future list API does not need to return full transcripts. The mock detail shape may include quick-judgment content, chapter/theme summaries, transcript segments, and AI highlights.

No persistence contract is established for user highlights in this phase. Backend field names and API routes must not be inferred from temporary component state.

## File Boundary

Allowed changes for this slice:

- `apps/web/src/components/video/**`
- `apps/web/src/lib/video-*`
- `apps/web/src/app/(app)/feeds/page.tsx` for small route delegation
- `apps/web/src/components/shell/Sidebar.tsx` for enabling Video and mock drawer sources
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

With mock data, a user can open Video, select a video, read its title before the player, play a complete sample video, expand/collapse the four-part AI quick judgment, switch only among Full Summary/Transcript/Highlight Notes, change summary mode, expand section originals, seek by timestamp, select text in summary or transcript, save it with one click, and find it separately from AI highlights. Light and dark themes continue to use existing tokens.
