# Web Frontend - Agent 3 Design

> Date: 2026-06-25
> Status: Draft for review
> Branch: `2.0`
> Scope: `apps/web/` and `packages/ui/`
> Source task: `docs/03-agent-tasks.md` Agent 3

---

## 1. Goal

Agent 3 builds the complete web frontend scaffold for mewmo 2.0: all requested routes, the signed-in app shell, shared UI primitives, theme switching, a note editor surface with two selectable editor strategies, and virtualized mock lists for notes, clips, and RSS entries.

This phase does not connect to the database or Auth.js session state. It creates stable UI boundaries and mock data contracts so Agent 2 and Agent 4 can wire real services into predictable surfaces later.

---

## 2. Product Shape

mewmo 2.0 is a focused web workspace for collecting, reading, writing, and reviewing knowledge with an AI side panel always nearby. The interface should feel like a daily workbench: dense enough for repeated use, quiet enough for long reading and writing sessions, and clearly different from a generic SaaS landing page.

The first viewport after login is an application, not marketing. The marketing route exists because the task requires it, but the primary implementation effort goes into the app shell and content workflows.

---

## 3. Architecture

`apps/web` owns routes, layouts, mock data, app-level state, and feature-specific components. `packages/ui` owns reusable, low-level UI primitives that do not know about notes, clips, feeds, or AI.

The web app is organized around three layers:

1. Route files in `apps/web/src/app/` stay thin. They assemble page-level components and metadata.
2. Feature components in `apps/web/src/components/` own app shell, editor, virtual lists, and page sections.
3. Data helpers in `apps/web/src/lib/` own navigation definitions, mock records, theme/editor-mode constants, and small utilities.

This keeps future service integration local: replacing mock notes with repository/API calls should not require rewriting list rendering, navigation, or UI primitives.

---

## 4. Route Structure

Create the exact route groups from the task document:

```text
apps/web/src/app/
|-- (marketing)/page.tsx
|-- (auth)/login/page.tsx
|-- (auth)/register/page.tsx
|-- (app)/layout.tsx
|-- (app)/notes/page.tsx
|-- (app)/notes/[slug]/page.tsx
|-- (app)/clips/page.tsx
|-- (app)/clips/[id]/page.tsx
|-- (app)/feeds/page.tsx
|-- (app)/feeds/[id]/page.tsx
|-- (app)/chat/page.tsx
`-- (app)/settings/page.tsx
```

The root `/` route is the marketing page. `/login` and `/register` are lightweight auth pages with form controls only; real Auth.js integration belongs to the data/auth agent. All `(app)` routes render inside the signed-in layout with sidebar, top bar, main content, and AI sidebar.

Every route must render meaningful mock content so route verification catches missing pages. Empty placeholder pages do not satisfy the task.

---

## 5. App Shell

The signed-in layout uses a three-region shell:

```text
+-------------+--------------------------------------+---------------+
| Sidebar     | TopBar                               | AI sidebar    |
|             +--------------------------------------+               |
| nav zones   | Page content                         | context/chat  |
|             | lists / editor / settings / chat     | collapsible   |
+-------------+--------------------------------------+---------------+
```

`Sidebar` contains the primary zones: Notes, Clips, RSS, AI, Settings. It also includes a compact brand mark and a small workspace status area. `TopBar` includes page title, search input, theme toggle, editor-mode indicator where relevant, and a primary action button. `AISidebar` is visible on desktop, collapsible, and shows mock context cards plus a small prompt input.

The shell must work at desktop and tablet widths. At tablet width, the AI sidebar can collapse by default and the main content should keep usable width rather than forcing horizontal scrolling.

---

## 6. UI System

`packages/ui` exports these primitives:

- `Button`
- `Input`
- `Textarea`
- `Select`
- `Dialog`
- `Toast`
- `Dropdown`
- `Modal`
- `Card`
- `Badge`
- `Spinner`

Each primitive accepts normal React props, has a small variant API where useful, and uses class names that support both light and dark mode. Components stay unopinionated: a `Button` may know `variant="primary"`, but it does not know about creating notes.

The styling model uses CSS variables defined in `apps/web/src/app/globals.css`, with Tailwind utility classes consuming those variables. `dark:` classes are required for components where variable-only styling is not enough.

---

## 7. Visual Direction

The palette should avoid the common monochrome SaaS look while staying practical for a knowledge workspace.

- `paper`: `#f8f6f1` for the light app background
- `ink`: `#1f2523` for primary text
- `mist`: `#e8e3da` for borders and quiet panels
- `moss`: `#2f6f5f` for primary actions and active navigation
- `coral`: `#c65f4a` for warnings, highlights, and feed freshness
- `night`: `#121513` for dark background

