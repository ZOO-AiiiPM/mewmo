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

  assert.doesNotMatch(appLayout, /MoveToKnowledgeProvider/);
  assert.match(
    menuItem,
    /`\/api\/knowledge-bases\/\$\{baseId\}\/items\/import`/,
  );
  assert.match(menuItem, /response\.status === 409/);
  assert.match(menuItem, /这条内容已经在目标文件夹中/);
  assert.match(menuItem, /label="移动到知识库"/);
  assert.match(menuItem, /aria-label="知识库"/);
  assert.match(menuItem, /aria-label="文件夹"/);
  assert.match(menuItem, /mewmo-knowledge-cascade--destinations/);
  assert.match(menuItem, />文件夹</);
  assert.match(menuItem, /label="知识库根级"/);
  assert.doesNotMatch(menuItem, /<select/);
  assert.doesNotMatch(menuItem, /setBaseId|next\[0\]/);
  assert.doesNotMatch(menuItem, /目录/);
  assert.match(css, /\.mewmo-knowledge-cascade/);
  assert.doesNotMatch(css, /\.mewmo-move-knowledge__panel/);

  for (const menu of [cardMenu, readerToolbar, feedMenu]) {
    assert.match(menu, /<MoveToKnowledgeMenuItem target=/);
  }

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
