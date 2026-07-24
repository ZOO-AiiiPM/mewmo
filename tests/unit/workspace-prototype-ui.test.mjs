import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

const matchIndex = (source, pattern) => {
  const match = source.match(pattern);
  return match?.index ?? -1;
};

test("notes and clips shell uses prototype icon component instead of text glyph controls", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
  const listColumn = read("apps/web/src/components/shell/ListColumn.tsx");
  const readerToolbar = read("apps/web/src/components/shell/ReaderToolbar.tsx");
  const prototypeIcon = read("apps/web/src/components/shell/PrototypeIcon.tsx");

  for (const source of [sidebar, listColumn, readerToolbar]) {
    assert.match(
      source,
      /PrototypeIcon/,
      "shell controls should render the baked prototype icon set",
    );
  }

  assert.doesNotMatch(
    sidebar,
    /function NavIcon/,
    "sidebar must not keep the handwritten svg switch",
  );
  assert.doesNotMatch(
    listColumn,
    />\+<|>\/<|>→</,
    "list column must not use text characters as icons",
  );
  assert.doesNotMatch(
    readerToolbar,
    />‹<|>›<|>···|>⊞<|>⊟</,
    "reader toolbar must not use text characters as icons",
  );
  assert.match(
    prototypeIcon,
    /PROTOTYPE_LINE_ICONS/,
    "prototype icons should be copied from the baked notes-home line icon dictionary",
  );
  assert.match(
    prototypeIcon,
    /PROTOTYPE_FILL_ICONS/,
    "prototype icons should be copied from the baked notes-home fill icon dictionary",
  );
  assert.match(
    prototypeIcon,
    /PROTOTYPE_ACTION_ICONS/,
    "prototype action menu icons should be copied from the notes-home ICN dictionary",
  );
  assert.match(
    prototypeIcon,
    /dangerouslySetInnerHTML/,
    "prototype icons should render the baked SVG strings instead of hand-drawn JSX",
  );
  assert.doesNotMatch(
    prototypeIcon,
    /strokeProps|function renderLineIcon|function renderFilledIcon/,
    "prototype icon component must not keep a handwritten SVG switch",
  );
});

test("close affordances use the thin unwrapped Solar-style cross", () => {
  const prototypeIcon = read("apps/web/src/components/shell/PrototypeIcon.tsx");
  const closeIcons = prototypeIcon
    .split("\n")
    .filter((line) => line.trim().startsWith('"close":'))
    .map((line) => line.trim());

  assert.ok(closeIcons.length >= 2, "both line and filled icon dictionaries should define close");
  assert.ok(
    closeIcons.every((svg) => svg.includes('fill=\\"none\\"')),
    "close affordances should be unwrapped line icons",
  );
  assert.ok(
    closeIcons.every((svg) => svg.includes('stroke-width=\\"1.7\\"')),
    "close affordances should use the Solar-like 1.7px stroke",
  );
  assert.ok(
    closeIcons.every((svg) => svg.includes('d=\\"M18 6 6 18M6 6l12 12\\"')),
    "close affordances should use a direct cross path without a wrapper shape",
  );
  assert.ok(
    closeIcons.every((svg) => !svg.includes("<circle") && !svg.includes("<rect")),
    "close affordances should not have a circle or diamond wrapper",
  );
  assert.doesNotMatch(
    prototypeIcon,
    /"close":[\s\S]*stroke-width=\\"2\.3\\"/,
    "close affordances should not use the previous thick hand-drawn cross",
  );
});

test("shell chrome uses the exact prototype-baked header and reader icons", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
  const readerToolbar = read("apps/web/src/components/shell/ReaderToolbar.tsx");
  const prototypeIcon = read("apps/web/src/components/shell/PrototypeIcon.tsx");
  const css = read("apps/web/src/app/globals.css");

  assert.match(
    prototypeIcon,
    /PROTOTYPE_CHROME_ICONS/,
    "special shell chrome icons should live in the baked prototype icon dictionary",
  );
  assert.match(
    prototypeIcon,
    /mewmo-logo[\s\S]*M7 11 4 5l6 2\.5/,
    "brand logo should copy the prototype cat head SVG",
  );
  assert.doesNotMatch(
    prototypeIcon,
    /export function MewmoLogo[\s\S]*<svg/,
    "brand logo must not be a hand-authored JSX svg",
  );
  assert.match(
    sidebar,
    /<PrototypeIcon name="mewmo-logo"/,
    "sidebar brand should render the baked cat logo through PrototypeIcon",
  );
  assert.match(
    sidebar,
    /name=\{allCollapsed \? "groups-expand" : "groups-collapse"\}/,
    "global group toggle should use the prototype paired chevron icon",
  );
  assert.match(
    sidebar,
    /name=\{collapsed \? "sidebar-expand" : "sidebar-collapse"\}/,
    "sidebar collapse button should use the prototype sidebar-panel icon",
  );
  assert.match(
    readerToolbar,
    /name=\{listCollapsed \? "fullscreen-contract" : "fullscreen-expand"\}/,
    "reader list toggle should use the prototype four-corner expand icons",
  );
  assert.match(
    prototypeIcon,
    /"more-vertical":\s*"<svg[\s\S]*?<circle cx=\\"12\\" cy=\\"5\\" r=\\"1\.7\\"/,
    "reader more icon should be vertical dots, not horizontal dots",
  );
  assert.match(
    css,
    /\.mewmo-sidebar__logo\s*\{[\s\S]*background:\s*transparent[\s\S]*color:\s*var\(--ink\)/,
    "brand logo should be the unboxed ink-colored prototype cat",
  );
});

