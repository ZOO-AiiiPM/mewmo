import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("subscription refresh is scoped to a concrete feed source menu", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
  const subscriptionGroup = sidebar.slice(
    sidebar.indexOf('id="subscription"'),
    sidebar.indexOf('id="knowledge"'),
  );

  assert.doesNotMatch(
    subscriptionGroup,
    /FloatingMenuButton icon="sync"/,
    "the top-level subscription menu should not offer a grouped refresh action",
  );
  assert.match(
    sidebar,
    /const refreshFeed = async \(feed: SidebarFeed\) => \{[\s\S]*fetch\(`\/api\/feeds\/\$\{feed\.id\}\/refresh`, \{ method: "POST" \}\)/,
    "feed refresh should call the per-source refresh endpoint",
  );
  assert.match(
    sidebar,
    /<FloatingMenuButton icon="sync" onClick=\{\(\) => void refreshFeed\(feed\)\}>\s*刷新\s*<\/FloatingMenuButton>/,
    "each feed source row menu should expose the refresh action",
  );
});

test("floating menu destructive icons inherit the red danger color", () => {
  const css = read("apps/web/src/app/globals.css");

  const normalHoverIndex = css.search(/\.mewmo-floating-menu__item:hover\s*\{[\s\S]*?background:\s*var\(--hover\)[\s\S]*?\}/);
  const dangerHoverIndex = css.search(
    /\.mewmo-floating-menu__item\.mewmo-floating-menu__item--danger:hover[\s\S]*?\{[\s\S]*?color:\s*#d54f45[\s\S]*?\}/,
  );

  assert.ok(normalHoverIndex >= 0, "floating menu should keep the prototype hover background");
  assert.ok(
    dangerHoverIndex > normalHoverIndex,
    "destructive floating menu rows should override normal hover color after the generic hover rule",
  );
  assert.match(
    css,
    /\.mewmo-floating-menu__item\.mewmo-floating-menu__item--danger:hover\s+\.mewmo-floating-menu__icon[\s\S]*?\{[\s\S]*color:\s*#d54f45/,
    "danger menu icons should be red like the destructive label",
  );
});

test("subscription source icons preload before source rows render", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");

  assert.match(
    sidebar,
    /await preloadFeedIcons\(nextFeeds\);[\s\S]*setFeeds\(nextFeeds\)/,
    "feed rows should wait briefly for favicons before rendering to avoid first-paint logo pop-in",
  );
  assert.match(
    sidebar,
    /function preloadFeedIcon\(src: string\): Promise<void>[\s\S]*new Image\(\)[\s\S]*image\.decoding = "async"[\s\S]*image\.src = src/,
    "favicon preload should use the browser image cache instead of waiting for React img rendering",
  );
});

test("subscription type routes default to the first source instead of all entries", () => {
  const feedsPage = read("apps/web/src/app/(app)/feeds/page.tsx");
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");

  assert.match(
    feedsPage,
    /const effectiveFeedId = feedId \?\? feeds\[0\]\?\.id \?\? null/,
    "feeds page should use the first source as the effective selection when no feedId is present",
  );
  assert.match(
    feedsPage,
    /if \(!effectiveFeedId && !feedsLoaded\) \{[\s\S]*return;[\s\S]*\}/,
    "feeds page should not fetch all category entries while waiting for the first source",
  );
  assert.match(
    sidebar,
    /const effectiveActiveFeedId = activeFeedId \?\? feeds\[0\]\?\.id \?\? null/,
    "subscription drawer should highlight the first source by default",
  );
});

test("feed drawer header is a full-row return control", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");

  assert.doesNotMatch(
    sidebar,
    /className="mewmo-feed-pane__return"/,
    "feed drawer should not keep a tiny separate return button",
  );
  assert.match(
    sidebar,
    /className="mewmo-nav-row mewmo-nav-row--group mewmo-feed-pane__back"[\s\S]*setFeedDrawer\(null\);[\s\S]*mewmo-nav-row__chevron[\s\S]*mewmo-nav-row__icon[\s\S]*mewmo-nav-row__label/,
    "the whole feed drawer header row should return to the main sidebar",
  );
});

