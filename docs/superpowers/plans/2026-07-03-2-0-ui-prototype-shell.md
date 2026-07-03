# 2.0 UI Prototype Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Web app shell so it follows the high-fidelity prototype's navigation, list, reader, menu, toast, and AI rail interaction model.

**Architecture:** UI work must translate prototype behavior into React components and small client-side state helpers. It must not implement backend persistence, Prisma schema, worker logic, or sync internals. Data must flow through typed props or existing API adapters so Content/RSS/Sync agents can wire real data independently.

**Tech Stack:** Next.js App Router, React 19, TypeScript 6, Tailwind 4, `@tanstack/react-virtual`, `@mewmo/ui`, existing Crepe editor.

---

## File Structure

- Modify `apps/web/src/components/shell/Sidebar.tsx`: grouped navigation, collapse/peek affordance, row action menu hooks, account footer.
- Modify `apps/web/src/components/shell/TopBar.tsx`: evolve into list/reader toolbar primitives or split into focused components.
- Modify `apps/web/src/components/shell/AISidebar.tsx`: contextual side rail shell.
- Create `apps/web/src/components/shell/AppShell.tsx`: shared four-surface layout for signed-in routes if it reduces duplication.
- Create `apps/web/src/components/shell/ListColumn.tsx`: title dropdown, search expansion, action slot, virtual list container.
- Create `apps/web/src/components/shell/ReaderToolbar.tsx`: previous/next, centered title, focus/list-collapse, more menu.
- Create `apps/web/src/components/ui/ToastProvider.tsx`: top-center success/loading/error toast state.
- Create `apps/web/src/components/ui/FloatingMenu.tsx`: row/menu primitive used by sidebar/list/reader more menus.
- Create `apps/web/src/components/ui/ConfirmDialog.tsx`: destructive action confirmation.
- Modify `apps/web/src/app/(app)/layout.tsx`: use the new shell.
- Modify `apps/web/src/app/(app)/notes/page.tsx`, `clips/page.tsx`, `feeds/page.tsx`, `feeds/[id]/page.tsx`: consume shell/list components without changing persistence logic.
- Modify `apps/web/src/app/globals.css`: add prototype-aligned tokens, layout classes, motion rules, and reduced-motion handling.

## Task 0: Prototype Audit

**Files:**
- Read: `docs/prototypes/notes-home.html`
- Read: `docs/superpowers/specs/2026-07-03-2-0-e-abc-sync-control.md`
- Create: `docs/superpowers/plans/2026-07-03-2-0-ui-prototype-audit.md`

- [ ] **Step 1: Read the prototype before editing app code**

Read `docs/prototypes/notes-home.html` directly. Do not rely only on the spec summary.

- [ ] **Step 2: Write the audit checklist**

Create `docs/superpowers/plans/2026-07-03-2-0-ui-prototype-audit.md` with this exact structure and fill every section with concrete findings from the prototype:

```md
# UI Prototype Audit

## Buttons and Controls

- Sidebar collapse:
- Group collapse:
- List search:
- New note:
- Clip URL input:
- Reader focus/list collapse:
- Reader more menu:
- AI open/close:
- Back to top:

## Animations

- Sidebar collapse/peek:
- Group height animation:
- Drawer push:
- List search expansion:
- Clip URL input expansion:
- AI rail entry:
- Toast:
- Menu scale/fade:

## Menus, Modals, Toasts

- Row menu:
- List title menu:
- Account menu:
- Modal shell:
- Toast states:

## Deferred Entries

- PDF:
- Books:
- Video:
- Podcast:
- Knowledge Base:
- Import/export:

## Implementation Priorities

- Must implement in first UI pass:
- Can defer with honest disabled UI:
```

- [ ] **Step 3: Commit audit**

Run:

```bash
git add docs/superpowers/plans/2026-07-03-2-0-ui-prototype-audit.md
git commit -m "docs: audit 2.0 prototype interactions"
```

## Task 1: Shell State and Layout