test("destructive menu rows keep the prototype red ink through hover overrides", () => {
  const css = read("apps/web/src/app/globals.css");

  const cardHoverIndex = matchIndex(css, /\.mewmo-card-menu__item:hover\s*\{[\s\S]*?background:\s*var\(--hover\)[\s\S]*?\}/);
  const cardDangerHoverIndex = matchIndex(
    css,
    /\.mewmo-card-menu__item\.mewmo-card-menu__item--danger:hover[\s\S]*?\{[\s\S]*?color:\s*#f87171[\s\S]*?\}/,
  );
  assert.ok(cardHoverIndex >= 0, "card menu should keep the prototype hover background");
  assert.ok(
    cardDangerHoverIndex > cardHoverIndex,
    "destructive card menu rows should override normal hover color after the generic hover rule",
  );
  assert.match(
    css,
    /\.mewmo-card-menu__item\.mewmo-card-menu__item--danger:hover\s+\.mewmo-card-menu__icon[\s\S]*?\{[\s\S]*?color:\s*#f87171/,
    "destructive card menu icons should stay red on hover",
  );

  const readerHoverIndex = matchIndex(
    css,
    /\.mewmo-reader-menu\s+\.mewmo-card-menu__item:hover\s*\{[\s\S]*?color:\s*var\(--ink\)[\s\S]*?\}/,
  );
  const readerDangerHoverIndex = matchIndex(
    css,
    /\.mewmo-reader-menu\s+\.mewmo-card-menu__item\.mewmo-card-menu__item--danger:hover[\s\S]*?\{[\s\S]*?color:\s*#f87171[\s\S]*?\}/,
  );
  assert.ok(readerHoverIndex >= 0, "reader toolbar menu should define its normal hover ink");
  assert.ok(
    readerDangerHoverIndex > readerHoverIndex,
    "reader toolbar delete rows should override normal hover ink with red",
  );
  assert.match(
    css,
    /\.mewmo-reader-menu\s+\.mewmo-card-menu__item\.mewmo-card-menu__item--danger:hover\s+\.mewmo-card-menu__icon[\s\S]*?\{[\s\S]*?color:\s*#f87171/,
    "reader toolbar delete icons should stay red on hover",
  );
});

test("markdown prose rendering follows the active accent theme", () => {
  const css = read("apps/web/src/app/globals.css");

  assert.match(
    css,
    /\.mewmo-clip-prose\s*\{[\s\S]*?--md-accent:\s*var\(--accent\)[\s\S]*?--md-surface:\s*color-mix\(in srgb, var\(--md-accent\)/,
    "markdown prose should derive local rendering colors from the active accent",
  );
  assert.match(
    css,
    /\.mewmo-clip-prose a\s*\{[\s\S]*?color:\s*var\(--md-accent\)/,
    "markdown links should use the active accent",
  );
  assert.match(
    css,
    /\.mewmo-clip-prose code\s*\{[\s\S]*?background:\s*var\(--md-surface\)[\s\S]*?color:\s*var\(--md-code-ink\)/,
    "markdown inline code should use accent-aware surfaces and ink",
  );
  assert.match(
    css,
    /\.mewmo-clip-prose pre\s*\{[\s\S]*?border:\s*1px solid var\(--md-line\)[\s\S]*?background:\s*var\(--md-surface\)/,
    "markdown code blocks should use accent-aware border and background",
  );
  assert.match(
    css,
    /\.mewmo-clip-prose blockquote\s*\{[\s\S]*?border-left:\s*3px solid var\(--md-accent\)[\s\S]*?background:\s*var\(--md-wash\)/,
    "markdown blockquotes should use accent-aware chrome",
  );
  assert.match(
    css,
    /\.mewmo-clip-prose th,\n\.mewmo-clip-prose td\s*\{[\s\S]*?border:\s*1px solid var\(--md-line\)/,
    "markdown tables should use accent-aware grid lines",
  );
  assert.match(
    css,
    /\.mewmo-clip-prose th\s*\{[\s\S]*?background:\s*var\(--md-surface-strong\)/,
    "markdown table headers should use an accent-aware surface",
  );
  assert.match(
    css,
    /\.mewmo-clip-prose li::marker\s*\{[\s\S]*?color:\s*color-mix\(in srgb, var\(--md-accent\)/,
    "markdown list markers should be tinted by the active accent",
  );
});

test("notes and clips list cards expose prototype actions, search, and pinned state", () => {
  const sharedList = read("apps/web/src/components/shell/ListColumn.tsx");
  const clipsIndex = read("apps/web/src/app/(app)/clips/page.tsx");
  const clipDetail = read(
    "apps/web/src/app/(app)/clips/[id]/ClipDetailClient.tsx",
  );
  const notesIndex = read("apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx");
  const noteDetail = read(
    "apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx",
  );
  const cardActionMenu = read(
    "apps/web/src/components/shell/CardActionMenu.tsx",
  );
  const css = read("apps/web/src/app/globals.css");

  assert.match(
    sharedList,
    /onSearchChange/,
    "search input must report its query to callers",
  );
  assert.match(
    sharedList,
    /aria-haspopup="menu"[\s\S]*aria-expanded=\{titleMenuOpen\}/,
    "list title menu trigger should expose the same expanded state as other popover buttons",
  );
  assert.match(
    sharedList,
    /const rememberedNotesHref = useRememberedWorkspaceHref\("notes",\s*"\/notes"\)/,
    "title menu quick switch must navigate to notes",
  );
  assert.match(
    sharedList,
    /const rememberedClipsHref = useRememberedWorkspaceHref\("clips",\s*"\/clips"\)/,
    "title menu quick switch must navigate to clips",
  );

  for (const source of [notesIndex, noteDetail, clipsIndex, clipDetail]) {
    assert.match(
      source,
      /CardActionMenu/,
      "cards need the shared hover more-actions menu",
    );
    assert.match(
      source,
      /hovered(Card|Note|Clip)Id/,
      "card wrappers should track explicit hover state so the action button reveals reliably",
    );
    assert.match(
      source,
      /mewmo-list-card-wrap--hover/,
      "card wrappers should expose the prototype hover state class",
    );
  }

  for (const source of [notesIndex, noteDetail, clipsIndex, clipDetail]) {
    assert.doesNotMatch(
      source,
      /contentTags|mewmo-tag-pill/,
      "list cards should not render tag pills after the tag feature removal",
    );
  }

  assert.match(
    cardActionMenu,
    /mewmo-list-card__action/,
    "shared card menu should render the hover action shell",
  );
  assert.match(
    cardActionMenu,
    /PopoverMenu/,
    "card action menus should use the shared fixed-position popover so clipped list cards cannot hide them",
  );
  assert.match(
    notesIndex,
    /mewmo-list-card__pin[\s\S]*<PinIcon/,
    "notes index should show the pinned marker outside the title text flow",
  );
  assert.match(
    noteDetail,
    /mewmo-list-card__pin[\s\S]*<PinIcon/,
    "note detail list should show the pinned marker outside the title text flow",
  );

  for (const source of [notesIndex, noteDetail]) {
    assert.match(
      source,
      /CardActionMenu[\s\S]*kind="notes"/,
      "note cards should use note-specific action menus",
    );
  }
  for (const source of [clipsIndex, clipDetail]) {
    assert.match(
      source,
      /CardActionMenu[\s\S]*kind="clips"/,
      "clip cards should use clip-specific action menus",
    );
  }
  assert.match(
    css,
    /\.mewmo-card-menu\s*\{[\s\S]*position:\s*fixed/,
    "card menus should be fixed-positioned and viewport-clamped like the prototype",
  );
  assert.match(
    css,
    /\.mewmo-list-card-wrap--hover\s+\.mewmo-row-action-card/,
    "card action buttons should be shown by an explicit hover class as well as CSS hover",
  );
  assert.match(
    css,
    /\.mewmo-list-card__source\s*\{[\s\S]*padding-right:\s*34px/,
    "card metadata rows should reserve right-side space for the action button",
  );
  assert.match(
    css,
    /\.mewmo-list-card__meta,\s*\.mewmo-list-card__source\s*\{[\s\S]*line-height:\s*18px/,
    "card metadata rows should expose a stable vertical center for right-side actions",
  );
  assert.match(
    css,
    /\.mewmo-list-card__action\s*\{[\s\S]*right:\s*13px[\s\S]*bottom:\s*calc\(13px \+ 9px\)[\s\S]*transform:\s*translateY\(50%\)/,
    "card action button centers should align to the metadata text center, not the button bottom edge",
  );
  assert.match(
    css,
    /\.mewmo-list-card__source span:nth-child\(2\)\s*\{[\s\S]*flex:\s*0 1 auto/,
    "card metadata text should stay left-aligned instead of pushing later metadata to the far right",
  );
  assert.doesNotMatch(
    css,
    /\.mewmo-list-card-wrap:has\(\.mewmo-list-card--selected\)\s+\.mewmo-row-action-card[\s\S]*opacity:\s*1/,
    "selected cards should not force the action button visible; it should appear on hover like before",
  );
  assert.match(
    css,
    /\.mewmo-list-card-wrap:has\(\.mewmo-list-card--selected\)\s*\+\s*\.mewmo-list-card-wrap\s+\.mewmo-list-card\s*\{[\s\S]*border-top-color:\s*transparent/,
    "the separator after a selected card should disappear like the prototype",
  );
  assert.match(
    css,
    /\.mewmo-list-card-wrap--hover\s*\+\s*\.mewmo-list-card-wrap\s+\.mewmo-list-card[\s\S]*border-top-color:\s*transparent/,
    "the separator after a hovered card should disappear so both rounded edges stay clean",
  );
  assert.match(
    css,
    /\.mewmo-list-card p\s*\{[\s\S]*white-space:\s*pre-line/,
    "gray preview text should render preserved line breaks in every list section",
  );
  assert.match(
    css,
    /\.mewmo-list-card__title span\s*\{[\s\S]*font-size:\s*14\.5px[\s\S]*font-weight:\s*620/,
    "card titles should use the prototype 14.5px / 620 text treatment",
  );
  assert.match(
    css,
    /\.mewmo-list-card\s*\{[\s\S]*overflow:\s*hidden/,
    "card content should be clipped inside the rounded card instead of spilling past the edge",
  );
  assert.match(
    css,
    /\.mewmo-list-card__title\s*\{[\s\S]*max-width:\s*100%[\s\S]*overflow:\s*hidden/,
    "card title rows should constrain long titles to the card width",
  );
  assert.match(
    css,
    /\.mewmo-list-card__pin\s*\{[\s\S]*position:\s*absolute[\s\S]*right:\s*13px[\s\S]*top:\s*13px/,
    "pinned markers should align to the right-side title row column instead of sitting inside title text",
  );
  assert.match(
    css,
    /\.mewmo-list-card--pinned\s+\.mewmo-list-card__title\s*\{[\s\S]*padding-right:\s*34px/,
    "pinned card titles should reserve the right-side title row column so long titles do not overlap the pin",
  );
  assert.match(
    css,
    /\.mewmo-list-card__title span\s*\{[\s\S]*display:\s*block[\s\S]*max-width:\s*100%[\s\S]*text-overflow:\s*ellipsis/,
    "card title text should use a complete single-line ellipsis contract",
  );
  assert.match(
    css,
    /\.mewmo-list-card__action:hover\s+\.mewmo-row-action-card/,
    "hovering the reserved action area should reveal the card action button",
  );
  assert.match(
    css,
    /\.mewmo-row-action-card\s*\{[^}]*pointer-events:\s*auto/,
    "hidden card action buttons should keep their hitbox so clicking the reserved area works reliably",
  );
});

test("default quick switch hides the current notes or clips destination", () => {
  const listColumn = read("apps/web/src/components/shell/ListColumn.tsx");

  assert.match(
    listColumn,
    /import \{ usePathname \} from "next\/navigation"/,
    "default quick switch needs the current route to avoid linking back to the same page",
  );
  assert.match(
    listColumn,
    /const isNotesSection = pathname === "\/notes" \|\| pathname\.startsWith\("\/notes\/"\)/,
    "notes routes should be recognized as the current notes section",
  );
  assert.match(
    listColumn,
    /const isClipsSection = pathname === "\/clips" \|\| pathname\.startsWith\("\/clips\/"\)/,
    "clips routes should be recognized as the current clips section",
  );
  assert.match(
    listColumn,
    /\{!isNotesSection && \([\s\S]*href=\{rememberedNotesHref\}[\s\S]*笔记[\s\S]*\)\}/,
    "notes quick-switch row should be hidden while already in notes",
  );
  assert.match(
    listColumn,
    /\{!isClipsSection && \([\s\S]*href=\{rememberedClipsHref\}[\s\S]*剪藏[\s\S]*\)\}/,
    "clips quick-switch row should be hidden while already in clips",
  );
});

test("note list pinned markers share the right-side action slot", () => {
  const notesIndex = read("apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx");
  const noteDetail = read(
    "apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx",
  );
  const css = read("apps/web/src/app/globals.css");

  assert.match(
    notesIndex,
    /mewmo-list-card__pin[\s\S]*<PinIcon/,
    "notes index should show the pinned marker outside the title text flow",
  );
  assert.match(
    noteDetail,
    /mewmo-list-card__pin[\s\S]*<PinIcon/,
    "note detail list should show the pinned marker outside the title text flow",
  );
  assert.match(
    css,
    /\.mewmo-list-card__pin\s*\{[\s\S]*position:\s*absolute[\s\S]*right:\s*13px[\s\S]*top:\s*13px/,
    "pinned markers should align to the right-side title row column instead of sitting inside title text",
  );
  assert.match(
    css,
    /\.mewmo-list-card__action\s*\{[\s\S]*right:\s*13px[\s\S]*bottom:\s*calc\(13px \+ 9px\)/,
    "pinned markers and three-dot actions should share the same right-side column on different rows",
  );
  assert.match(
    css,
    /\.mewmo-list-card--pinned\s+\.mewmo-list-card__title\s*\{[\s\S]*padding-right:\s*34px/,
    "pinned card titles should reserve the right-side title row column so long titles do not overlap the pin",
  );
});

test("note list create action uses the same icon-button treatment as search", () => {
  const notesIndex = read("apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx");
  const noteDetail = read(
    "apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx",
  );

  for (const source of [notesIndex, noteDetail]) {
    assert.match(
      source,
      /aria-label="新建笔记"[\s\S]*<PrototypeIcon name="pen-new-square"/,
      "note list create action should still use the new-note icon",
    );
    assert.doesNotMatch(
      source,
      /aria-label="新建笔记"[\s\S]{0,180}mewmo-icon-button--primary/,
      "note list create action should not use the special primary white tile treatment",
    );
  }
});

test("reader area includes wired list collapse and scroll toc affordances", () => {
  const readerToolbar = read("apps/web/src/components/shell/ReaderToolbar.tsx");
  const readerToc = read("apps/web/src/components/shell/ReaderToc.tsx");
  const noteDetail = read(
    "apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx",
  );
  const clipDetail = read(
    "apps/web/src/app/(app)/clips/[id]/ClipDetailClient.tsx",
  );
  const feedsPage = read("apps/web/src/app/(app)/feeds/page.tsx");
  const css = read("apps/web/src/app/globals.css");

  assert.match(
    readerToolbar,
    /onToggleList/,
    "toolbar should keep a wired list toggle",
  );
  assert.match(
    readerToc,
    /mewmo-doc-toc/,
    "shared reader toc should render the floating document toc",
  );
  assert.match(
    readerToc,
    /onMouseDown=\{\(event\) => previewTocSelection\(event,\s*index\)\}/,
    "toc links should preview selection on mouse down so expanded-card clicks do not flash the previous item",
  );
  assert.match(
    readerToc,
    /const TOC_JUMP_LOCK_MS = 1_800/,
    "toc should keep the clicked target locked through the whole smooth-scroll animation",
  );
  assert.match(
    readerToc,
    /const TOC_HEADING_TOP_GAP = 18/,
    "toc jumps should leave breathing room between the target heading and the reader toolbar",
  );
  assert.match(
    readerToc,
    /return paddingTop \+ TOC_HEADING_TOP_GAP/,
    "toc jump offset should combine the reader top padding with the shared breathing gap",
  );
  assert.match(
    readerToc,
    /const pendingJump = tocJumpRef\.current[\s\S]*setActiveToc\(pendingJump\.index\)[\s\S]*return;/,
    "toc scroll spy should not switch to intermediate headings during a programmatic jump",
  );
  assert.match(
    readerToc,
    /addEventListener\("scrollend", settlePendingJump\)/,
    "toc should release the programmatic jump lock on scrollend when the browser reports it",
  );
  assert.match(
    noteDetail,
    /<ReaderToc/,
    "note editor page should reuse the shared reader toc",
  );
  assert.match(
    clipDetail,
    /<ReaderToc/,
    "clip reader should reuse the shared reader toc",
  );
  assert.match(
    feedsPage,
    /<ReaderToc/,
    "feed reader should reuse the shared reader toc",
  );
  assert.match(
    css,
    /\.mewmo-workspace--list-collapsed/,
    "workspace must visually collapse the list column",
  );
  assert.match(
    css,
    /\.mewmo-doc-toc/,
    "floating document toc styles should be present",
  );
  assert.match(
    css,
    /\.mewmo-doc-toc\s*\{[\s\S]*top:\s*110px/,
    "floating document toc is the prototype minimap and should sit below the toolbar, not at the scroll viewport top",
  );
  assert.match(
    css,
    /\.mewmo-doc-toc__link--active:hover\s*\{[\s\S]*color:\s*var\(--accent\)/,
    "active toc links should stay accent-colored while hovered or clicked",
  );
  assert.match(css, /\.mewmo-spinner/, "loading states should have a spinner");
});

test("reader scroll viewport starts below toolbar without owning top content padding", () => {
  const css = read("apps/web/src/app/globals.css");
  const titleHook = read(
    "apps/web/src/components/shell/useReaderToolbarTitleVisibility.ts",
  );
  const toolbarState = read("apps/web/src/lib/reader-toolbar-state.ts");

  assert.match(
    css,
    /\.mewmo-reader-toolbar\s*\{[^}]*flex:\s*none/,
    "reader toolbar should keep the prototype absolute overlay out of the flex height calculation",
  );
  assert.match(
    css,
    /\.mewmo-reader-scroll\s*\{[^}]*flex:\s*1(?:\s*;|\s)/,
    "reader scroll viewport should be the flex child that receives the remaining height",
  );
  assert.match(
    css,
    /\.mewmo-reader-scroll\s*\{[^}]*margin-top:\s*46px[^}]*padding-bottom:\s*58px[^}]*padding-left:\s*64px[^}]*padding-right:\s*64px/,
    "reader scroll viewport should start below the 46px toolbar like the prototype",
  );
  assert.doesNotMatch(
    css,
    /\.mewmo-reader-scroll\s*\{[^}]*padding:\s*0 64px 58px/,
    "reader scroll viewport should copy the prototype side/bottom padding without a shorthand top padding",
  );
  assert.doesNotMatch(
    css,
    /\.mewmo-reader-scroll\s*\{[^}]*position:\s*absolute|\.mewmo-reader-scroll\s*\{[^}]*inset:\s*0|\.mewmo-reader-scroll\s*\{[^}]*height:\s*100%/,
    "reader scroll viewport must not be stretched behind the toolbar and then cosmetically hidden",
  );
  assert.match(
    css,
    /\.mewmo-document\s*\{[^}]*padding:\s*32px 36px 30px/,
    "reader document should keep the prototype internal top padding",
  );
  assert.doesNotMatch(
    css,
    /\.mewmo-reader-scroll\s*\{[^}]*padding:\s*28px 64px 64px/,
    "top spacing must not be faked by padding the scroll viewport",
  );
  assert.doesNotMatch(
    css,
    /\.mewmo-reader-scroll(?:[^{]*)\{[^}]*scrollbar-width:\s*none|\.mewmo-reader-scroll::-webkit-scrollbar\s*\{[^}]*display:\s*none/,
    "reader scrollbar should not be hidden; the scroll viewport itself must begin below the toolbar",
  );
  assert.match(
    titleHook,
    /querySelector<HTMLElement>\([\s\S]*"\.mewmo-note-title-editor,\s*\.mewmo-document h1"/,
    "toolbar title visibility should measure the original reader title, not guess from scrollTop",
  );
  assert.match(
    titleHook,
    /reader\.getBoundingClientRect\(\)/,
    "toolbar title visibility should use the reader scroll viewport top, excluding the toolbar height",
  );
  assert.match(
    toolbarState,
    /sourceTitleBottom\s*<=\s*state\.viewportTop/,
    "toolbar title should reveal only after the source title fully exits the reader viewport",
  );
});

test("reader surfaces expose the prototype back-to-top affordance", () => {
  const css = read("apps/web/src/app/globals.css");
  const component = read("apps/web/src/components/shell/ReaderBackToTopButton.tsx");
  const pages = [
    "apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx",
    "apps/web/src/app/(app)/clips/page.tsx",
    "apps/web/src/app/(app)/clips/[id]/ClipDetailClient.tsx",
    "apps/web/src/app/(app)/knowledge-bases/page.tsx",
    "apps/web/src/app/(app)/feeds/page.tsx",
    "apps/web/src/app/(app)/today/page.tsx",
    "apps/web/src/app/(app)/trash/page.tsx",
  ].map(read);

  assert.match(
    component,
    /visible:\s*boolean/,
    "floating back-to-top visibility should be driven by the same state as the toolbar title",
  );
  assert.doesNotMatch(
    component,
    /shouldShowReaderBackToTop|reader\.addEventListener\("scroll"/,
    "floating back-to-top must not use a separate scroll threshold from the toolbar title",
  );
  assert.match(
    component,
    /scrollTo\(\{\s*top:\s*0,\s*behavior:\s*"smooth"\s*\}\)/,
    "clicking the affordance should smoothly return the reader viewport to top",
  );
  assert.match(
    component,
    /<PrototypeIcon name="arrow-up" size=\{20\}/,
    "back-to-top should render the prototype arrow through PrototypeIcon",
  );

  for (const page of pages) {
    assert.match(
      page,
      /<ReaderBackToTopButton scrollRef=\{scrollRef\} visible=\{toolbarTitleVisible\} \/>/,
      "each reader surface should show back-to-top exactly when the toolbar title is visible",
    );
  }

  assert.match(css, /\.mewmo-reader-surface\s*\{[^}]*position:\s*relative/, "reader surface should own the back-to-top positioning context");
  assert.match(css, /\.mewmo-reader-to-top\s*\{[^}]*position:\s*absolute/, "button should stay inside the reader surface instead of the viewport");
  assert.match(css, /\.mewmo-reader-to-top\s*\{[^}]*right:\s*16px[^}]*bottom:\s*16px/, "button should sit at the reader panel bottom-right corner");
  assert.doesNotMatch(css, /\.mewmo-reader-to-top\s*\{[^}]*--ai-fab-bottom/, "button position must not depend on the movable AI entry");
  assert.match(css, /\.mewmo-reader-to-top\s*\{[^}]*width:\s*40px[^}]*height:\s*40px/, "button should keep the prototype 40px square hit target");
  assert.match(css, /\.mewmo-reader-to-top\s*\{[^}]*opacity:\s*0[^}]*pointer-events:\s*none/, "button should be hidden before the threshold");
  assert.match(css, /\.mewmo-reader-to-top--visible\s*\{[^}]*opacity:\s*1[^}]*pointer-events:\s*auto/, "button should become interactive once visible");
});

test("popup menu text stays primary and account menu opens above the account row", () => {
  const css = read("apps/web/src/app/globals.css");
  const floatingMenu = read("apps/web/src/components/ui/FloatingMenu.tsx");
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");

  assert.match(
    floatingMenu,
    /placement\?:\s*"bottom"\s*\|\s*"top"/,
    "floating menu should support an explicit upward placement for bottom-anchored account menus",
  );
  assert.match(
    sidebar,
    /className="mewmo-account-menu"[\s\S]*placement="top"/,
    "account menu should open above the account row instead of covering it while clamped to the viewport bottom",
  );
  assert.match(
    css,
    /\.mewmo-reader-menu\s+\.mewmo-card-menu__item\s*\{[\s\S]*color:\s*var\(--ink\)/,
    "reader popup menu text should use primary ink instead of gray ink-soft",
  );
  assert.match(
    css,
    /\.mewmo-menu-label\s*\{[\s\S]*color:\s*var\(--ink\)/,
    "account popup labels should use primary ink instead of gray ink-faint",
  );
  assert.doesNotMatch(
    sidebar,
    /dogfood|mewmo-sync-state|同步：/,
    "account popup should not expose internal dogfood sync status copy",
  );
});

test("sidebar group rows match the prototype hierarchy without collection actions", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
  const css = read("apps/web/src/app/globals.css");

  assert.doesNotMatch(
    sidebar,
    /id="collection"[\s\S]{0,360}onMenuToggle/,
    "collection inbox group should not show a three-dot action menu",
  );
  assert.match(
    sidebar,
    /menuOpen\?:\s*boolean[\s\S]*onMenuToggle\?:\s*\(\)\s*=>\s*void/,
    "sidebar group action menus should be optional so fixed prototype groups can omit them",
  );
  assert.match(
    css,
    /\.mewmo-nav-row--group\s*\{[\s\S]*font-weight:\s*400/,
    "top-level sidebar groups should use normal weight instead of bold hierarchy",
  );
  assert.doesNotMatch(
    sidebar,
    /跟随系统\s*\{[\s\S]*PrototypeIcon name="check"|最近更新[\s\S]*PrototypeIcon name="check"/,
    "checked menu rows should use one trailing check slot, not inline check icons mixed into row text",
  );
});

test("checked menu rows use a single check icon", () => {
  const prototypeIcon = read("apps/web/src/components/shell/PrototypeIcon.tsx");
  const checkIcons = [...prototypeIcon.matchAll(/"check":\s*"((?:\\.|[^"\\])*)"/g)].map((match) => match[1]);

  assert.equal(checkIcons.length, 2, "line and filled check icons should both be defined");
  for (const svg of checkIcons) {
    assert.doesNotMatch(
      svg,
      /m5\.025|m4 0|7\.978|5\.167/,
      "check icons should be a single check mark, not the Solar double-check glyph",
    );
  }
});

test("workspace shell preserves prototype AI rail proportions and resizer", () => {
  const appShell = read("apps/web/src/components/shell/AppShell.tsx");
  const aiSidebar = read("apps/web/src/components/shell/AISidebar.tsx");
  const css = read("apps/web/src/app/globals.css");

  assert.match(
    appShell,
    /mewmo-ai-resizer/,
    "AI rail should expose the prototype drag handle between reader and AI",
  );
  assert.match(
    appShell,
    /\{!aiOpen && \(/,
    "cat entry should disappear after opening so the rail close button is the only collapse affordance",
  );
  assert.match(
    appShell,
    /onClick=\{openAi\}[\s\S]*aria-label="打开 mewmo"/,
    "cat entry should only open the AI rail",
  );
  assert.match(
    aiSidebar,
    /onClick=\{\(\) => onOpenChange\(false\)\}[\s\S]*aria-label="关闭 mewmo"/,
    "the AI rail close button should own the collapse action",
  );
  assert.match(
    appShell,
    /onPointerDown=\{startAiFabDrag\}[\s\S]*onPointerMove=\{moveAiFab\}[\s\S]*onPointerUp=\{endAiFabDrag\}/,
    "cat entry should support vertical pointer drag without a separate drag handle",
  );
  assert.match(
    appShell,
    /try\s*\{[\s\S]*setPointerCapture\(event\.pointerId\)[\s\S]*\}\s*catch/,
    "cat entry should tolerate pointer events that cannot be captured instead of crashing the app",
  );
  assert.match(
    appShell,
    /"--ai-fab-bottom": `\$\{aiFabBottom\}px`/,
    "cat entry position should be exposed as a CSS variable so paired controls can follow it",
  );
  assert.match(
    appShell,
    /setProperty\("--ai-w"/,
    "AI rail resizing should update the shell --ai-w custom property",
  );
  assert.match(
    appShell,
    /AI_W_MIN\s*=\s*280/,
    "AI rail resize should use the prototype 280px minimum width",
  );
  assert.match(
    appShell,
    /READ_W_FLOOR\s*=\s*460/,
    "AI rail resize should preserve the prototype reader minimum width",
  );
  assert.match(
    css,
    /\.mewmo-shell\s*\{[\s\S]*grid-template-columns:\s*var\(--sidebar-w\)\s+minmax\(0,\s*1fr\)\s+0px/,
    "closed shell should reserve a 0px AI grid column like the prototype",
  );
  assert.match(
    css,
    /\.mewmo-shell--ai-open\s*\{[\s\S]*grid-template-columns:\s*var\(--sidebar-w\)\s+minmax\(0,\s*1fr\)\s+var\(--ai-w\)/,
    "open shell should give the AI rail var(--ai-w) and shrink the reader column",
  );
  assert.match(
    css,
    /\.mewmo-ai-rail\s*\{[\s\S]*width:\s*calc\(var\(--ai-w\)\s*-\s*var\(--frame\)\)/,
    "AI rail should leave the shared shell frame gap inside its column",
  );
  assert.match(
    css,
    /\.mewmo-ai-fab\s*\{[\s\S]*bottom:\s*var\(--ai-fab-bottom,\s*80px\)/,
    "cat entry should keep the current default bottom position through a movable CSS variable",
  );
  assert.doesNotMatch(
    css,
    /\.mewmo-shell--ai-open\s+\.mewmo-reader-to-top\s*\{/,
    "back-to-top should not have an AI-open positioning or visibility override",
  );
  assert.match(
    css,
    /\.mewmo-ai-resizer\s*\{[\s\S]*right:\s*calc\(var\(--ai-w\)\s*\+\s*var\(--frame\)\s*\/\s*2\s*-\s*9px\)/,
    "AI resizer should sit in the shared shell frame gap and track --ai-w",
  );
  assert.match(
    css,
    /\.mewmo-shell--ai-resizing\s*\{[\s\S]*transition:\s*none/,
    "dragging the AI resizer should disable shell easing",
  );
  assert.doesNotMatch(
    aiSidebar,
    />×<|>→</,
    "AI rail controls must not use text glyphs as icons",
  );
  assert.match(
    aiSidebar,
    /mewmo-ai-rail__mark[\s\S]*PrototypeIcon name="mewmo-logo"[\s\S]*mewmo-ai-rail__name">mewmo</,
    "AI rail header should use the temporary mewmo agent name instead of a generic smart sidebar title",
  );
  assert.doesNotMatch(
    aiSidebar,
    /智能侧栏|>AI<\/div>/,
    "AI rail header should not show the generic AI/sidebar naming while the cat agent name is mewmo",
  );
  assert.doesNotMatch(
    aiSidebar,
    /mewmo-ai-rail__state/,
    "mewmo rail header should not show a secondary helper text under the title",
  );
  assert.doesNotMatch(
    aiSidebar,
    /RELATED_PLACEHOLDERS|mewmo-ai-related-modal|createPortal/,
    "the Agent rail must not present fixed related-content examples as real recommendations",
  );
  assert.match(
    css,
    /\.mewmo-ai-related-modal__panel\s*\{[\s\S]*width:\s*min\(860px,[\s\S]*height:\s*min\(760px,/,
    "related detail dialog should use a large reading surface instead of a compact card",
  );
});

test("sidebar collapse peek uses the prototype edge-hover behavior", () => {
  const appShell = read("apps/web/src/components/shell/AppShell.tsx");
  const css = read("apps/web/src/app/globals.css");

  assert.match(
    appShell,
    /window\.addEventListener\("mousemove"/,
    "collapsed sidebar peek should listen at window level like the prototype, not only inside the shell grid",
  );
  assert.match(
    appShell,
    /clientX\s*<\s*18|clientX\s*<=\s*18/,
    "collapsed sidebar peek trigger should use the prototype 18px edge rail",
  );
  assert.match(
    appShell,
    /setTimeout\([\s\S]*200/,
    "sidebar should delay hiding after mouseleave so the expand button remains reachable",
  );
  assert.doesNotMatch(
    appShell,
    /mewmo-sidebar-rail-toggle|aria-label="展开侧栏"/,
    "prototype sidebar collapse must not add a separate visible rail button",
  );
  assert.doesNotMatch(
    css,
    /\.mewmo-sidebar-rail-toggle/,
    "prototype sidebar collapse should use the 18px edge rail and peek state, not a custom button",
  );
  assert.match(
    css,
    /\.mewmo-sidebar\s*\{[\s\S]*grid-column:\s*1/,
    "sidebar should be pinned to grid column 1 like the prototype",
  );
  assert.match(
    css,
    /\.mewmo-shell__main\s*\{[\s\S]*grid-column:\s*2/,
    "main content should be pinned to grid column 2 so hidden sidebar never pushes the document away",
  );
  assert.match(
    css,
    /\.mewmo-shell--sidebar-collapsed\s*\{[\s\S]*--sidebar-w:\s*18px/,
    "collapsed shell should keep the prototype 18px edge rail in the layout",
  );
  assert.match(
    css,
    /\.mewmo-shell--sidebar-collapsed\.mewmo-shell--sidebar-peek\s+\.mewmo-sidebar\s*\{[\s\S]*pointer-events:\s*auto/,
    "peeked sidebar should become interactive so the expand button can be clicked",
  );
});

test("prototype popovers and dialogs keep icon-bearing structure", () => {
  const cardActionMenu = read(
    "apps/web/src/components/shell/CardActionMenu.tsx",
  );
  const readerToolbar = read("apps/web/src/components/shell/ReaderToolbar.tsx");
  const clipsIndex = read("apps/web/src/app/(app)/clips/page.tsx");
  const clipDetail = read(
    "apps/web/src/app/(app)/clips/[id]/ClipDetailClient.tsx",
  );
  const notesPageSource = read("apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx");
  const noteDetailSource = read(
    "apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx",
  );
  const confirmDialog = read("apps/web/src/components/ui/ConfirmDialog.tsx");
  const feedsPage = read("apps/web/src/app/(app)/feeds/page.tsx");
  const knowledgeImport = read(
    "apps/web/src/components/knowledge/KnowledgeImportModal.tsx",
  );
  const css = read("apps/web/src/app/globals.css");

  assert.match(
    cardActionMenu,
    /mewmo-card-menu__icon/,
    "card menu items should wrap icons in a stable prototype icon slot",
  );
  assert.match(
    readerToolbar,
    /mewmo-card-menu__icon/,
    "reader more menu items should also use icon slots",
  );
  assert.match(
    readerToolbar,
    /mewmo-card-menu__item mewmo-card-menu__item--danger[\s\S]*runMenuAction\(onDelete\)[\s\S]*runMenuAction\(onRefresh\)[\s\S]*runMenuAction\(onCopyLink\)/,
    "clip reader toolbar menu items should keep real clip actions without hiding original-link navigation in the menu",
  );
  assert.doesNotMatch(
    readerToolbar,
    /浏览器打开/,
    "reader toolbar should not keep original-link navigation in the overflow menu",
  );
  assert.match(
    readerToolbar,
    /menuKind === "notes"[\s\S]*runMenuAction\(onDelete\)[\s\S]*runMenuAction\(onTogglePin\)[\s\S]*runMenuAction\(onShare\)[\s\S]*runMenuAction\(onExport\)/,
    "note reader toolbar menu items should be wired to real actions and close after click",
  );
  for (const source of [clipsIndex, clipDetail]) {
    assert.match(
      source,
      /<ReaderToolbar[\s\S]*menuKind="clips"[\s\S]*onDelete=/,
      "clip reader toolbar should receive the current clip delete action",
    );
    assert.match(
      source,
      /<ReaderToolbar[\s\S]*menuKind="clips"[\s\S]*onCopyLink=/,
      "clip reader toolbar should receive the current clip copy action",
    );
    assert.match(
      source,
      /className="mewmo-doc-meta__link"[\s\S]*href=\{(?:selectedClip|clip)\.url\}[\s\S]*>\s*原文\s*<\/a>/,
      "clip reader metadata should expose original-link navigation inline",
    );
  }
  for (const source of [notesPageSource, noteDetailSource]) {
    assert.match(
      source,
      /<ReaderToolbar[\s\S]*menuKind="notes"[\s\S]*onDelete=/,
      "note reader toolbar should receive the current note delete action",
    );
    assert.match(
      source,
      /<ReaderToolbar[\s\S]*menuKind="notes"[\s\S]*onTogglePin=/,
      "note reader toolbar should receive the current note pin action",
    );
    assert.match(
      source,
      /<ReaderToolbar[\s\S]*menuKind="notes"[\s\S]*onShare=/,
      "note reader toolbar should receive the current note share action",
    );
    assert.match(
      source,
      /<ReaderToolbar[\s\S]*menuKind="notes"[\s\S]*onExport=/,
      "note reader toolbar should receive the current note export action",
    );
  }
  assert.match(
    css,
    /\.mewmo-card-menu\s*\{[\s\S]*min-width:\s*128px/,
    "card menus should use the prototype rowmenu minimum width",
  );
  assert.match(
    css,
    /\.mewmo-card-menu__icon\s*\{[\s\S]*width:\s*16px[\s\S]*height:\s*16px/,
    "menu icon slots should lock to the prototype 16px size",
  );
  assert.match(
    css,
    /\.mewmo-reader-menu\s+\.mewmo-card-menu__item\s*\{[\s\S]*color:\s*var\(--ink-soft\)/,
    "reader menu items should use the same default white ink as the three-dot toolbar button",
  );
  assert.match(
    css,
    /html\.light\s+\.mewmo-reader-menu\s*\{[\s\S]*background:\s*var\(--raised\)/,
    "reader menu card background should be the prototype white raised surface in light mode",
  );
  assert.doesNotMatch(
    css,
    /\.mewmo-reader-menu\s+\.mewmo-card-menu__item--danger\s*\{[^}]*color:\s*var\(--ink-soft\)/,
    "reader menu delete text should keep the original red danger color",
  );
  assert.match(
    css,
    /\.mewmo-reader-menu\s+\.mewmo-card-menu__item--danger\s*\{[^}]*color:\s*#f87171/,
    "reader menu delete text should keep the original red danger color",
  );
  assert.match(
    css,
    /\.mewmo-reader-menu\s+\.mewmo-card-menu__item--danger\s+\.mewmo-card-menu__icon\s*\{[^}]*color:\s*#f87171/,
    "reader menu trash icon should be red",
  );
  assert.match(
    confirmDialog,
    /mewmo-confirm__head/,
    "confirmation dialogs should use the prototype modal head structure",
  );
  assert.match(
    confirmDialog,
    /mewmo-confirm__close/,
    "confirmation dialogs should render an icon close affordance",
  );
  assert.match(
    knowledgeImport,
    /PrototypeIcon name="close"[\s\S]*className="mewmo-icon-close"/,
    "knowledge import modal should use the same prototype close icon affordance as other modal cards",
  );
  assert.doesNotMatch(
    knowledgeImport,
    /aria-label="关闭"[\s\S]{0,160}PrototypeIcon name="chev-left"/,
    "modal close affordances should not use a back arrow icon",
  );
  assert.match(
    css,
    /\.mewmo-confirm__head\s*\{[\s\S]*margin:\s*0 0 18px/,
    "dialog head spacing should match the prototype modal head",
  );
  assert.match(
    css,
    /\.mewmo-confirm__close\s*\{[\s\S]*width:\s*28px[\s\S]*height:\s*28px/,
    "dialog close icon button should match the prototype 28px square",
  );
  for (const source of [confirmDialog, feedsPage, knowledgeImport]) {
    assert.match(
      source,
      /data-state=\{open \? "open" : "closed"\}/,
      "modal overlays should stay mounted with data-state so close can animate like the prototype",
    );
    assert.match(
      source,
      /setTimeout\([\s\S]*MODAL_EXIT_MS/,
      "modal overlays should delay unmount for the prototype close transition",
    );
    assert.match(
      source,
      /document\.addEventListener\("keydown"/,
      "modal cards should close on Escape just like other prototype popover surfaces",
    );
    assert.match(
      source,
      /event\.key === "Escape"[\s\S]*(?:onCancel|onClose)\(\)/,
      "modal Escape handlers should call the same close path as clicking outside",
    );
  }
  assert.doesNotMatch(
    css,
    /\.(mewmo-confirm__scrim|mewmo-feed-modal__scrim|mewmo-knowledge-import__scrim)\s*\{[^}]*backdrop-filter/,
    "modal scrims should not use frosted-glass blur; the prototype target is a simple overlay",
  );
  assert.doesNotMatch(
    knowledgeImport,
    /PROTOTYPE_IMPORT_MODAL_STYLES|backdrop-filter|animation:\s*(?:fade|popIn)/,
    "knowledge import should render the shared transition-ready modal shell instead of injecting the old frosted prototype CSS",
  );
  assert.doesNotMatch(
    css,
    /\.mewmo-knowledge-import__|animation:\s*(?:fade|popIn)|backdrop-filter:\s*blur\(2px\)|@keyframes\s+mewmo-feed-modal-in/,
    "global CSS should not keep legacy one-shot modal animations or the old knowledge-import shell",
  );
  assert.match(
    css,
    /\.mewmo-feed-modal__panel\s*\{[\s\S]*background:\s*var\(--raised\)/,
    "feed modal panel should use the prototype white raised surface",
  );
  assert.match(
    css,
    /\.mewmo-knowledge-import\s+\.modal__panel\s*\{[\s\S]*background:\s*var\(--raised\)/,
    "knowledge import modal panel should use the prototype white raised surface",
  );
  assert.match(
    css,
    /\.mewmo-confirm__panel\s*\{[\s\S]*background:\s*var\(--raised\)/,
    "confirmation modal panel should use the prototype white raised surface",
  );
  assert.match(
    css,
    /\.mewmo-feed-modal\[data-state="closed"\]\s+\.mewmo-feed-modal__panel/,
    "feed modal panel should animate out before unmount",
  );
  assert.match(
    css,
    /\.mewmo-knowledge-import\[data-state="closed"\]\s+\.modal__panel/,
    "knowledge import modal panel should animate out before unmount",
  );
  assert.match(
    css,
    /\.mewmo-confirm\[data-state="closed"\]\s+\.mewmo-confirm__panel/,
    "confirmation modal panel should animate out before unmount",
  );
});

test("popover primitive matches prototype positioning, outside close, and exit animation", () => {
  const floatingMenu = read("apps/web/src/components/ui/FloatingMenu.tsx");
  const cardActionMenu = read(
    "apps/web/src/components/shell/CardActionMenu.tsx",
  );
  const readerToolbar = read("apps/web/src/components/shell/ReaderToolbar.tsx");
  const listColumn = read("apps/web/src/components/shell/ListColumn.tsx");
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
  const css = read("apps/web/src/app/globals.css");

  assert.match(
    floatingMenu,
    /import \{ createPortal \} from "react-dom"/,
    "shared floating menus should portal to document.body so list/sidebar overflow cannot clip them",
  );
  assert.match(
    floatingMenu,
    /anchorRef/,
    "shared floating menus should position from an anchor element",
  );
  assert.doesNotMatch(
    floatingMenu,
    /anchorRef\?:|if \(!anchorRef\)/,
    "shared floating menus should always have an anchor so every popover uses prototype fixed positioning",
  );
  assert.match(
    floatingMenu,
    /document\.addEventListener\("mousedown"/,
    "shared floating menus should close on outside click",
  );
  assert.match(
    floatingMenu,
    /document\.addEventListener\("keydown"/,
    "shared floating menus should close on Escape",
  );
  assert.match(
    floatingMenu,
    /event\.stopPropagation\(\)/,
    "popover Escape handling should stop at the topmost card so nested modal popovers do not close their parent dialog",
  );
  assert.match(
    floatingMenu,
    /document\.addEventListener\("keydown",\s*closeOnEscape,\s*true\)/,
    "popover Escape handling should run in capture phase before parent modal Escape listeners",
  );
  assert.match(
    floatingMenu,
    /createContext<\(\(\) => void\) \| null>/,
    "shared floating menu buttons should receive one close function from the popover primitive",
  );
  assert.match(
    floatingMenu,
    /const closeMenu = useContext\(FloatingMenuCloseContext\)/,
    "floating menu items should consume the shared close function instead of relying on each caller",
  );
  assert.match(
    floatingMenu,
    /onClick=\{\(\) => \{[\s\S]*onClick\?\.\(\);[\s\S]*closeMenu\?\.\(\);[\s\S]*\}\}/,
    "floating menu buttons should close the card after running their action like the prototype row menu",
  );
  assert.match(
    floatingMenu,
    /window\.addEventListener\("resize"/,
    "shared floating menus should recompute position when the viewport changes",
  );
  assert.match(
    floatingMenu,
    /window\.addEventListener\("scroll"/,
    "shared floating menus should stay anchored while scroll containers move",
  );
  assert.match(
    floatingMenu,
    /data-state=\{open \? "open" : "closed"\}/,
    "shared floating menus should remain mounted long enough to animate closed",
  );
  assert.match(
    floatingMenu,
    /setTimeout\([\s\S]*POPOVER_EXIT_MS/,
    "shared floating menus should delay unmount for the prototype close animation",
  );
  assert.match(
    floatingMenu,
    /function getPopoverBoundary/,
    "shared floating menus should compute an explicit boundary before clamping",
  );
  assert.match(
    floatingMenu,
    /anchor\.closest\("\.mewmo-shell__main"\)/,
    "main-workspace popovers should clamp to the content column so AI rail does not get covered",
  );
  assert.match(
    floatingMenu,
    /boundary\.right - width - VIEWPORT_GAP/,
    "popover right edge should clamp to the active boundary, not always to window.innerWidth",
  );
  assert.match(
    floatingMenu,
    /right:\s*window\.innerWidth/,
    "shared floating menus should still fall back to the viewport when the anchor is outside the main workspace",
  );
  assert.match(
    floatingMenu,
    /boundary\.bottom - height - VIEWPORT_GAP/,
    "popover bottom edge should clamp to the active boundary",
  );
  assert.match(
    floatingMenu,
    /bottom:\s*window\.innerHeight/,
    "shared floating menus should still fall back to viewport height outside the main workspace",
  );
  assert.match(
    floatingMenu,
    /align = "start"/,
    "shared floating menus should default to the prototype down-right placement before viewport clamping",
  );
  assert.match(
    floatingMenu,
    /boundary\s*\?:\s*"viewport"\s*\|\s*"main"/,
    "shared floating menus should let main-workspace callers explicitly clamp away from the AI rail",
  );
  assert.match(
    readerToolbar,
    /<PopoverMenu[\s\S]*boundary="main"[\s\S]*className="mewmo-card-menu mewmo-reader-menu"/,
    "reader toolbar menu must explicitly use the main workspace boundary so it never opens over the AI rail",
  );
  assert.match(
    cardActionMenu,
    /<PopoverMenu[\s\S]*boundary="main"[\s\S]*className="mewmo-card-menu"/,
    "list card action menus must explicitly use the main workspace boundary",
  );
  assert.doesNotMatch(
    listColumn,
    /<PopoverMenu[\s\S]*className="mewmo-card-menu mewmo-clip-url"/,
    "clip URL input should use the prototype inline toolbar reveal, not a floating popover card",
  );
  assert.match(
    floatingMenu,
    /const rawLeft = align === "start" \? rect\.left : rect\.right - width/,
    "prototype placement starts at the trigger left edge and only flips left when clamped by the viewport",
  );
  assert.match(
    floatingMenu,
    /const originX = clampedLeft < rawLeft \? "right" : "left"/,
    "popover animation origin should follow the actual down-right placement and switch only when viewport clamping pulls the card left",
  );
  assert.match(
    floatingMenu,
    /placement = "bottom"/,
    "prototype placement should default to opening below the trigger before viewport clamping",
  );
  assert.match(
    floatingMenu,
    /placement === "top" \? rect\.top - height - gap : rect\.bottom \+ gap/,
    "account menus may explicitly open above the trigger while ordinary popovers still open below",
  );
  assert.match(
    floatingMenu,
    /clampedTop < rawTop[\s\S]*\? "bottom"[\s\S]*: "top"/,
    "popover animation origin should switch to the bottom edge when bottom placement is pulled upward",
  );
  assert.match(
    floatingMenu,
    /origin:\s*`\$\{originY\} \$\{originX\}`/,
    "popover transform origin should combine vertical and horizontal clamp direction",
  );
  assert.match(
    floatingMenu,
    /"--popover-origin":\s*position\.origin/,
    "shared popovers should pass the computed animation origin into CSS",
  );
  assert.match(
    css,
    /\.mewmo-popover-card\s*\{[\s\S]*opacity:\s*0[\s\S]*visibility:\s*hidden[\s\S]*transform:\s*translateY\(-4px\)\s*scale\(0\.97\)[\s\S]*transition:/,
    "shared popovers should use prototype state-driven open and close transitions",
  );
  assert.match(
    css,
    /\.mewmo-popover-card\[data-state="open"\]\s*\{[\s\S]*opacity:\s*1[\s\S]*visibility:\s*visible[\s\S]*transform:\s*none[\s\S]*pointer-events:\s*auto/,
    "shared popovers should animate open through data-state instead of keyframes",
  );
  assert.doesNotMatch(
    css,
    /\.mewmo-card-menu\s*\{[^}]*animation:\s*popIn|\.mewmo-floating-menu\s*\{[^}]*animation:\s*mewmo-menu-in|@keyframes\s+mewmo-menu-in/,
    "popover cards should not use one-shot keyframes that bypass the prototype close transition",
  );

  for (const source of [cardActionMenu, readerToolbar]) {
    assert.match(
      source,
      /PopoverMenu/,
      "card and reader menus should use the shared popover primitive instead of custom positioning",
    );
    assert.doesNotMatch(
      source,
      /document\.addEventListener\("mousedown"/,
      "menu components should not carry duplicate outside-click implementations",
    );
  }

  for (const source of [listColumn, sidebar]) {
    assert.match(
      source,
      /anchorRef=/,
      "list and sidebar menus should pass anchors into the shared fixed-position popover",
    );
    assert.match(
      source,
      /onOpenChange=/,
      "list and sidebar menus should let the shared popover close itself",
    );
  }

  assert.match(
    css,
    /\.mewmo-popover-card\s*\{[\s\S]*position:\s*fixed[\s\S]*opacity:\s*0[\s\S]*visibility:\s*hidden[\s\S]*transform:\s*translateY\(-4px\)\s+scale\(0\.97\)[\s\S]*transform-origin:\s*var\(--popover-origin,\s*top left\)[\s\S]*transition:/,
    "popover cards should start hidden with the prototype fixed-position transition and right-down animation origin",
  );
  assert.doesNotMatch(
    css,
    /\.(mewmo-list-title-menu|mewmo-account-menu|mewmo-row-menu)\s*\{[^}]*position:\s*absolute|\.mewmo-account-menu\s*\{[^}]*(left|right|bottom):|\.mewmo-list-title-menu\s*\{[^}]*(left|top):/,
    "legacy menu-specific classes must not override the shared fixed popover positioning",
  );
  assert.doesNotMatch(
    css,
    /\.mewmo-feed-source-menu\s*\{[^}]*(left|right|top|bottom):/,
    "feed source menus should not override the shared fixed popover position",
  );
  assert.match(
    css,
    /\.mewmo-popover-card\[data-state="open"\]\s*\{[\s\S]*opacity:\s*1[\s\S]*visibility:\s*visible[\s\S]*transform:\s*none/,
    "open popovers should animate to visible, untransformed state",
  );
  assert.match(
    css,
    /html\.light\s+\.mewmo-popover-card\s*\{[\s\S]*background:\s*var\(--raised\)/,
    "light-mode popovers should use the prototype white raised surface",
  );
});

test("destructive confirmation uses the prototype modal instead of native confirm", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
  const noteEditor = read("apps/web/src/components/editor/NoteEditor.tsx");

  assert.doesNotMatch(
    `${sidebar}\n${noteEditor}`,
    /(?:window\.)?confirm\(/,
    "native confirm dialogs are not prototype cards and should not be used",
  );
  assert.match(
    sidebar,
    /ConfirmDialog/,
    "sidebar destructive actions should render the shared prototype confirmation card",
  );
  assert.match(
    noteEditor,
    /ConfirmDialog/,
    "note deletion should render the shared prototype confirmation card",
  );
});

test("text-entry dialogs use prototype modal cards instead of native prompt", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");

  assert.doesNotMatch(
    sidebar,
    /(?:window\.)?prompt\(/,
    "native prompt dialogs are not prototype cards and should not be used",
  );
  assert.match(
    sidebar,
    /mewmo-prompt-input/,
    "sidebar text-entry actions should render an in-app modal input",
  );
});

test("all popover menu items expose a prototype icon slot", () => {
  const floatingMenu = read("apps/web/src/components/ui/FloatingMenu.tsx");
  const listColumn = read("apps/web/src/components/shell/ListColumn.tsx");
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
  const feedsPage = read("apps/web/src/app/(app)/feeds/page.tsx");
  const editorInteractions = read("apps/web/src/components/editor/editor-interactions.ts");
  const prototypeIcon = read("apps/web/src/components/shell/PrototypeIcon.tsx");
  const css = read("apps/web/src/app/globals.css");

  assert.match(
    floatingMenu,
    /icon:\s*PrototypeIconName/,
    "shared menu item API should require an icon name",
  );
  assert.match(
    floatingMenu,
    /mewmo-floating-menu__icon/,
    "shared menu items should render a stable leading icon slot",
  );
  assert.match(
    floatingMenu,
    /FloatingMenuLink[\s\S]*icon:\s*PrototypeIconName/,
    "shared menu links should also require an icon name",
  );
  assert.match(
    floatingMenu,
    /FloatingMenuLink[\s\S]*<FloatingMenuIcon icon=\{icon\}/,
    "shared menu links should render the prototype icon slot",
  );
  assert.doesNotMatch(
    floatingMenu,
    /icon\?:/,
    "menu item icons should be required, not optional",
  );
  assert.doesNotMatch(
    listColumn,
    /排序|最近更新|最新创建/,
    "list title menu should no longer expose sorting controls",
  );
  assert.doesNotMatch(
    `${listColumn}\n${feedsPage}`,
    /className="mewmo-floating-menu__item"[\s\S]{0,120}<PrototypeIcon/,
    "floating menu options should use FloatingMenuButton/FloatingMenuLink so icons share the prototype slot",
  );
  assert.match(
    feedsPage,
    /FloatingMenuLink[\s\S]*icon=\{item\.icon\}/,
    "feed quick-switch links should use the shared floating menu link with an icon slot",
  );
  assert.match(
    feedsPage,
    /FloatingMenuButton[\s\S]*icon=\{item\.icon\}/,
    "feed quick-switch buttons should use the shared floating menu button with an icon slot",
  );
  for (const icon of ["palette", "appearance", "font-size", "info", "import-export", "logout", "monitor", "moon", "sun", "import"]) {
    assert.match(
      prototypeIcon,
      new RegExp(`"${icon}"`),
      `PrototypeIcon should include the account menu ${icon} icon copied from the prototype`,
    );
  }
  for (const label of ["外观模式", "字体字号", "帮助和支持", "导入导出", "登出"]) {
    assert.match(
      sidebar,
      new RegExp(`icon="[a-z-]+"[\\s\\S]*${label}`),
      `account menu item ${label} should have a leading icon`,
    );
  }
  assert.match(
    css,
    /\.mewmo-floating-menu__icon\s*\{[\s\S]*width:\s*16px[\s\S]*height:\s*16px/,
    "shared menu icon slots should lock to the prototype 16px size",
  );
  assert.match(
    css,
    /\.mewmo-floating-menu__check\s*\{[\s\S]*margin-left:\s*auto/,
    "checked menu options should keep the prototype trailing check slot",
  );
  assert.doesNotMatch(
    editorInteractions,
    /&#10003;|✓/,
    "editor popup menus should not use text glyphs for active check marks",
  );
  assert.match(
    editorInteractions,
    /getBlockStyleMenuCheckSvg/,
    "editor popup menus should render active check marks as inline svg",
  );
  assert.match(
    editorInteractions,
    /getBlockStyleMenuPosition/,
    "editor popup menus should clamp fixed positioning to the viewport",
  );
  assert.doesNotMatch(
    css,
    /\.mewmo-block-style-menu\[data-show="false"\]\s*\{[\s\S]*display:\s*none/,
    "editor popup menus should hide with opacity/visibility transitions, not display none",
  );
});

test("account menu logout button signs the user out", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
  assert.match(
    sidebar,
    /import \{ signOut \} from "next-auth\/react"/,
    "sidebar should import signOut from next-auth/react to power logout",
  );
  assert.match(
    sidebar,
    /signOut\(\{\s*callbackUrl:\s*"\/login"\s*\}\)/,
    "logout should sign out and redirect to the login page",
  );
  assert.match(
    sidebar,
    /icon="logout"\s+onClick=\{\(\) => setLogoutOpen\(true\)\}/,
    "the account menu logout button should open the logout confirmation",
  );
  assert.match(
    sidebar,
    /title="确认登出？"/,
    "logout should ask for confirmation before signing out",
  );
  assert.doesNotMatch(
    sidebar,
    /icon="logout"\s+onClick=\{defer\}/,
    "logout button should no longer be a deferred placeholder",
  );
});

test("account menu restores prototype right-side submenus", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
  const css = read("apps/web/src/app/globals.css");

  for (const label of ["外观模式", "字体字号", "导入导出"]) {
    assert.match(
      sidebar,
      new RegExp(`<AccountSubmenu label="${label}"[\\s\\S]*acct-submenu`),
      `account menu parent ${label} should expose a right-side submenu like the prototype`,
    );
  }
  assert.match(
    sidebar,
    /className="acct-chev"[\s\S]*name="caret"/,
    "account submenu parents should render the prototype caret icon",
  );
  for (const label of ["跟随系统", "深色模式", "浅色模式", "导入", "导出"]) {
    assert.match(
      sidebar,
      new RegExp(`<AccountSubmenuRow icon="[a-z-]+"[\\s\\S]*${label}`),
      `submenu option ${label} should have a leading icon`,
    );
  }
  assert.match(
    css,
    /\.acct-submenu\s*\{[\s\S]*position:\s*absolute[\s\S]*left:\s*calc\(100% \+ 4px\)[\s\S]*opacity:\s*0[\s\S]*visibility:\s*hidden[\s\S]*transition:/,
    "account submenus should be right-side popup cards with an animated hidden state",
  );
  assert.match(
    css,
    /\.acct-menu__has-sub:hover\s*>\s*\.acct-submenu\s*\{[\s\S]*opacity:\s*1[\s\S]*visibility:\s*visible[\s\S]*transform:\s*none/,
    "account submenus should animate open on hover",
  );
  assert.doesNotMatch(
    css,
    /\.acct-submenu\s*\{[^}]*display:\s*none|\.acct-menu__has-sub:hover\s*>\s*\.acct-submenu\s*\{[^}]*display:\s*block/,
    "account submenus should not use display toggles that skip close transitions",
  );
});

test("account theme color swatches are removed", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
  const theme = read("apps/web/src/lib/theme.tsx");

  assert.doesNotMatch(
    theme,
    /applyAccentColor|setAccent|mewmo-accent/,
    "theme state should no longer expose accent controls after the theme-color removal",
  );
  assert.doesNotMatch(
    sidebar,
    /acct-submenu--color|data-accent|setAccent|accentSwatches/,
    "sidebar account menu should no longer render theme color swatches",
  );
  assert.doesNotMatch(
    sidebar,
    /<AccountSubmenu label="主题色"/,
    "the theme color account submenu should be removed",
  );
});

test("account font submenu applies reader typography and stays inside the viewport", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
  const theme = read("apps/web/src/lib/theme.tsx");
  const css = read("apps/web/src/app/globals.css");
  const editorCss = read("apps/web/src/components/editor/editor-theme.css");

  assert.match(
    theme,
    /readerFont:\s*ReaderFont[\s\S]*setReaderFont:\s*\(font:\s*ReaderFont\)\s*=>\s*void[\s\S]*readerFontSize:\s*ReaderFontSize[\s\S]*setReaderFontSize:\s*\(size:\s*ReaderFontSize\)\s*=>\s*void/,
    "theme state should expose reader font family and size controls",
  );
  assert.match(
    theme,
    /localStorage\.getItem\("mewmo-reader-font"\)[\s\S]*localStorage\.setItem\("mewmo-reader-font",\s*font\)/,
    "reader font family should persist separately from appearance and accent",
  );
  assert.match(
    theme,
    /localStorage\.getItem\("mewmo-reader-font-size"\)[\s\S]*localStorage\.setItem\("mewmo-reader-font-size",\s*size\)/,
    "reader font size should persist separately from appearance and accent",
  );
  assert.match(
    theme,
    /applyReaderTypography\(readerFont,\s*readerFontSize\)/,
    "reader typography should apply through a single root variable writer",
  );
  assert.match(
    theme,
    /root\.style\.setProperty\("--reader-font",\s*readerFontValue\(font\)\)/,
    "reader font selection should update a root CSS variable",
  );
  assert.match(
    theme,
    /root\.style\.setProperty\("--reader-font-size",\s*readerFontSizeValue\(size\)\)/,
    "reader size selection should update a root CSS variable",
  );
  assert.match(
    sidebar,
    /const \{ theme, setTheme \} = useTheme\(\)[\s\S]*const \{ readerFont, setReaderFont, readerFontSize, setReaderFontSize \} = useTheme\(\)/,
    "account menu should read and update reader typography from shared theme state",
  );
  for (const font of ["sans", "serif", "mono"]) {
    assert.match(
      sidebar,
      new RegExp(`data-font="${font}"[\\s\\S]*readerFont === "${font}"[\\s\\S]*setReaderFont\\("${font}"\\)`),
      `font option ${font} should keep the prototype data-font hook and update the selected reader font`,
    );
  }
  for (const size of ["small", "default", "large"]) {
    assert.match(
      sidebar,
      new RegExp(`data-fontsize="${size}"[\\s\\S]*readerFontSize === "${size}"[\\s\\S]*setReaderFontSize\\("${size}"\\)`),
      `font size option ${size} should keep the prototype data-fontsize hook and update the selected reader size`,
    );
  }
  assert.match(
    css,
    /\.mewmo-document,\s*\.mewmo-note-editor__body,\s*\.mewmo-clip-prose\s*\{[\s\S]*font-family:\s*var\(--reader-font\)/,
    "reader typography should target document, editor body, and clip prose instead of resizing the whole app chrome",
  );
  assert.match(
    css,
    /\.mewmo-document p[\s\S]*font-size:\s*var\(--reader-font-size\)/,
    "document paragraphs should consume the reader font-size variable",
  );
  assert.match(
    css,
    /\.mewmo-clip-prose,[\s\S]*\.mewmo-clip-prose th\s*\{[\s\S]*font-size:\s*var\(--reader-font-size\)/,
    "clip prose should consume the reader font-size variable",
  );
  assert.match(
    editorCss,
    /\.crepe-editor-wrapper\s+\.milkdown\s*\{[\s\S]*font-family:\s*var\(--reader-font\)/,
    "note editor shell should consume the selected reader font instead of the fixed app sans font",
  );
  assert.match(
    editorCss,
    /\.crepe-editor-wrapper\s+\.milkdown\s+\.ProseMirror\s*\{[\s\S]*font-size:\s*var\(--reader-font-size\)/,
    "note editor content should consume the selected reader font size on the real ProseMirror node",
  );
  assert.match(
    sidebar,
    /const submenuRef = useRef<HTMLDivElement>\(null\)[\s\S]*updateSubmenuPlacement/,
    "account submenus should measure themselves before opening so they can avoid viewport overflow",
  );
  assert.match(
    sidebar,
    /acct-menu__has-sub--left[\s\S]*acct-menu__has-sub--up/,
    "account submenus should expose flip-left and flip-up classes when close to viewport edges",
  );
  assert.match(
    css,
    /\.acct-menu__has-sub--left\s*>\s*\.acct-submenu\s*\{[\s\S]*right:\s*calc\(100% \+ 4px\)[\s\S]*left:\s*auto/,
    "overflowing account submenus should flip to the left of their parent row",
  );
  assert.match(
    css,
    /\.acct-menu__has-sub--up\s*>\s*\.acct-submenu\s*\{[\s\S]*top:\s*auto[\s\S]*bottom:\s*-6px/,
    "overflowing account submenus should align upward when they would fall below the viewport",
  );
});

test("today view aggregates notes clips and subscription updates with prototype mixed cards", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
  const todayPage = read("apps/web/src/app/(app)/today/page.tsx");
  const todayRoute = read("apps/web/src/app/api/today/route.ts");
  const css = read("apps/web/src/app/globals.css");

  assert.match(
    sidebar,
    /today:\s*useRememberedWorkspaceHref\("today",\s*"\/today"\)[\s\S]*href=\{rememberedWorkspaceHrefs\.today\}[\s\S]*icon="calendar"[\s\S]*label="今天"/,
    "sidebar today item should navigate to the real today route instead of the deferred placeholder",
  );
  assert.match(
    todayRoute,
    /const startOfToday[\s\S]*const startOfTomorrow/,
    "today API should bound its aggregation to today's local day window",
  );
  assert.match(
    todayRoute,
    /prisma\.note\.findMany[\s\S]*createdAt:\s*\{\s*gte:\s*startOfToday,\s*lt:\s*startOfTomorrow\s*\}/,
    "today API should include notes created today",
  );
  assert.match(
    todayRoute,
    /prisma\.clip\.findMany[\s\S]*createdAt:\s*\{\s*gte:\s*startOfToday,\s*lt:\s*startOfTomorrow\s*\}/,
    "today API should include clips collected today",
  );
  assert.match(
    todayRoute,
    /prisma\.feedEntry\.findMany[\s\S]*OR:\s*\[[\s\S]*createdAt:\s*\{\s*gte:\s*startOfToday,\s*lt:\s*startOfTomorrow\s*\}[\s\S]*publishedAt:\s*\{\s*gte:\s*startOfToday,\s*lt:\s*startOfTomorrow\s*\}/,
    "today API should include subscription entries updated or published today",
  );
  assert.match(
    todayPage,
    /ListColumn[\s\S]*title="今天"/,
    "today page should use the shared list column with the prototype title",
  );
  assert.match(
    todayPage,
    /action=\{[\s\S]*aria-label="新建笔记"[\s\S]*<PrototypeIcon name="pen-new-square" size=\{17\}/,
    "today toolbar should expose the same new-note icon action as the notes list",
  );
  assert.match(
    todayPage,
    /\.sort\(\(a, b\) => new Date\(b\.updatedAt\)\.getTime\(\) - new Date\(a\.updatedAt\)\.getTime\(\)\)/,
    "today list should be fixed to most-recently-updated order",
  );
  assert.doesNotMatch(
    todayPage,
    /sortMode|setSortMode|onSortChange|customSortLabel/,
    "today should not expose user-controlled list sorting",
  );
  assert.doesNotMatch(
    todayPage,
    /quickSwitch[\s\S]*href="\/feeds"/,
    "today title quick switch should keep subscription items in the list but not offer a subscription shortcut",
  );
  assert.match(
    todayPage,
    /if \(type === "note"\) return "note"[\s\S]*if \(type === "clip"\) return "bookmark"[\s\S]*return "rss"/,
    "today mixed cards should map to the simplified note, clip, and subscription icons",
  );
  assert.doesNotMatch(
    todayPage,
    /src-badge|PrototypeIcon name="doc"/,
    "today mixed cards should not keep the prototype's complex doc-plus-badge icon treatment",
  );
  assert.match(
    todayPage,
    /mewmo-list-card__source mewmo-knowledge-card__source/,
    "today cards should follow the knowledge card source row instead of a separate card format",
  );
  assert.match(
    todayPage,
    /<PrototypeIcon name=\{todayTypeIcon\(item\.type\)\} size=\{15\}/,
    "today type icon should sit in the same source row position as knowledge cards",
  );
  assert.doesNotMatch(
    todayPage,
    /mewmo-today-card__type/,
    "today type icon should not sit in the title row",
  );
  assert.match(
    todayPage,
    /item\.coverImage[\s\S]*mewmo-list-card__cover[\s\S]*referrerPolicy="no-referrer"/,
    "today clip and subscription cards should render cover images like knowledge cards",
  );
  assert.match(
    todayPage,
    /extractNoteImages\(item\.content\s*\?\?\s*""\)[\s\S]*mewmo-list-card__thumbs/,
    "today note cards should reuse the knowledge card note thumbnail pattern",
  );
  assert.match(
    todayPage,
    /const \[selectedId, setSelectedId\]/,
    "today should keep selection inside the aggregate view instead of navigating to another section",
  );
  assert.match(
    todayPage,
    /<button[\s\S]*className=\{`mewmo-list-card mewmo-list-card--button mewmo-knowledge-card/,
    "today mixed cards should reuse the knowledge card shell instead of a standalone today card",
  );
  assert.doesNotMatch(
    todayPage,
    /mewmo-today-card/,
    "today cards should not carry a separate today-card class",
  );
  assert.doesNotMatch(
    todayPage,
    /<Link[\s\S]*href=\{item\.href\}/,
    "clicking a today card should not route to notes, clips, or feeds",
  );
  assert.doesNotMatch(
    css,
    /\.mewmo-today-card__type/,
    "today should not carry a separate title-row type icon style",
  );
  assert.match(
    todayPage,
    /selected\?\.type === "note"[\s\S]*<NoteEditor[\s\S]*noteId=\{selected\.id\}[\s\S]*onContentChange=\{updateSelectedNoteContent\}/,
    "today selected notes should reuse the editable note editor and sync content changes",
  );
});

test("today title menu filters the mixed list by content type", () => {
  const todayPage = read("apps/web/src/app/(app)/today/page.tsx");
  const listColumn = read("apps/web/src/components/shell/ListColumn.tsx");

  assert.match(
    listColumn,
    /titleMenuLabel\?:\s*string/,
    "list title menus should allow pages to name the menu for local controls",
  );
  assert.match(
    todayPage,
    /type TodayFilter = "all" \| TodayItemType/,
    "today should keep an explicit filter model for all notes clips and feeds",
  );
  assert.match(
    todayPage,
    /const \[filter,\s*setFilter\] = useState<TodayFilter>\("all"\)/,
    "today should default to the unfiltered mixed list",
  );
  assert.match(
    todayPage,
    /titleMenuLabel="筛选"/,
    "today title menu should be labelled as a filter menu instead of a quick switch",
  );
  assert.match(
    todayPage,
    /todayFilters\.map\(\(item\) => \(\s*<FloatingMenuButton[\s\S]*icon=\{item\.icon\}[\s\S]*checked=\{filter === item\.value\}/,
    "today filter options should use the shared checked floating menu row",
  );
  assert.match(
    todayPage,
    /if \(filter !== "all" && item\.type !== filter\) return false/,
    "today visible items should be filtered by the selected content type before search",
  );
});

test("knowledge title menu filters the mixed list by readable content type", () => {
  const knowledgePage = read("apps/web/src/app/(app)/knowledge-bases/page.tsx");
  const knowledgeContent = read("apps/web/src/lib/knowledge-content.ts");

  assert.match(
    knowledgeContent,
    /export type KnowledgeContentType = "note" \| "article" \| "media" \| "video" \| "podcast" \| "pdf" \| "ebook"/,
    "knowledge filtering should use a shared readable content type model",
  );
  assert.match(
    knowledgeContent,
    /export function classifyKnowledgeContentType/,
    "knowledge content type classification should be testable outside the page",
  );
  assert.match(
    knowledgePage,
    /type KnowledgeFilter = "all" \| KnowledgeContentType/,
    "knowledge should keep an explicit filter model for all local and imported item types",
  );
  assert.match(
    knowledgePage,
    /const \[filter,\s*setFilter\] = useState<KnowledgeFilter>\("all"\)/,
    "knowledge should default to the unfiltered mixed list",
  );
  assert.match(
    knowledgePage,
    /titleMenuLabel="筛选"/,
    "knowledge title menu should be labelled as a filter menu instead of a quick switch",
  );
  assert.match(
    knowledgePage,
    /knowledgeFilters\.map\(\(item\) => \(\s*<FloatingMenuButton[\s\S]*icon=\{item\.icon\}[\s\S]*checked=\{filter === item\.value\}/,
    "knowledge filter options should use the shared checked floating menu row",
  );
  assert.match(
    knowledgePage,
    /if \(filter !== "all" && classifyKnowledgeContentType\(item\) !== filter\) return false/,
    "knowledge visible items should be filtered by readable content type before search",
  );
});

test("list title menu no longer exposes sorting controls", () => {
  const listColumn = read("apps/web/src/components/shell/ListColumn.tsx");
  const notesPage = read("apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx");
  const notesDetail = read("apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx");
  const clipsPage = read("apps/web/src/app/(app)/clips/page.tsx");
  const clipsDetail = read("apps/web/src/app/(app)/clips/[id]/ClipDetailClient.tsx");
  const feedsPage = read("apps/web/src/app/(app)/feeds/page.tsx");
  const knowledgePage = read("apps/web/src/app/(app)/knowledge-bases/page.tsx");

  assert.doesNotMatch(listColumn, /排序|最近更新|最新创建|ListSortMode|sortMode|onSortChange|customSortLabel/);
  assert.match(notesPage, /new Date\(b\.updatedAt\)\.getTime\(\) - new Date\(a\.updatedAt\)\.getTime\(\)/);
  assert.match(notesDetail, /new Date\(b\.updatedAt\)\.getTime\(\) - new Date\(a\.updatedAt\)\.getTime\(\)/);
  assert.match(clipsPage, /new Date\(b\.createdAt\)\.getTime\(\) - new Date\(a\.createdAt\)\.getTime\(\)/);
  assert.match(clipsDetail, /new Date\(b\.createdAt\)\.getTime\(\) - new Date\(a\.createdAt\)\.getTime\(\)/);
  assert.match(feedsPage, /feedEntryTimestamp\(right\) - feedEntryTimestamp\(left\)/);
  assert.match(knowledgePage, /sortKnowledgeItemsForList\(filtered\)/);
});

test("note metadata tag picker is removed", () => {
  const noteEditor = read("apps/web/src/components/editor/NoteEditor.tsx");

  assert.doesNotMatch(
    noteEditor,
    /mewmo-tag-picker|tagPickerAnchorRef|tagPickerOpen|noteTagPalette/,
    "note editor should no longer render the tag picker after the tag feature removal",
  );
});

test("clip creation persists fetched source metadata while reserving summary for AI", () => {
  const clipRoute = read("apps/web/src/app/api/clips/route.ts");
  const refreshRoute = read("apps/web/src/app/api/clips/[id]/route.ts");

  assert.match(clipRoute, /await fetchClipFromUrl\(parsed\.data\.url\)/);
  assert.match(clipRoute, /summary:\s*null/);
  for (const field of ["favicon", "coverImage", "excerpt", "sourceName", "author", "publishedAt"]) {
    assert.match(
      clipRoute,
      new RegExp(`${field}:\\s*fetched\\.${field}\\s*\\?\\?\\s*null`),
      `${field} should be a concrete fetched value or null`,
    );
  }
  assert.match(
    refreshRoute,
    /const data = normalizeRefreshData\(fetched\)/,
    "synchronous extraction should normalize fetched metadata before the Prisma update",
  );
});

test("clip detail uses article metadata and omits the redundant source strip", () => {
  const clipDetail = read(
    "apps/web/src/app/(app)/clips/[id]/ClipDetailClient.tsx",
  );
  const css = read("apps/web/src/app/globals.css");

  assert.doesNotMatch(
    clipDetail,
    /mewmo-clip-src/,
    "clip detail should not render the extra source strip above the article",
  );
  assert.doesNotMatch(
    css,
    /mewmo-clip-src/,
    "clip detail should not keep styles for the removed extra source strip",
  );
  assert.match(
    clipDetail,
    /formatArticleDate\(clip\.publishedAt\)/,
    "clip detail metadata should use the article publish date, not createdAt",
  );
  assert.match(
    clipDetail,
    /articleMetaItems/,
    "clip detail should build a prototype-style metadata row from source, author, and publish date",
  );
});

test("clips index preview renders the selected article body and metadata", () => {
  const clipsIndex = read("apps/web/src/app/(app)/clips/page.tsx");

  assert.match(
    clipsIndex,
    /ClipContentRenderer/,
    "clips index should render selected clip content instead of only the summary",
  );
  assert.match(
    clipsIndex,
    /selectedClip/,
    "clips index should load the selected clip detail data for the reader preview",
  );
  assert.match(
    clipsIndex,
    /formatArticleDate\(clip\.publishedAt\)/,
    "clips index preview should use article publication date metadata",
  );
  assert.doesNotMatch(
    clipsIndex,
    /mewmo-source-strip/,
    "clips index preview should not render the removed source strip",
  );
});

test("clip list cards use cover images, body previews, and recency time", () => {
  const clipsIndex = read("apps/web/src/app/(app)/clips/page.tsx");
  const clipDetail = read(
    "apps/web/src/app/(app)/clips/[id]/ClipDetailClient.tsx",
  );
  const css = read("apps/web/src/app/globals.css");

  for (const source of [clipsIndex, clipDetail]) {
    assert.match(source, /clipPreviewText/, "clip cards should show body-derived preview text");
    assert.match(source, /formatClipListTime/, "clip cards should use the compact recency time format");
    assert.match(source, /mewmo-list-card__cover/, "clip cards should render rectangular cover images");
    assert.match(source, /referrerPolicy="no-referrer"/, "WeChat cover images must load without a referrer");
  }
  assert.match(
    clipsIndex,
    /measureElement:\s*\(element\)\s*=>\s*element\.getBoundingClientRect\(\)\.height/,
    "virtualized clip rows should measure their real rendered height instead of relying on a fixed estimate",
  );
  assert.match(
    clipsIndex,
    /ref=\{virtualizer\.measureElement\}/,
    "virtualized clip rows should report their DOM height back to the virtualizer",
  );
  assert.doesNotMatch(
    clipsIndex,
    /height:\s*`\$\{virtualRow\.size\}px`/,
    "virtualized clip rows must not force a stale row height that can overlap cover and metadata",
  );
  assert.match(
    css,
    /\.mewmo-list-card__cover\s*\{[\s\S]*width:\s*132px[\s\S]*height:\s*76px[\s\S]*margin-top:\s*10px/,
    "clip cover should use the prototype 132px by 76px landscape thumbnail frame",
  );
  assert.match(
    css,
    /\.mewmo-favicon\s*\{[\s\S]*border:\s*0[\s\S]*background:\s*transparent/,
    "site favicons should render as the site's image, without an added card border or fill",
  );
  assert.match(
    css,
    /\.mewmo-list-card__source--clip\s+\.mewmo-favicon\s*\{[\s\S]*width:\s*14px[\s\S]*height:\s*14px[\s\S]*font-size:\s*8px/,
    "clip source favicons should use the prototype 14px source icon size so WeChat and text favicons match",
  );
  assert.match(
    css,
    /\.mewmo-list-card__source--clip\s+\.mewmo-favicon\s+img\s*\{[\s\S]*object-fit:\s*contain/,
    "clip source favicon images should fit inside the 14px icon slot instead of being cropped larger than text favicons",
  );
});

test("subscription drawer uses site icons and prototype selection state", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
  const css = read("apps/web/src/app/globals.css");

  assert.doesNotMatch(
    sidebar,
    /<span className="mewmo-favicon">\s*\{feed\.favicon \?/,
    "subscription source rows should not inline conditional text fallback in the row",
  );
  assert.match(
    sidebar,
    /<FeedSiteIcon feed=\{feed\} \/>/,
    "subscription source rows should render the website favicon for each feed source",
  );
  assert.match(
    sidebar,
    /function feedSiteIcon\(feed: SidebarFeed\): string[\s\S]*return `\$\{url\.origin\}\/favicon\.ico`/,
    "subscription source rows should derive a source-site favicon when the feed record has no stored favicon",
  );
  assert.match(
    sidebar,
    /function googleFeedIcon\(feed: SidebarFeed\): string[\s\S]*google\.com\/s2\/favicons/,
    "subscription source rows may fall back to Google favicon only after trying the source site icon",
  );
  assert.match(
    sidebar,
    /function faviconServiceIcon\(feed: SidebarFeed\): string[\s\S]*favicon\.im/,
    "subscription source rows should use a domain favicon service when the source site has no /favicon.ico",
  );
  assert.doesNotMatch(
    sidebar,
    /mewmo-feed-(?:pending|update)-dot/,
    "subscription drawer should not render unread or pending red status dots",
  );
  assert.doesNotMatch(
    sidebar,
    /mewmo-feed-pane__back \$\{!activeFeedId \? "mewmo-nav-row--active"/,
    "feed drawer back/header row should not reuse the source selected state",
  );
  assert.match(
    sidebar,
    /className="mewmo-nav-row mewmo-nav-row--group mewmo-feed-pane__back"[\s\S]*setFeedDrawer\(null\);[\s\S]*mewmo-nav-row__chevron[\s\S]*mewmo-nav-row__icon[\s\S]*mewmo-nav-row__label/,
    "feed drawer should make the full header row a reliable return target",
  );
  assert.match(
    css,
    /\.mewmo-feed-pane__back\s*\{[\s\S]*padding:\s*6px 34px 6px 6px/,
    "feed drawer header should align with the main sidebar row rhythm",
  );
  assert.match(
    css,
    /\.mewmo-feed-source-row\s+\.mewmo-nav-row--active\s+\.mewmo-favicon\s*\{[\s\S]*background:\s*transparent/,
    "selected subscription rows should keep the site icon treatment instead of adapting it like text",
  );
  assert.match(
    css,
    /\.mewmo-feed-source-row\s+\.mewmo-favicon\s+img\s*\{[\s\S]*object-fit:\s*contain/,
    "subscription source favicons should show the complete site logo instead of being cropped",
  );
});

test("list search and clip-url inputs focus after their prototype reveal animation", () => {
  const listColumn = read("apps/web/src/components/shell/ListColumn.tsx");

  assert.match(
    listColumn,
    /searchInputRef\s*=\s*useRef<HTMLInputElement>\(null\)/,
    "search input should have a direct ref for reliable focus after opening",
  );
  assert.match(
    listColumn,
    /clipInputRef\s*=\s*useRef<HTMLInputElement>\(null\)/,
    "clip URL input should have a direct ref for reliable focus after opening",
  );
  assert.match(
    listColumn,
    /window\.setTimeout\([\s\S]*80/,
    "input focus should wait for the prototype reveal timing instead of relying on autoFocus during clip-path animation",
  );
  assert.match(
    listColumn,
    /searchInputRef\.current\?\.focus\(\)[\s\S]*searchInputRef\.current\?\.select\(\)/,
    "opening search should focus and select the input so typing works immediately",
  );
  assert.match(
    listColumn,
    /clipInputRef\.current\?\.focus\(\)[\s\S]*clipInputRef\.current\?\.select\(\)/,
    "opening add-link should focus and select the URL input so typing works immediately",
  );
  assert.doesNotMatch(
    listColumn,
    /autoFocus=\{searchOpen\}|autoFocus=\{clipInputOpen\}/,
    "animated list inputs should not depend on autoFocus because it fires before the visible state is ready",
  );
});

test("clip-url input opens as the prototype inline toolbar reveal", () => {
  const listColumn = read("apps/web/src/components/shell/ListColumn.tsx");
  const css = read("apps/web/src/app/globals.css");

  assert.doesNotMatch(
    listColumn,
    /PopoverMenu/,
    "clip URL entry should not use the shared popover primitive",
  );
  assert.doesNotMatch(
    listColumn,
    /clipButtonRef|anchorRef=\{clipButtonRef\}/,
    "clip URL entry should not anchor to the add-link button as a floating card",
  );
  assert.match(
    listColumn,
    /mewmo-list-column--clip-input/,
    "clip URL reveal should mark the list column while the inline overlay is open",
  );
  assert.match(
    listColumn,
    /<div className="mewmo-clip-url"/,
    "clip URL entry should render inside the list toolbar as an inline overlay",
  );
  assert.match(
    listColumn,
    /mewmo-clip-url__field[\s\S]*PrototypeIcon name="plus"/,
    "clip URL input row should keep a leading prototype icon",
  );
  assert.match(
    css,
    /\.mewmo-clip-url\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0[^}]*clip-path:\s*inset\(0 0 0 100%\)/s,
    "clip URL overlay should cover the toolbar and reveal with the prototype clip-path animation",
  );
  assert.match(
    css,
    /\.mewmo-list-column--clip-input\s+\.mewmo-clip-url\s*\{[^}]*clip-path:\s*inset\(0 0 0 0\)/s,
    "open clip URL entry should use the same inline reveal state as the prototype",
  );
  assert.match(
    css,
    /\.mewmo-list-column--clip-input\s+\.mewmo-list-column__clip-button\s*\{[^}]*opacity:\s*0[^}]*pointer-events:\s*none[^}]*transform:\s*scale\(0\.25\)/s,
    "opening clip URL entry should fade the clicked add button in place like the prototype",
  );
  assert.match(
    css,
    /\.mewmo-list-column--clip-input\s+\.mewmo-list-column__search-button\s*\{[^}]*visibility:\s*hidden/s,
    "opening clip URL entry should keep the search button slot reserved while hiding it",
  );
});

test("clip add button pre-fills copied links from the clipboard", () => {
  const listColumn = read("apps/web/src/components/shell/ListColumn.tsx");

  assert.match(
    listColumn,
    /extractClipboardUrl/,
    "clip add should use a dedicated parser for links copied with surrounding text",
  );
  assert.match(
    listColumn,
    /navigator\.clipboard\?\.readText\(\)/,
    "clip add should inspect the clipboard during the add-button gesture",
  );
  assert.match(
    listColumn,
    /setClipUrl\(clipboardUrl\)/,
    "clip add should pre-fill the URL field when the clipboard contains a link",
  );
  assert.match(
    listColumn,
    /\.catch\(\(\)\s*=>\s*null\)/,
    "clipboard permission failures should silently fall back to the normal empty input",
  );
  assert.match(
    listColumn,
    /onClick=\{\(\)\s*=>\s*void openClipInput\(\)\}/,
    "the plus button should run the clipboard-aware open handler",
  );
});

test("clip refresh waits for synchronous extraction and reports changed state", () => {
  const clipRoute = read("apps/web/src/app/api/clips/[id]/route.ts");
  const clipsIndex = read("apps/web/src/app/(app)/clips/page.tsx");
  const clipDetail = read("apps/web/src/app/(app)/clips/[id]/ClipDetailClient.tsx");

  assert.match(clipRoute, /export async function POST/);
  assert.doesNotMatch(clipRoute, /background|addClipFetchJob/);
  assert.match(clipRoute, /fetchClipFromUrl\(clip\.url\)/,
    "the authenticated user request should fetch the source");
  assert.match(clipRoute, /changed:\s*hasClipChanged\(clip, data\)/,
    "completed extraction should report whether stored content changed");

  for (const source of [clipsIndex, clipDetail]) {
    assert.match(source, /showToast\("正在检查更新\.\.\.",\s*"loading"\)/);
    assert.match(source, /data\.changed \? "已拉取最新内容" : "已是最新"/);
    assert.match(source, /fetch\(`\/api\/clips\/\$\{[^}]+\.id\}`,\s*\{\s*method:\s*"POST"/);
  }
});

test("add feed category selector uses the prototype popover card", () => {
  const feedsPage = read("apps/web/src/app/(app)/feeds/page.tsx");
  const floatingMenu = read("apps/web/src/components/ui/FloatingMenu.tsx");
  const css = read("apps/web/src/app/globals.css");

  assert.match(
    feedsPage,
    /PopoverMenu/,
    "add-feed category selection should be a popup card, not a flat button grid",
  );
  assert.match(
    feedsPage,
    /className="addfeed__catrow"/,
    "add-feed category selector should use the prototype labeled row",
  );
  assert.match(
    feedsPage,
    /className=\{`afr-catsel \$\{categoryMenuOpen \? "open" : ""\}`\}/,
    "category selector should expose the prototype open state class",
  );
  assert.match(
    feedsPage,
    /className="afr-catsel__btn"/,
    "category selector should use the prototype current-category button",
  );
  assert.match(
    feedsPage,
    /className="mewmo-card-menu afr-catsel__menu mewmo-addfeed-category-menu"/,
    "category selector popup should keep the prototype menu class while using the shared popover shell",
  );
  assert.match(
    feedsPage,
    /FloatingMenuButton[\s\S]*icon=\{item\.icon\}[\s\S]*checked=\{type === item\.type\}/,
    "each add-feed category option should have an icon slot and selected state",
  );
  assert.match(
    feedsPage,
    /disabled=\{Boolean\(item\.deferred\)\}/,
    "deferred category placeholders should stay visible but disabled in the menu",
  );
  assert.match(
    floatingMenu,
    /disabled\?:\s*boolean/,
    "shared floating menu buttons should support disabled prototype menu items",
  );
  assert.doesNotMatch(
    css,
    /\.afr-catsel\s*\{[^}]*grid-template-columns:\s*repeat\(4/,
    "add-feed category selector must not fall back to the non-prototype flat grid",
  );
  assert.match(
    css,
    /\.mewmo-addfeed-category-menu\s*\{[\s\S]*min-width:\s*128px/,
    "category popup should use a stable button-sized width after being portaled to body",
  );
  assert.match(
    css,
    /\.mewmo-addfeed-category-menu\s*\{[\s\S]*z-index:\s*19\d/,
    "category popup is portaled to body, so it must sit above the add-feed modal panel",
  );
  assert.match(
    css,
    /\.afr-catsel\.open\s+\.afr-catsel__btn\s+\.mewmo-prototype-icon/,
    "category caret icon should rotate when the popover is open",
  );
});
