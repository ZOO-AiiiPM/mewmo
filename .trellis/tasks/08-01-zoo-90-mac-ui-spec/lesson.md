# Lessons: ZOO-90 Mac Web UI 对照规范

This file captures raw observations from this task. Keep evidence and uncertainty visible; a later curation pass promotes durable guidance into `.trellis/spec/`.

## Observations

- dark/light workspace tokens in globals.css:30-90 already neutral gray; the only warm yellow/beige/cream is `--auth-*` (globals.css:116-163), excluded for Mac. Light gray list asserted.
- notes/page.tsx just renders `NoteEditorPage notes={[]}` (5 lines): notes page's empty/seeded state is driven by serverless client fetch; selectedSlug is per-page state.
- clips list has per-card fetchStatus queued/fetching/error rendering (clips/page.tsx:441-446) — richer than notes.
- feeds/[id] is a redirect compat to `/feeds?type&feedId`; feed entries live in feeds page + feed-entries/[id] detail, not a standalone feed-entries/page.tsx.
- shell 3-col grid at globals.css:666; list+reader workspace grid 312px at :1546; sidebar sticky bg blur at :901.
- AI rail excluded (AISidebar, mewmo-ai-*, /mew, /chat, /today) from Mac v1.
- Tab strip + grayscale light are Apple enhancements; tab restore is account-scoped + tolerant (unavailable placeholder).