Typography uses system fonts for reliability at this scaffold stage, but the hierarchy should feel deliberate: compact headings, readable body copy, and small utility labels. Do not use oversized hero type inside the app shell. The marketing page may use a larger headline, but it must leave a hint of product UI below the fold.

The signature visual element is a persistent "context rail" in the AI sidebar: small stacked cards showing what the assistant can currently see, such as the active note, selected tags, or unread feed count. This ties the visual design to mewmo's AI-assisted review concept without adding decorative graphics.

---

## 8. Theme Behavior

Theme modes are:

- `system`
- `light`
- `dark`

The setting can live in client state plus `localStorage` for this phase. The root document receives a `dark` class when dark mode is active. The settings page exposes the same control so theme behavior is not hidden in the top bar only.

The implementation must verify both light and dark appearances. A route that is readable in only one theme is incomplete.

---

## 9. Editor Design

The note editor page supports two editor strategies:

1. `atomic`: the primary option using `@atomic-editor/editor`.
2. `codemirror`: the fallback option using CodeMirror 6 plus a live preview pane.

The user can switch strategies from the editor page or settings. Because this scaffold does not yet persist user settings on the server, the selected strategy can use local state or `localStorage`.

If `@atomic-editor/editor` is unavailable or incompatible during installation, the implementation must keep the `atomic` strategy boundary and render a clear local fallback editor instead of pretending the real editor is integrated. The verification notes must state the fallback honestly.

The editor page renders mock note metadata, a title input, the editor surface, a preview or status area, and save/sync affordances. It must accept markdown input and show rendered or previewed text in the same page.

---

## 10. Virtualized Lists

Use `@tanstack/virtual` for:

- notes list at `/notes`
- clips list at `/clips`
- RSS entry list at `/feeds/[id]`

Each list uses at least 1000 mock records so virtualization is observable. Rows must have stable heights or estimated sizes to prevent layout jumps. The list component should be generic enough to reuse for the three content types while keeping row rendering feature-specific.

The feed source list at `/feeds` can be a normal responsive list because the task specifically calls out article list virtualization, not source list virtualization.

---

## 11. Mock Data Contracts

Mock data lives in `apps/web/src/lib/mock-data.ts`. It defines typed records for:

- `MockNote`
- `MockClip`
- `MockFeed`
- `MockFeedEntry`
- `MockChatMessage`

The shapes should resemble Agent 2's planned schema: ids, titles, content/summary, timestamps, tags where relevant, and user-facing status fields. These are not shared database types yet; they are UI contracts for scaffold rendering.

Mock generators must be deterministic so tests can assert counts and route content without random failures.

---

## 12. Testing Strategy

Testing starts before implementation. The first tests cover stable contracts rather than visual snapshots:

- route manifest contains every Agent 3 route
- sidebar navigation contains Notes, Clips, RSS, AI, and Settings with correct hrefs
- `packages/ui` exports all required primitive component names
- mock data generators produce at least 1000 notes, clips, and feed entries
- editor strategy list contains `atomic` and `codemirror`

These tests should fail before the implementation exists, then pass after the minimal code is added. UI rendering and browser behavior are verified with lint/build plus manual browser checks because the current scaffold does not yet include a full React testing setup.

---

## 13. Verification

Required verification after implementation:

1. `pnpm test`
2. `pnpm lint`
3. `pnpm --filter @mewmo/web build` if lint and tests pass
4. Local browser smoke test:
   - visit `/`, `/login`, `/register`, `/notes`, `/notes/example-note`, `/clips`, `/clips/example-clip`, `/feeds`, `/feeds/example-feed`, `/chat`, `/settings`
   - switch light/dark/system theme
   - type markdown into the editor and confirm preview/status updates
   - scroll the 1000-row notes, clips, and feed-entry lists
   - resize to tablet width and confirm shell remains usable

If any external package cannot be installed or loaded, the implementation must record the exact fallback in the final report.

---

## 14. Out of Scope

This Agent 3 task does not implement real authentication, database reads/writes, API routes, queue jobs, AI model streaming, or persistent server-side settings. Those belong to Agent 2 and Agent 4. Agent 3 creates the UI surfaces and contracts those later agents can connect to.