**Files:**
- Create: `apps/web/src/components/shell/AppShell.tsx`
- Modify: `apps/web/src/app/(app)/layout.tsx`
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Create shell state component**

Implement `AppShell.tsx` with `sidebarCollapsed`, `sidebarPeek`, `listCollapsed`, and `aiOpen` state. It should render Sidebar, main content, and AISidebar through slots:

```tsx
"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { AISidebar } from "./AISidebar";
import { Sidebar } from "./Sidebar";

interface AppShellProps {
  children: ReactNode;
  user?: { name?: string | null; email?: string | null; image?: string | null };
}

export function AppShell({ children, user }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarPeek, setSidebarPeek] = useState(false);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  return (
    <div
      className={[
        "mewmo-shell",
        sidebarCollapsed ? "mewmo-shell--sidebar-collapsed" : "",
        sidebarPeek ? "mewmo-shell--sidebar-peek" : "",
        listCollapsed ? "mewmo-shell--list-collapsed" : "",
        aiOpen ? "mewmo-shell--ai-open" : "",
      ].join(" ")}
      onMouseMove={(event) => {
        if (sidebarCollapsed && event.clientX <= 12) setSidebarPeek(true);
      }}
    >
      <Sidebar
        user={user}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
        onMouseLeave={() => {
          if (sidebarCollapsed) setSidebarPeek(false);
        }}
      />
      <main className="mewmo-shell__main">{children}</main>
      <AISidebar open={aiOpen} onOpenChange={setAiOpen} />
      {!aiOpen && (
        <button className="mewmo-ai-fab" onClick={() => setAiOpen(true)} aria-label="Open AI rail">
          AI
        </button>
      )}
    </div>
  );
}
```

If `listCollapsed` cannot be wired from child route pages cleanly in this step, keep the state local to reader pages in a later task.

- [ ] **Step 2: Wire layout**

Change `apps/web/src/app/(app)/layout.tsx` to render `<AppShell user={session.user}>{children}</AppShell>`.

- [ ] **Step 3: Add shell CSS**

Add grid classes to `globals.css`:

```css
.mewmo-shell {
  --sidebar-w: 206px;
  --ai-w: 320px;
  display: grid;
  min-height: 100vh;
  grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
  background: var(--color-paper);
}

.mewmo-shell--ai-open {
  grid-template-columns: var(--sidebar-w) minmax(0, 1fr) var(--ai-w);
}

.mewmo-shell--sidebar-collapsed {
  --sidebar-w: 18px;
}

.mewmo-shell__main {
  min-width: 0;
  min-height: 100vh;
}

.mewmo-ai-fab {
  position: fixed;
  right: 0;
  bottom: 80px;
  z-index: 40;
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.001ms !important;
    transition-duration: 0.001ms !important;
  }
}
```

- [ ] **Step 4: Verify route rendering**

Run:

```bash
pnpm --filter @mewmo/web lint
pnpm --filter @mewmo/web build
```

Expected: both pass.

## Task 2: Sidebar IA and Deferred Entries

**Files:**
- Modify: `apps/web/src/components/shell/Sidebar.tsx`
- Create: `apps/web/src/components/ui/FloatingMenu.tsx`

- [ ] **Step 1: Replace flat nav with grouped nav**

Implement groups for Home, Today, Collection, Subscription, Knowledge Base, Tags, and Trash. Use disabled buttons for PDF, Books, Video, and Podcast. Disabled entries must show a short inline label such as `Later`.

- [ ] **Step 2: Add group collapse**

Each group with children maintains collapsed state. Use CSS height transition or a measured-height helper. Do not use abrupt `display: none` for the main group animation.

- [ ] **Step 3: Add row menu primitive**

Create `FloatingMenu.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";

export function FloatingMenu({
  open,
  children,
}: {
  open: boolean;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="rounded-md border border-line bg-paper-2 shadow-float p-1 text-sm text-ink">
      {children}
    </div>
  );
}
```

Use it for sidebar row actions. Full positioning can be improved later, but row action buttons must remain visible while the menu is open.

