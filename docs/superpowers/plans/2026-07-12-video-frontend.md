# Video Subscription Frontend Implementation Plan

> Date: 2026-07-12
> Depends on: `docs/superpowers/specs/2026-07-12-video-frontend-design.md`

## 1. Contract and Tests

- Add video frontend types and mock-data expectations.
- Add a static test that protects the file boundary and verifies Video is enabled while Podcast remains deferred.

## 2. Video Workspace

- Add a dedicated `VideoWorkspace` component.
- Add cover-first list cards, processing badges, and route-based selection.
- Add a reader with a simulated player and Overview/Chapters/Transcript tabs.

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
