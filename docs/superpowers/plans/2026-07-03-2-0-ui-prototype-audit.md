# UI Prototype Audit

## Buttons and Controls

- Sidebar collapse: top-right sidebar icon toggles a fully collapsed 18px rail; collapsed state uses a left-edge peek reveal rather than keeping the full panel in layout.
- Group collapse: top bar has a global expand/collapse-groups button; each group row has its own chevron and row action affordance where applicable.
- List search: list toolbar search expands over the whole toolbar with a clipped reveal, focuses the field, closes on Escape or outside click, and hides the trigger while open.
- New note: primary list toolbar action is an icon button with a short pulse feedback; it is hidden on Today, pinned, and feed views.
- Clip URL input: Clips replace the new-note action with an add button that expands into an inline URL field using the same clipped reveal as search.
- Reader focus/list collapse: reader toolbar includes previous/next, centered title on scroll, list-collapse/focus control, and more/action buttons.
- Reader more menu: toolbar uses lightweight popover menus instead of modal surfaces for quick actions.
- AI open/close: AI opens as a right rail from a fixed edge tab; the rail slides in without text reflow and closes back to the edge tab.
- Back to top: fixed button appears only after scrolling enough, aligns under the AI edge tab, and shifts left when AI rail is open.

## Animations

- Sidebar collapse/peek: grid columns animate in roughly .32s; collapsed sidebar becomes fixed, transparent, and peeks with opacity/translate on edge hover.
- Group height animation: nav groups collapse by animating height and opacity, while chevrons rotate; abrupt display toggles are avoided.
- Drawer push: Knowledge Base and subscription source panes use push-style slide transitions with old content sliding left and new content sliding in from the right.
- List search expansion: search uses `clip-path` reveal with the trigger scaling/fading out; position is stable because button slots keep their footprint.
- Clip URL input expansion: clip URL field mirrors search expansion and hides the search/add conflict affordance while active.
- AI rail entry: rail is fixed, translated from the right, and opacity-faded while the grid reserves rail width so reading content moves as one surface.
- Toast: top-center toast fades/slides down, supports spinner loading state, and is non-interactive.
- Menu scale/fade: row, list-title, feed category, and account menus use scale plus fade transitions with rounded floating panels.

## Menus, Modals, Toasts

- Row menu: hover-revealed three-dot row actions stay visible while their menu is open and use a small fixed floating menu.
- List title menu: title dropdown includes sort, quick jump, and nested feed/article/media/pdf/book targets; deferred quick jumps show toast instead of navigating.
- Account menu: footer opens a popover with theme color, appearance mode, font/size, help, import/export, logout, and sync status.
- Modal shell: centered modal shell uses scrim, rounded panel, shared header/body/footer structure, and compact fields for add/edit flows.
- Toast states: success and error have icons; loading uses a spinner and should be replaceable instead of stacking repeated messages.

## Deferred Entries

- PDF: visible in collection group as disabled/deferred and quick-jump guarded by toast.
- Books: visible in collection group as disabled/deferred and quick-jump guarded by toast.
- Video: visible in subscription group as disabled/deferred.
- Podcast: visible in subscription group as disabled/deferred.
- Knowledge Base: visible as IA shell with drawer direction, but dogfood implementation should be honest if not connected.
- Import/export: visible in account menu, but should be disabled or toast-gated until connected.

## Implementation Priorities

- Must implement in first UI pass: four-surface shell, grouped sidebar IA, collapse/peek affordance, row/list floating menu primitives, list toolbar search and clip URL expansion, reader toolbar shell, top-center toast, destructive confirm shell, AI contextual rail, disabled deferred entries, compact list cards for notes/clips/feeds.
- Can defer with honest disabled UI: PDF/books shelves and readers, video/podcast feeds, full Knowledge Base drawer data, import/export workflows, AI streaming/proactive behavior, AI rail resizing, cat ambient animation, full tag management.