test("feed drawer keeps parent and child rows tightly stacked", () => {
  const css = read("apps/web/src/app/globals.css");

  assert.match(
    css,
    /\.mewmo-feed-pane__head\s*\{\s*margin-bottom:\s*0;\s*\}/,
    "feed drawer header should not add extra spacing before source rows",
  );
});

test("feed card metadata uses clip-style fixed time and ellipsized text", () => {
  const feedsPage = read("apps/web/src/app/(app)/feeds/page.tsx");
  const css = read("apps/web/src/app/globals.css");

  assert.match(
    feedsPage,
    /<time key=\{item\} dateTime=\{item\}>\s*\{formatClipListTime\(item\)\}\s*<\/time>/,
    "feed card dates should render as time elements like clip cards",
  );
  assert.match(
    css,
    /\.mewmo-feed-entry-card\s+\.mewmo-list-card__source\s+span\s*\{[\s\S]*min-width:\s*0[\s\S]*overflow:\s*hidden[\s\S]*text-overflow:\s*ellipsis[\s\S]*white-space:\s*nowrap/,
    "feed card metadata text should ellipsize instead of squeezing into the time",
  );
});

test("feed cards use the shared wrapper so hover and selected separators disappear", () => {
  const feedsPage = read("apps/web/src/app/(app)/feeds/page.tsx");

  assert.match(
    feedsPage,
    /<article[\s\S]*?key=\{entry\.id\}[\s\S]*?className=\{`mewmo-list-card-wrap[^`]*`\}[\s\S]*?mewmo-feed-entry-card/,
    "feed cards should participate in the shared adjacent-card separator rules",
  );
});

test("feed reader metadata uses clip-style dot separators", () => {
  const feedsPage = read("apps/web/src/app/(app)/feeds/page.tsx");

  assert.match(
    feedsPage,
    /<div className="mewmo-doc-meta">\s*\{meta\.map\(\(item, index\) => \(\s*<span key=\{`\$\{item\}-\$\{index\}`\}>\s*\{index > 0 && <b aria-hidden="true">·<\/b>\}/,
    "feed reader metadata should separate items with the same middle dot rhythm as clip reader metadata",
  );
  assert.match(
    feedsPage,
    /className="mewmo-doc-meta__link"[\s\S]*href=\{entry\.url\}[\s\S]*>\s*原文\s*<\/a>/,
    "feed reader metadata should expose the original article link inline",
  );
});

test("feed reader favorite action is wired to the real favorite API", () => {
  const feedsPage = read("apps/web/src/app/(app)/feeds/page.tsx");
  const articleMenu = read("apps/web/src/components/shell/FeedArticleMenu.tsx");
  const route = read("apps/web/src/app/api/feed-entries/[id]/favorite/route.ts");

  assert.doesNotMatch(
    feedsPage,
    /已暂存收藏状态/,
    "feed favorite action should no longer be a placeholder toast",
  );
  assert.doesNotMatch(
    feedsPage,
    /已收藏到知识库/,
    "feed favorite action should save into clips instead of knowledge bases",
  );
  assert.match(
    feedsPage,
    /const favoriteEntry = useCallback\(async \(entry: FeedEntry\)[\s\S]*fetch\(`\/api\/feed-entries\/\$\{entry\.id\}\/favorite`,\s*\{\s*method:\s*"POST"/,
    "feed favorite action should call the endpoint for the concrete card or reader entry",
  );
  assert.match(
    feedsPage,
    /favoriteActive=\{Boolean\(selectedEntry\?\.isFavorited\)\}/,
    "reader toolbar should receive the current feed entry favorite state",
  );
  assert.match(
    articleMenu,
    /\{favoriteActive \? "已收藏" : "收藏"\}/,
    "the shared feed article menu should reflect an already favorited entry",
  );
  assert.match(
    route,
    /prisma\.clip\.create\(\{[\s\S]*title:\s*entry\.title[\s\S]*content:\s*entry\.content[\s\S]*sourceName:\s*entry\.sourceName \?\? entry\.feed\.title/,
    "favorite route should persist the feed entry as a real clip",
  );
  assert.match(
    route,
    /prisma\.clip\.findFirst\(\{[\s\S]*url:\s*entry\.url/,
    "favorite route should reuse an existing clip with the same source URL",
  );
  assert.match(
    route,
    /enqueueArticleRuns\(\{[\s\S]*targetType:\s*"clip"[\s\S]*inputVersion:\s*clip\.version/,
    "new clips created from feed favorites should enter versioned AI workflows",
  );
});

test("favorited feed entries show a clip bookmark indicator at the card corner", () => {
  const feedsPage = read("apps/web/src/app/(app)/feeds/page.tsx");
  const css = read("apps/web/src/app/globals.css");

  assert.match(
    feedsPage,
    /\{entry\.isFavorited && \(\s*<span\s+className="mewmo-feed-entry-card__favorite"\s+aria-label="已保存到剪藏"\s*>[\s\S]*<PrototypeIcon name="bookmark" size=\{14\} dual \/>/,
    "favorited feed cards should render the saved-to-clips bookmark icon",
  );
  assert.match(
    css,
    /\.mewmo-feed-entry-card__favorite\s*\{[\s\S]*position:\s*absolute[\s\S]*right:\s*14px[\s\S]*bottom:\s*13px[\s\S]*color:\s*var\(--accent\)/,
    "the bookmark indicator should sit in the bottom-right status area",
  );
  assert.match(
    css,
    /\.mewmo-feed-entry-card__favorite\s+\.mewmo-prototype-icon\s*\{[\s\S]*background:\s*transparent[\s\S]*color:\s*currentColor/,
    "the saved-to-clips bookmark should render as a bare icon without a framed background",
  );
});

test("feed article actions are scoped to cards and the reader toolbar", () => {
  const sharedMenuPath = "apps/web/src/components/shell/FeedArticleMenu.tsx";
  assert.equal(
    existsSync(sharedMenuPath),
    true,
    "feed article actions should live in one shared menu component",
  );

  const sharedMenu = read(sharedMenuPath);
  const cardMenu = read("apps/web/src/components/shell/CardActionMenu.tsx");
  const toolbar = read("apps/web/src/components/shell/ReaderToolbar.tsx");
  const listColumn = read("apps/web/src/components/shell/ListColumn.tsx");
  const feedsPage = read("apps/web/src/app/(app)/feeds/page.tsx");

  assert.match(sharedMenu, /favoriteActive \? "已收藏" : "收藏"/);
  assert.match(sharedMenu, />\s*复制链接\s*</);
  assert.match(sharedMenu, /onFavorite\?: \(\(\) => void\) \| undefined/);
  assert.match(sharedMenu, /onCopyLink\?: \(\(\) => void\) \| undefined/);
  assert.match(toolbar, /menuKind === "feed"[\s\S]*<FeedArticleMenu/);
  assert.match(listColumn, /overflowAction/);
  assert.match(cardMenu, /type CardActionKind = "notes" \| "clips" \| "feed"/);
  assert.match(
    feedsPage,
    /<CardActionMenu[\s\S]*kind="feed"[\s\S]*favoriteActive=\{Boolean\(entry\.isFavorited\)\}/,
    "each feed card should own actions for its concrete entry",
  );
  assert.doesNotMatch(
    feedsPage,
    /overflowAction=\{/,
    "the feed list header should not expose actions for an unrelated selected article",
  );

  const css = read("apps/web/src/app/globals.css");
  assert.match(
    css,
    /\.mewmo-reader-toolbar__menu-wrap\s*>\s*\.mewmo-icon-button:disabled\s*\{[\s\S]*?cursor:\s*default[\s\S]*?opacity:/,
    "a disabled article menu should remain visible while looking unavailable",
  );
});

test("feed list headers keep complete titles while rendering one line", () => {
  const listColumn = read("apps/web/src/components/shell/ListColumn.tsx");
  const css = read("apps/web/src/app/globals.css");

  assert.match(
    listColumn,
    /className=\{`mewmo-list-title[\s\S]*?title=\{title\}[\s\S]*?<span>\{title\}<\/span>/,
    "the list header should retain the complete title for hover and accessibility",
  );
  assert.match(
    css,
    /\.mewmo-list-title-wrap\s*\{[\s\S]*?min-width:\s*0/,
    "the title wrapper should be allowed to shrink around fixed actions",
  );
  assert.match(
    css,
    /\.mewmo-list-title\s*\{[\s\S]*?min-width:\s*0[\s\S]*?max-width:\s*100%/,
    "the title button should stay within its available header width",
  );
  assert.match(
    css,
    /\.mewmo-list-title\s*>\s*span\s*\{[\s\S]*?min-width:\s*0[\s\S]*?overflow:\s*hidden[\s\S]*?text-overflow:\s*ellipsis[\s\S]*?white-space:\s*nowrap/,
    "long feed titles should render as one ellipsized line",
  );
});

test("feed add action uses the same quiet icon-button treatment as search", () => {
  const feedsPage = read("apps/web/src/app/(app)/feeds/page.tsx");
  const addActionStart = feedsPage.indexOf('aria-label="新增订阅"');
  const addAction = feedsPage.slice(Math.max(0, addActionStart - 180), addActionStart + 80);

  assert.match(
    addAction,
    /className="mewmo-icon-button"/,
    "feed add action should use the same base icon button as search",
  );
  assert.doesNotMatch(
    addAction,
    /mewmo-icon-button--primary/,
    "feed add action should not use the heavier primary treatment",
  );
});

test("add-feed search row aligns the input and search button to one baseline", () => {
  const feedsPage = read("apps/web/src/app/(app)/feeds/page.tsx");
  const css = read("apps/web/src/app/globals.css");
  const searchActionStart = feedsPage.indexOf('aria-label="搜索订阅"');
  const searchAction = feedsPage.slice(
    Math.max(0, searchActionStart - 180),
    searchActionStart + 80,
  );

  assert.doesNotMatch(
    searchAction,
    /mewmo-icon-button--primary/,
    "add-feed search should share the input's quiet surface instead of using a contrasting primary fill",
  );

  assert.match(
    css,
    /\.addfeed__inputwrap\s*\{[\s\S]*display:\s*grid[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+38px[\s\S]*align-items:\s*stretch/,
    "add-feed modal search row should reserve a fixed button column next to the input",
  );
  assert.match(
    css,
    /\.addfeed__inputwrap input\s*\{[\s\S]*width:\s*100%[\s\S]*height:\s*38px/,
    "add-feed modal input should fill its grid track and match the row height",
  );
  assert.match(
    css,
    /\.addfeed__inputwrap\s+\.mewmo-icon-button\s*\{[\s\S]*width:\s*38px[\s\S]*height:\s*38px[\s\S]*border:\s*1px solid var\(--line\)[\s\S]*background:\s*var\(--s2\)[\s\S]*color:\s*var\(--ink\)/,
    "add-feed modal search button should match the input's size and quiet surface",
  );
});

test("add-feed selection controls leave breathing room before result cards", () => {
  const css = read("apps/web/src/app/globals.css");

  assert.match(
    css,
    /\.addfeed__selectbar\s*\{[\s\S]*margin-bottom:\s*14px/,
    "batch selection controls should not sit directly against the first result card",
  );
});

test("add-feed discovery supports explicit Enter submission and batch selection", () => {
  const page = read("apps/web/src/app/(app)/feeds/page.tsx");
  const batch = read("apps/web/src/lib/feed-add-batch.ts");

  assert.match(
    page,
    /event\.key === "Enter"[\s\S]*!event\.nativeEvent\.isComposing[\s\S]*event\.preventDefault\(\)[\s\S]*requestSubmit\(\)/,
    "Enter should explicitly submit through the same form while ignoring IME composition",
  );
  assert.match(page, /type="checkbox"/, "discovery cards should expose checkbox selection");
  assert.match(page, /全选[\s\S]*取消全选/, "batch selection should offer select-all and clear-all actions");
  assert.match(page, /添加所选订阅/, "the primary action should describe batch creation");
  assert.match(batch, /Promise\.allSettled/, "each selected source should settle independently");
  assert.match(batch, /failedFeedUrls/, "partial failures should remain selected for retry");
});
