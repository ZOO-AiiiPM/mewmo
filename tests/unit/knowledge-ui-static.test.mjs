import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("knowledge base UI is wired as a real prototype drawer, not a deferred placeholder", () => {
  const sidebarPath = "apps/web/src/components/shell/Sidebar.tsx";
  const pagePath = "apps/web/src/app/(app)/knowledge-bases/page.tsx";
  const modalPath = "apps/web/src/components/knowledge/KnowledgeImportModal.tsx";
  const clipsRoutePath = "apps/web/src/app/api/clips/route.ts";

  assert.ok(existsSync(pagePath), "knowledge base app route should exist");
  assert.ok(existsSync(modalPath), "knowledge import modal should exist");

  const sidebar = read(sidebarPath);
  const page = read(pagePath);
  const modal = read(modalPath);
  const clipsRoute = read(clipsRoutePath);
  const icons = read("apps/web/src/components/shell/PrototypeIcon.tsx");
  const css = read("apps/web/src/app/globals.css");

  assert.doesNotMatch(
    sidebar,
    /label="产品设计" onClick=\{defer\} badge="待开发"/,
    "prototype knowledge entries must no longer be deferred placeholders",
  );
  assert.match(sidebar, /mewmo-knowledge-pane/, "sidebar should render the KB push drawer");
  assert.match(sidebar, /mewmo-sidebar__stage--knowledge/, "knowledge drawer should use its own stage mode");
  assert.match(sidebar, /openKnowledgeBase/, "sidebar should open a KB drawer from a KB row");
  assert.match(sidebar, /新建文件夹/, "root and folder menus should include prototype folder action");
  assert.match(sidebar, /从收藏箱导入/, "folder menus should include inbox import action");
  assert.match(
    sidebar,
    /const \[editingKnowledgeFolder, setEditingKnowledgeFolder\]/,
    "knowledge folder create and rename should use inline editing state instead of a prompt modal",
  );
  assert.match(
    sidebar,
    /const createKnowledgeFolder = async[\s\S]*startEditingKnowledgeFolder/,
    "creating a root knowledge folder should immediately start inline naming",
  );
  assert.match(
    sidebar,
    /renameKnowledgeFolder[\s\S]*startEditingKnowledgeFolder/,
    "renaming a knowledge folder should start inline editing instead of opening a dialog",
  );
  assert.match(
    sidebar,
    /className="mewmo-knowledge-folder-name-input"/,
    "knowledge folder names should render an inline input while editing",
  );
  const rootMenuStart = sidebar.indexOf('open={knowledgeMenu?.type === "root"}');
  const rootMenuEnd = sidebar.indexOf("</FloatingMenu>", rootMenuStart);
  const rootMenu = sidebar.slice(rootMenuStart, rootMenuEnd);
  assert.ok(rootMenuStart > -1 && rootMenuEnd > rootMenuStart, "knowledge root menu should be present");
  assert.doesNotMatch(rootMenu, /从收藏箱导入|icon="bookmark"/, "knowledge root menu should not import files because the root only contains folders");
  assert.doesNotMatch(
    sidebar,
    /type: "create-knowledge-folder"|type: "rename-knowledge-folder"/,
    "folder create and rename should not route through the modal text prompt state",
  );
  assert.match(
    sidebar,
    /setKnowledgeDrawer\(null\)[\s\S]*setKnowledgeMenu\(null\)/,
    "knowledge root title row should act as the return button",
  );
  assert.match(
    sidebar,
    /className="mewmo-nav-row mewmo-nav-row--group mewmo-knowledge-pane__back"/,
    "knowledge drawer return row should use the same group-row sizing as the subscription drawer return row",
  );
  assert.doesNotMatch(
    sidebar,
    /router\.push\(`\/knowledge-bases\?kbId=\$\{knowledgeDrawer\.id\}`\)/,
    "knowledge root title row should not open a root file list",
  );
  assert.match(
    sidebar,
    /<PrototypeIcon name=\{iconName\(base\.icon\)\} dual filled=\{activeKnowledgeBaseId === base\.id\}/,
    "knowledge base icons should be outline by default and filled only when selected",
  );
  assert.match(
    sidebar,
    /<PrototypeIcon name=\{iconName\(knowledgeDrawer\.icon\)\} dual \/>/,
    "knowledge drawer root return row should keep an outline icon because it is not a selectable folder",
  );
  assert.match(
    sidebar,
    /<PrototypeIcon name="folder" size=\{18\} dual filled=\{activeFolderId === folder\.id\}/,
    "folder icons should be outline by default and filled only when selected",
  );
  assert.doesNotMatch(
    sidebar,
    /mewmo-nav-row--sub mewmo-knowledge-folder/,
    "knowledge folder rows should not inherit the small secondary-nav row class",
  );
  assert.match(
    icons,
    /const PROTOTYPE_ACCOUNT_ICONS = \{[\s\S]*"folder": "<svg[\s\S]*fill=\\"none\\"[\s\S]*stroke=\\"currentColor\\"/,
    "folder line icon must be a real outline asset, not a filled folder that merely lives in the line layer",
  );
  assert.match(
    icons,
    /const PROTOTYPE_FILL_ICONS = \{[\s\S]*"folder": "<svg[\s\S]*fill=\\"currentColor\\"/,
    "folder filled icon should remain solid for the selected state",
  );
  assert.match(sidebar, /从本地文件夹导入/, "knowledge menus should expose the prototype local folder import action");
  assert.match(sidebar, /导出到本地/, "root and folder menus should include local export action");

  assert.match(page, /buildKnowledgeCardView/, "knowledge page should render mixed content through the mapping helper");
  assert.match(page, /ReaderToc/, "knowledge reader should reuse the shared reader table of contents");
  assert.match(page, /buildNoteToc/, "knowledge note readers should build TOC from markdown headings");
  assert.match(page, /buildHtmlToc/, "knowledge clip readers should build TOC from HTML headings");
  assert.match(page, /CardActionMenu/, "knowledge list cards should reuse the shared card action menu");
  assert.match(
    page,
    /mewmo-list-card-wrap--menu-open/,
    "knowledge list cards should preserve the existing menu-open card state",
  );
  assert.match(
    page,
    /kind=\{item\.kind === "note" \? "notes" : "clips"\}/,
    "knowledge card menus should route note items through note actions and article-like items through clip actions",
  );
  assert.match(page, /clipPreviewText/, "knowledge clip cards should reuse existing clip preview logic");
  assert.match(page, /formatClipListTime/, "knowledge cards should use the same compact time format as clip cards");
  assert.match(page, /notePreviewText/, "knowledge note cards should reuse existing note preview logic");
  assert.match(page, /extractNoteImages/, "knowledge note cards should reuse existing note image extraction");
  assert.match(page, /mewmo-list-card__cover/, "knowledge clip cards should render existing clip cover image markup");
  assert.match(page, /mewmo-list-card__thumbs/, "knowledge note cards should render existing note image thumbnail markup");
  assert.doesNotMatch(
    page,
    /mewmo-list-card__title">\s*<PrototypeIcon/,
    "knowledge card title rows should not show type icons; icons belong in the lower metadata row",
  );
  assert.match(
    page,
    /<PrototypeIcon name=\{card\.icon\} size=\{15\} \/>/,
    "knowledge card metadata should show the inferred content type icon rather than the clipped-source icon",
  );
  assert.doesNotMatch(
    page,
    /card\.sourceBadge \? <PrototypeIcon name=\{card\.sourceBadge\}/,
    "knowledge card metadata should not render bookmark as the icon for imported clips",
  );
  assert.doesNotMatch(
    page,
    /function formatKnowledgeTime/,
    "knowledge cards should not use a custom month/day formatter instead of the existing compact list time",
  );
  assert.match(page, /KnowledgeImportModal/, "knowledge page should wire the prototype import modal");
  assert.match(page, /aria-label="新建笔记"/, "knowledge list toolbar should include the prototype new-note icon");
  assert.match(
    page,
    /import\("..\/..\/..\/components\/editor\/NoteEditor"\)/,
    "knowledge reader should lazy-load the shared note editor for note items",
  );
  assert.match(
    page,
    /selectedItem\?\.kind === "note"[\s\S]*mewmo-reader-scroll--editor/,
    "knowledge note readers should use the editor scroll treatment",
  );
  assert.match(
    page,
    /item\.kind === "note" && item\.note[\s\S]*<NoteEditor[\s\S]*noteId=\{item\.note\.id\}[\s\S]*onContentChange=\{onNoteContentChange\}[\s\S]*onTitleChange=\{onNoteTitleChange\}/,
    "knowledge note items should render the editable shared note editor and sync title/content changes",
  );
  assert.match(
    page,
    /item\.note\.content === content[\s\S]*return item/,
    "knowledge note preview updates should no-op when editor content is unchanged to avoid parent render loops",
  );
  assert.doesNotMatch(
    page,
    /aria-label="新建笔记"[\s\S]{0,120}mewmo-icon-button--primary/,
    "knowledge new-note button should be a plain toolbar icon like search, not a primary blue special action",
  );
  assert.match(
    page,
    /fetch\("\/api\/notes"[\s\S]*const note = \(await response\.json\(\)\) as \{ id: string; slug: string \}/,
    "knowledge new-note action should create a note record first",
  );
  assert.match(
    page,
    /fetch\(`\/api\/knowledge-bases\/\$\{kbId\}\/items\/import`,[\s\S]*items:\s*\[\{ kind: "note", noteId: note\.id \}\]/,
    "knowledge new-note action should import the new note into the current knowledge folder",
  );
  assert.doesNotMatch(
    page,
    /router\.push\(`\/notes\/\$\{note\.slug\}`\)/,
    "knowledge new-note action should stay in the current knowledge base instead of jumping to the global notes page",
  );
  assert.match(
    page,
    /aria-label="从收藏箱导入"[\s\S]*<PrototypeIcon name="inbox"/,
    "knowledge inbox import shortcut should use the inbox icon, not the generic import icon",
  );
  assert.match(page, /folderId \? \(/, "knowledge list toolbar should only show the inbox import shortcut inside a folder");
  assert.match(page, /open=\{importOpen && Boolean\(folderId\)\}/, "knowledge import modal must not open at the knowledge base root");
  assert.match(page, /if \(!folderId\) \{[\s\S]*setItems\(\[\]\)/, "knowledge root should not load a root-level file list");
  assert.match(page, /KnowledgeRootEmptyState/, "knowledge root should render a folder-only empty state");
  assert.match(
    page,
    /!folderId \? \(\s*<KnowledgeRootEmptyState[\s\S]*onImportLocalFolder=\{openLocalFolderImport\}/,
    "root-level empty state should not expose inbox import because the root only contains folders",
  );
  assert.match(
    page,
    /localFileInputRef[\s\S]*localFolderInputRef/,
    "knowledge page should keep hidden local file and folder pickers for prototype local import",
  );
  assert.match(
    page,
    /fetch\(`\/api\/knowledge-bases\/\$\{kbId\}\/items\/asset`,[\s\S]*assetType/,
    "local file and folder imports should create knowledge asset records through the asset API",
  );
  assert.match(
    page,
    /accept="\.md,\.markdown,\.pdf,\.epub,\.mobi,\.azw3"/,
    "local file import should accept markdown files as knowledge notes",
  );
  assert.match(
    page,
    /fetch\("\/api\/notes",[\s\S]*content:\s*await file\.text\(\)/,
    "local markdown imports should create real note records with the file body",
  );
  assert.match(
    page,
    /fetch\(`\/api\/knowledge-bases\/\$\{kbId\}\/items\/import`,[\s\S]*items:\s*\[\{ kind: "note", noteId: note\.id \}\]/,
    "local markdown imports should add the created note to the current knowledge folder by reference",
  );
  assert.match(page, /从本地文件导入/, "empty folder state should expose local file import");
  assert.match(page, /从本地文件夹导入/, "empty folder state should expose local folder import");

  assert.match(modal, /笔记/, "import modal should include notes tab");
  assert.match(modal, /剪藏/, "import modal should include clips tab");
  assert.match(modal, /modal--wide/, "import modal should use the prototype wide modal shell");
  assert.match(modal, /imp-tabs/, "import modal should use prototype import tab classes");
  assert.match(modal, /imp-cols/, "import modal should use prototype two-column import layout");
  assert.match(modal, /imp-row__ic/, "import rows and detail meta should include prototype source icons");
  assert.match(modal, /imp-detail__body/, "import preview should use prototype detail body markup");
  assert.match(modal, /导入 \{selectedCount\} 项/, "import modal should show the selected import count");
  assert.match(
    modal,
    /useState<Set<string>>\(\(\) => new Set\(\)\)/,
    "import modal should open with no preselected notes or clips",
  );
  assert.match(
    modal,
    /if \(!open\) return;[\s\S]*setSelectedIds\(new Set\(\)\)/,
    "import modal should clear stale selections every time it opens",
  );
  assert.match(
    modal,
    /const \[importedIds, setImportedIds\] = useState<Set<string>>\(\(\) => new Set\(\)\)/,
    "import modal should track already-imported candidates separately from new selections",
  );
  assert.match(
    modal,
    /fetch\(`\/api\/knowledge-bases\/\$\{knowledgeBaseId\}\/contents\?\$\{params\.toString\(\)\}`\)/,
    "import modal should load current folder contents to mark already-imported candidates",
  );
  assert.match(
    modal,
    /importedIds\.has\(candidate\.id\) \|\| selectedIds\.has\(candidate\.id\)/,
    "import modal rows should show a checked state for either imported or newly selected candidates",
  );
  assert.match(
    modal,
    /if \(importedIds\.has\(candidate\.id\)\) \{[\s\S]*setPreviewId\(candidate\.id\)[\s\S]*return;/,
    "clicking an already-imported checkbox should not add it to the new import selection",
  );
  assert.match(modal, /formatKnowledgeImportPreviewParagraphs/, "import modal preview should filter markdown/html before rendering");
  assert.match(
    modal,
    /fetch\("\/api\/clips\?includeContent=1"\)/,
    "knowledge import should explicitly opt into clip body content for real article previews",
  );
  assert.match(
    clipsRoute,
    /includeContent[\s\S]*content:\s*true/,
    "clip list API should only include body content when explicitly requested",
  );
  assert.match(
    modal,
    /content\?: string \| null/,
    "import modal should accept clip body content from the clips API",
  );
  assert.match(
    modal,
    /content:\s*clip\.content \?\? ""/,
    "real clip import candidates should preview clip.content, not summary or excerpt",
  );
  assert.match(
    modal,
    /setClips\(\s*data\.length\s*\?\s*data\.slice/,
    "real clips should replace prototype samples instead of being appended behind them",
  );
  assert.match(modal, /<polyline points="20 6 9 17 4 12"/, "import checkbox should use the prototype single polyline check");
  assert.doesNotMatch(modal, /<PrototypeIcon name="check"/, "import checkbox should not use the generic double-check icon");
  assert.match(modal, /Figma 如何做产品决策（设计负责人访谈）/, "import modal should include exact prototype clipped video title");
  assert.doesNotMatch(modal, /Figma 如何做产品决策（设计负责人访谈\)/, "prototype clipped video title should not use a half-width closing parenthesis");
  assert.match(modal, /从「先发散再收敛」到用原型代替评审文档/, "import modal should preserve prototype clipped video summary copy");
  assert.match(
    modal,
    /fetch\(`\/api\/clips\/\$\{clip\.id\}`,\s*\{[\s\S]*method:\s*"PATCH"/,
    "importing sample clips should preserve the selected prototype title after URL metadata fetches",
  );

  assert.match(css, /\.mewmo-knowledge-pane/, "knowledge drawer styles should exist");
  assert.match(
    css,
    /\.mewmo-sidebar__stage--knowledge\s+\.mewmo-knowledge-pane\s*\{[\s\S]*pointer-events:\s*auto/,
    "knowledge pane should be the only clickable overlay in knowledge mode",
  );
  assert.match(
    css,
    /\.mewmo-row-action\s*\{[^}]*z-index:\s*2[^}]*pointer-events:\s*auto/,
    "row action buttons should sit above full-width navigation row buttons and remain clickable",
  );
  assert.match(
    css,
    /\.mewmo-sidebar__stage--feed\s+\.mewmo-feed-pane\s*\{[\s\S]*pointer-events:\s*auto/,
    "feed pane should be clickable only in feed mode",
  );
  assert.doesNotMatch(
    css,
    /\.mewmo-sidebar__stage--drilled\s+\.mewmo-feed-pane\s*\{[\s\S]*pointer-events:\s*auto/,
    "a generic drilled state must not make the feed pane cover the knowledge drawer",
  );
  assert.match(css, /\.mewmo-knowledge-import/, "knowledge import modal styles should exist");
  assert.match(
    css,
    /\.mewmo-knowledge-import\s+\.modal__panel\s*\{[\s\S]*width:\s*880px[\s\S]*height:\s*74vh/,
    "import modal panel should match prototype wide modal dimensions",
  );
  assert.match(
    css,
    /\.mewmo-knowledge-import\s+\.imp-cols\s*\{[\s\S]*display:\s*flex[\s\S]*gap:\s*14px/,
    "import modal body should match prototype two-column spacing",
  );
  assert.match(
    css,
    /\.mewmo-knowledge-import\s+\.imp-detail__title\s*\{[\s\S]*font-size:\s*17px[\s\S]*font-weight:\s*650/,
    "import modal preview title should match prototype detail typography",
  );
  assert.match(
    css,
    /left:\s*calc\(17px \+ var\(--knowledge-folder-depth,\s*0\) \* 12px\)/,
    "folder chevrons should stay on the original compact nesting rhythm",
  );
  assert.match(
    css,
    /\.mewmo-knowledge-folder\s*\{[\s\S]*font-size:\s*12\.5px[\s\S]*padding-top:\s*5px[\s\S]*padding-bottom:\s*5px/,
    "knowledge folder rows should match subscription source rows, while only the drawer return row stays title-sized",
  );
  assert.match(
    css,
    /\.mewmo-knowledge-folder\s+\.mewmo-nav-row__icon\s*\{[\s\S]*width:\s*18px[\s\S]*height:\s*18px/,
    "knowledge folder icon boxes should match subscription source icons",
  );
  assert.match(
    css,
    /\.mewmo-list-card--selected\s+\.mewmo-knowledge-card__source\s+\.mewmo-prototype-icon__line\s*\{[\s\S]*display:\s*inline-flex/,
    "selected knowledge cards should keep lower metadata icons visible",
  );
  assert.match(
    css,
    /\.mewmo-knowledge-card__source\s*>\s*\.mewmo-prototype-icon\s*\{[\s\S]*width:\s*15px[\s\S]*height:\s*15px[\s\S]*flex:\s*0 0 15px/,
    "knowledge card metadata icons should keep a fixed footprint so source rows align",
  );
  assert.match(
    css,
    /\.mewmo-list-card--selected\s+\.mewmo-knowledge-card__source\s*>\s*\.mewmo-prototype-icon\s*\{[\s\S]*color:\s*var\(--accent\)/,
    "selected knowledge card metadata icons should use the same theme accent color as saved feed indicators",
  );
  assert.match(
    sidebar,
    /<PrototypeIcon name="folder" size=\{18\} dual filled=\{activeFolderId === folder\.id\} \/>/,
    "folder icons should render at the subscription source icon size",
  );
  assert.match(
    css,
    /\.mewmo-knowledge-pane__back\s*\{[\s\S]*margin-bottom:\s*0[\s\S]*padding:\s*6px 34px 6px 6px/,
    "knowledge drawer return row should align its sizing and spacing with the subscription drawer",
  );
});