- [ ] **Step 4: Verify visual basics**

Run `pnpm --filter @mewmo/web lint`. Then open `/notes` and verify the grouped sidebar appears.

## Task 3: List Column and Reader Toolbar Primitives

**Files:**
- Create: `apps/web/src/components/shell/ListColumn.tsx`
- Create: `apps/web/src/components/shell/ReaderToolbar.tsx`
- Modify: `apps/web/src/app/(app)/notes/page.tsx`
- Modify: `apps/web/src/app/(app)/clips/page.tsx`
- Modify: `apps/web/src/app/(app)/feeds/page.tsx`

- [ ] **Step 1: Implement ListColumn**

Create a component with title button, inline search expansion, action slot, and body slot:

```tsx
"use client";

import type { ReactNode } from "react";
import { useState } from "react";

export function ListColumn({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <section className="flex h-screen w-full max-w-[340px] flex-col border-r border-line bg-paper-2">
      <div className="relative flex h-14 items-center gap-2 px-3">
        <button className="rounded-md px-2 py-1 text-sm font-medium text-ink hover:bg-paper">
          {title}
        </button>
        <div className="flex-1" />
        {action}
        <button
          onClick={() => setSearchOpen(true)}
          className="h-8 w-8 rounded-md text-muted hover:bg-paper hover:text-ink"
          aria-label="Search list"
        >
          S
        </button>
        {searchOpen && (
          <div className="absolute inset-0 flex items-center bg-paper-2 px-3">
            <input
              autoFocus
              className="w-full rounded-md border border-line bg-paper px-3 py-2 text-sm outline-none"
              placeholder="Search..."
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearchOpen(false);
              }}
              onBlur={() => setSearchOpen(false)}
            />
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}
```

- [ ] **Step 2: Implement ReaderToolbar**

Create previous/next, centered title, focus button, and more button slots.

- [ ] **Step 3: Use primitives on Notes, Clips, and Feeds**

Wrap each primary page in a two-column route-level layout: `<ListColumn>` plus reader/detail content where applicable. If a route currently only has a list, it should still use `ListColumn` for toolbar consistency.

- [ ] **Step 4: Verify desktop/tablet layout**

Run the web dev server and inspect `/notes`, `/clips`, `/feeds` at desktop width and tablet width. Text must not overlap controls.

## Task 4: Toast, Confirm, and Honest Deferred UI

**Files:**
- Create: `apps/web/src/components/ui/ToastProvider.tsx`
- Create: `apps/web/src/components/ui/ConfirmDialog.tsx`
- Modify: `apps/web/src/app/(app)/layout.tsx`
- Modify: pages/components using delete or disabled actions.

- [ ] **Step 1: Implement ToastProvider**

Provide `showToast(text, type)` through context. Types: `success`, `loading`, `error`.

- [ ] **Step 2: Implement ConfirmDialog**

Use it for destructive note/clip/feed deletes instead of direct `confirm()` where touched.

- [ ] **Step 3: Wire disabled deferred entries**

Clicking PDF, Books, Video, Podcast, and deferred Knowledge Base should show a toast such as `This area is not connected in the dogfood slice yet.` It must not navigate to fake pages.

- [ ] **Step 4: Verify**

Run:

```bash
pnpm --filter @mewmo/web lint
pnpm --filter @mewmo/web build
```

Expected: PASS.

## Task 5: UI Handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-07-03-2-0-ui-prototype-audit.md`

- [ ] **Step 1: Add implementation status**

Append:

```md
## Implementation Status

- Shell/layout:
- Sidebar IA:
- List toolbar/search:
- Reader toolbar:
- Toast/menu/modal:
- AI rail:
- Deferred entries:
- Browser checks:
```

- [ ] **Step 2: Commit UI work**

Run:

```bash
git add apps/web/src/components apps/web/src/app apps/web/src/app/globals.css docs/superpowers/plans/2026-07-03-2-0-ui-prototype-audit.md
git commit -m "feat(web): align app shell with 2.0 prototype"
```

