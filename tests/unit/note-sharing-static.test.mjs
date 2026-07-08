import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("protected note sharing has data model, routes, auth callback, and note UI wiring", () => {
  const schema = read("packages/db/prisma/schema.prisma");
  const middleware = read("apps/web/src/middleware.ts");
  const loginPage = read("apps/web/src/app/(auth)/login/page.tsx");
  const registerPage = read("apps/web/src/app/(auth)/register/page.tsx");
  const notesPage = read("apps/web/src/app/(app)/notes/[slug]/NoteEditorPage.tsx");

  assert.match(schema, /model NoteShare \{[\s\S]*token\s+String\s+@unique/);
  assert.match(schema, /model Note \{[\s\S]*shares\s+NoteShare\[\]/);
  assert.match(schema, /model User \{[\s\S]*noteShares\s+NoteShare\[\]/);
  assert.match(middleware, /"\/share\/:path\*"/);
  assert.ok(existsSync("packages/db/src/repositories/note-shares.ts"));
  assert.ok(existsSync("apps/web/src/app/api/notes/[id]/share/route.ts"));
  assert.ok(existsSync("apps/web/src/app/share/notes/[token]/page.tsx"));
  assert.ok(existsSync("apps/web/src/components/share/ShareThemeToggle.tsx"));

  const shareRoute = read("apps/web/src/app/api/notes/[id]/share/route.ts");
  assert.match(shareRoute, /auth\(\)/);
  assert.match(shareRoute, /session\.user\.id/);
  assert.match(shareRoute, /deletedAt:\s*null/);
  assert.match(shareRoute, /\/share\/notes\/\$\{share\.token\}/);

  const sharedPage = read("apps/web/src/app/share/notes/[token]/page.tsx");
  assert.match(sharedPage, /auth\(\)/);
  assert.match(sharedPage, /notFound\(\)/);
  assert.match(sharedPage, /revokedAt:\s*null/);
  assert.match(sharedPage, /deletedAt:\s*null/);
  assert.match(sharedPage, /SharedNoteMarkdown/);
  assert.match(sharedPage, /ShareThemeToggle/);
  assert.match(sharedPage, /PrototypeIcon/);
  assert.match(sharedPage, /mewmo-share-shell/);
  assert.match(sharedPage, /mewmo-share-topbar/);
  assert.match(sharedPage, /mewmo-share-brand/);
  assert.match(sharedPage, /mewmo-share-reader/);
  assert.match(sharedPage, /mewmo-share-footer/);
  assert.doesNotMatch(sharedPage, /mewmo-shared-note__mark/);
  assert.doesNotMatch(sharedPage, /<pre/);
  assert.doesNotMatch(sharedPage, /NoteEditor|contentEditable|ReaderToolbar|CardActionMenu/);

  const shareThemeToggle = read("apps/web/src/components/share/ShareThemeToggle.tsx");
  assert.match(shareThemeToggle, /"use client"/);
  assert.match(shareThemeToggle, /useTheme/);
  assert.match(shareThemeToggle, /setTheme/);
  assert.match(shareThemeToggle, /PrototypeIcon/);
  assert.match(shareThemeToggle, /aria-label=\{option\.label\}/);
  assert.match(shareThemeToggle, /label:\s*"跟随系统"/);
  assert.match(shareThemeToggle, /label:\s*"深色模式"/);
  assert.match(shareThemeToggle, /label:\s*"浅色模式"/);

  const css = read("apps/web/src/app/globals.css");
  const shareCss = css.slice(css.indexOf(".mewmo-share-page"), css.indexOf(".mewmo-source-strip"));
  assert.match(
    shareCss,
    /\.mewmo-share-page\s*\{[\s\S]*height:\s*100vh[\s\S]*overflow-y:\s*auto/,
    "shared note page should own vertical scrolling because the app body is overflow-hidden",
  );
  assert.match(shareCss, /\.mewmo-share-page\s*\{[\s\S]*--share-stage:/);
  assert.match(shareCss, /html\.light \.mewmo-share-page\s*\{[\s\S]*--share-bg:/);
  assert.match(shareCss, /\.mewmo-share-shell\s*\{[\s\S]*background:\s*var\(--share-stage\)/);
  assert.match(shareCss, /\.mewmo-share-shell\s*\{[\s\S]*border-radius:\s*22px 22px 0 0/);
  assert.match(shareCss, /\.mewmo-share-reader\s*\{[\s\S]*background:\s*var\(--share-stage\)/);
  assert.match(shareCss, /\.mewmo-share-reader\s*\{[\s\S]*border:\s*0/);
  assert.match(shareCss, /\.mewmo-document--shared-note\s*\{[\s\S]*background:\s*var\(--share-paper\)/);
  assert.match(shareCss, /html\.light \.mewmo-share-page\s*\{[\s\S]*--share-code:\s*#f4f4f4/);
  assert.match(shareCss, /\.mewmo-document--shared-note\s*\{[\s\S]*box-shadow:\s*none/);
  assert.match(shareCss, /\.mewmo-share-theme-toggle/);
  assert.match(shareCss, /\.mewmo-share-theme-toggle button\.is-active\s*\{[\s\S]*var\(--share-ink\)/);
  assert.doesNotMatch(shareCss, /#e88478|--share-accent|--share-shadow|box-shadow:\s*var\(--share-shadow\)|border-left:\s*1px solid|mewmo-document--shared-note::before|mewmo-document--shared-note::after|mewmo-shared-note__mark/);

  assert.match(loginPage, /useSearchParams/);
  assert.match(loginPage, /callbackUrl/);
  assert.match(loginPage, /router\.push\(callbackUrl \|\| "\/notes"\)/);
  assert.match(registerPage, /useSearchParams/);
  assert.match(registerPage, /callbackUrl/);
  assert.match(registerPage, /\/login\?callbackUrl=/);

  assert.match(notesPage, /const shareNote = async \(item: NoteListItem\)/);
  assert.match(notesPage, /fetch\(`\/api\/notes\/\$\{item\.id\}\/share`/);
  assert.match(notesPage, /navigator\.clipboard\?\.writeText\(shareUrl\)/);
  assert.match(notesPage, /showToast\("正在生成分享链接\.\.\.",\s*"loading"\)/);
  assert.match(notesPage, /showToast\(`已复制分享链接：\$\{shareUrl\}`,\s*"success"\)/);
  assert.doesNotMatch(notesPage, /showToast\("已复制分享链接",\s*"success"\)/);
  assert.doesNotMatch(notesPage, /onShare=\{\(\) => showToast\("已复制分享链接"\)\}/);
});
