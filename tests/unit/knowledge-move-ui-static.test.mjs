import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("content menus share the move-to-knowledge workflow", () => {
  const menuItemPath =
    "apps/web/src/components/knowledge/MoveToKnowledgeMenuItem.tsx";
  assert.ok(
    existsSync(menuItemPath),
    "the app should expose one shared knowledge destination menu",
  );

  const menuItem = read(menuItemPath);
  const providerPath =
    "apps/web/src/components/knowledge/MoveToKnowledgeProvider.tsx";
  assert.ok(
    existsSync(providerPath),
    "the move dialog should live in an app-level provider, not inside the menu",
  );
  const provider = read(providerPath);
  const appLayout = read("apps/web/src/app/(app)/layout.tsx");
  const cardMenu = read("apps/web/src/components/shell/CardActionMenu.tsx");
  const readerToolbar = read("apps/web/src/components/shell/ReaderToolbar.tsx");
  const feedMenu = read("apps/web/src/components/shell/FeedArticleMenu.tsx");
  const notesPage = read(
    "apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx",
  );
  const clipsPage = read("apps/web/src/app/(app)/clips/page.tsx");
  const clipDetail = read(
    "apps/web/src/app/(app)/clips/[id]/ClipDetailClient.tsx",
  );
  const feedsPage = read("apps/web/src/app/(app)/feeds/page.tsx");
  const todayPage = read("apps/web/src/app/(app)/today/page.tsx");
  const knowledgePage = read("apps/web/src/app/(app)/knowledge-bases/page.tsx");
  const css = read("apps/web/src/app/globals.css");

  // The dialog must be mounted at app level so closing the three-dot menu
  // (which unmounts the menu subtree) does not unmount and dismiss the dialog.
  assert.match(appLayout, /MoveToKnowledgeProvider/);

  // The menu item is a thin trigger: it closes the menu and asks the
  // app-level provider to open the dialog. It must NOT own the dialog markup,
  // otherwise it dies together with the closing menu (the ZOO-19 regression).
  assert.match(menuItem, />移动到知识库</);
  assert.match(menuItem, /closeMenu\?\.\(\)/);
  assert.match(menuItem, /openMoveDialog\(target\)/);
  assert.doesNotMatch(menuItem, /mewmo-move-knowledge__panel/);
  assert.doesNotMatch(menuItem, /aria-modal="true"/);
  assert.doesNotMatch(menuItem, /items\/import/);

  // The move workflow (import call, 409 handling, centered modal) lives in
  // the provider.
  assert.match(
    provider,
    /`\/api\/knowledge-bases\/\$\{selectedBaseId\}\/items\/import`/,
  );
  assert.match(provider, /response\.status === 409/);
  assert.match(provider, /这条内容已经在目标文件夹中/);
  assert.match(provider, /mewmo-move-knowledge/);
  assert.match(provider, /aria-modal="true"/);
  assert.match(provider, /mewmo-move-knowledge__panel/);
  assert.match(provider, /aria-label="知识库"/);
  assert.match(provider, /aria-label="文件夹"/);
  // The root of a knowledge base never holds files, so the dialog must not
  // offer a "root" target. Users pick a folder, or create one inline.
  assert.doesNotMatch(provider, /知识库根级/);
  assert.match(
    provider,
    /selectedFolderId !== null/,
    "canSubmit must require a real folder, not just a knowledge base",
  );
  assert.match(
    provider,
    /\+ 新建文件夹|新建文件夹/,
    "the dialog should expose an inline new-folder control",
  );
  assert.match(
    provider,
    /\/folders/,
    "creating a folder should hit the existing folder POST endpoint",
  );
  assert.doesNotMatch(provider, /onMouseEnter/);
  assert.doesNotMatch(provider, /acct-submenu/);
  assert.doesNotMatch(provider, /mewmo-move-knowledge-card/);
  assert.doesNotMatch(provider, /<select/);
  assert.match(css, /\.mewmo-move-knowledge__/);
  assert.match(css, /\.mewmo-move-knowledge__panel/);
  assert.match(css, /\.mewmo-move-knowledge__scrim/);
  assert.doesNotMatch(css, /\.mewmo-move-knowledge-card/);
  assert.doesNotMatch(css, /\.mewmo-knowledge-cascade/);

  for (const menu of [cardMenu, readerToolbar, feedMenu]) {
    assert.match(menu, /<MoveToKnowledgeMenuItem target=/);
  }

  // Move action should appear after other actions (last).
  const cardMoveAt = cardMenu.indexOf("<MoveToKnowledgeMenuItem");
  const cardExportAt = cardMenu.lastIndexOf("导出");
  assert.ok(cardMoveAt > -1 && cardExportAt > -1 && cardMoveAt > cardExportAt);

  assert.match(notesPage, /moveToKnowledgeTarget=\{\{ kind: "note"/);
  assert.match(clipsPage, /moveToKnowledgeTarget=\{\{ kind: "clip"/);
  assert.match(clipDetail, /moveToKnowledgeTarget=\{\{ kind: "clip"/);
  assert.match(feedsPage, /moveToKnowledgeTarget=\{\{ kind: "feed_entry"/);
  assert.match(
    todayPage,
    /moveToKnowledgeTarget=\{selected \? todayMoveTarget\(selected\)/,
  );
  assert.doesNotMatch(
    knowledgePage,
    /moveToKnowledgeTarget/,
    "content already inside a knowledge base should not show the same move action",
  );
});

test("an empty knowledge sidebar does not render prototype placeholders", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");

  assert.doesNotMatch(sidebar, /label="产品设计"/);
  assert.doesNotMatch(sidebar, /label="技术笔记"/);
  assert.match(sidebar, /knowledgeBases\.map\(\(base\) => \(/);
});
