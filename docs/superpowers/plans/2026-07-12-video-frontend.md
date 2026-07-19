# Video Subscription Frontend Implementation Plan

> Date: 2026-07-12
> Depends on: `docs/superpowers/specs/2026-07-12-video-frontend-design.md`

## 1. Contract and Tests

- Add video frontend types and mock-data expectations.
- Add a static test that protects the file boundary and verifies Video is enabled while Podcast remains deferred.

## 2. Video Workspace

- Add a dedicated `VideoWorkspace` component.
- Add cover-first list cards with a subscription-style unread dot, stable video preview, and route-based selection.
- Keep read state separate from watch progress, and clear unread state optimistically on selection.
- Add a reader with a complete player, an AI-reading teaser, and Transcript/Highlight Notes tabs.
- Preserve the original platform description below the player and use the shared colored Mewmo tag interaction; raw platform tags stay hidden as optional AI suggestion input.
- Remove redundant mark-watched and processing-status fields from the reader chrome.
- Put vertically stacked AI quick judgment and Full Summary in the right AI rail, with timestamp seek and View Transcript handoff to the center reader.
- Put low-frequency video actions in the reader toolbar overflow menu so tab content starts immediately below the tab bar.

## 3. Add Flow

- Add a modal with Single Video and Subscribe Channel modes.
- Keep all mutations in local component state and label feedback as prototype behavior.

## 4. Minimal Integration

- Delegate `/feeds?type=video` to the video workspace before mounting Article/Media hooks.
- Enable Video in both feed-type registries.
- Supply mock video sources to the sidebar drawer without changing feed APIs.

## 5. Verification

- Run the targeted static test.
- Run relevant workspace UI tests and Web lint.
- Review the diff to confirm no backend/schema files changed.
