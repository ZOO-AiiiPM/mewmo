import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(path, "utf8");
}

test("video subscription is a dedicated frontend workspace", () => {
  const feedsPage = read("apps/web/src/app/(app)/feeds/page.tsx");
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
  const workspace = read("apps/web/src/components/video/VideoWorkspace.tsx");
  const types = read("apps/web/src/lib/video-types.ts");
  const readerToolbar = read("apps/web/src/components/shell/ReaderToolbar.tsx");
  const aiSidebar = read("apps/web/src/components/shell/AISidebar.tsx");
  const appShell = read("apps/web/src/components/shell/AppShell.tsx");

  assert.match(feedsPage, /type === "video"[\s\S]*<VideoWorkspace/);
  assert.match(sidebar, /\{ type: "video", label: "视频", icon: "video" \}/);
  assert.doesNotMatch(sidebar, /type: "video"[^\n]*deferred: true/);
  assert.doesNotMatch(sidebar, /video-mock-data|mockVideoSources/);
  assert.match(sidebar, /fetch\(`\/api\/feeds\?type=\$\{feedDrawer\}`\)/);
  assert.match(workspace, /type VideoTab = "transcript" \| "highlights"/);
  assert.match(workspace, /\(\["transcript", "highlights"\] as VideoTab\[\]\)/);
  assert.doesNotMatch(workspace, /tab === "summary"/);
  assert.doesNotMatch(workspace, /type VideoTab[^\n]*(overview|chapters|visual)/);
  assert.match(workspace, /mewmo-video-ai-teaser/);
  assert.match(workspace, /mewmo-video-description/);
  assert.match(workspace, /原视频简介/);
  assert.doesNotMatch(workspace, /原平台标签/);
  assert.match(workspace, /mewmo-video-mewmo-tags/);
  assert.match(workspace, /Mewmo 标签/);
  assert.match(workspace, /AI 建议/);
  assert.match(workspace, /onTagsChange/);
  assert.doesNotMatch(workspace, /标为看完|标为未看/);
  assert.doesNotMatch(workspace, /mewmo-video-reader__state/);
  assert.match(workspace, /openSidebar\("summary"\)/);
  assert.doesNotMatch(workspace, /mewmo-video-quick-judgment/);
  assert.match(aiSidebar, /kind: "video"/);
  assert.match(aiSidebar, /function VideoInsightPanel/);
  assert.match(aiSidebar, /AI 快速判断/);
  assert.match(aiSidebar, /摘要/);
  assert.match(aiSidebar, /亮点/);
  assert.match(aiSidebar, /思考/);
  assert.match(aiSidebar, /术语解释/);
  assert.match(aiSidebar, /全文总结/);
  assert.match(aiSidebar, /按时间线总结/);
  assert.match(aiSidebar, /按主题归纳/);
  assert.match(aiSidebar, /查看原文/);
  assert.match(appShell, /<AISidebarProvider open=\{aiOpen\} onOpenChange=\{setAiOpen\}>/);
  assert.match(workspace, /className="mewmo-video-panel mewmo-video-selectable" onMouseUp=\{handleTextSelection\}/);
  assert.match(workspace, /selectionToolbar\.text\.length[\s\S]*>高光<\/button>/);
  assert.match(workspace, /const addUserHighlight[\s\S]*setUserHighlights/);
  assert.match(workspace, /saveSelectionAsHighlight[\s\S]*onAddUserHighlight/);
  assert.match(workspace, /全部[\s\S]*AI 高光[\s\S]*我的高光/);
  assert.match(workspace, /mewmo-video-highlight-card--ai/);
  assert.match(workspace, /mewmo-video-highlight-card--user/);
  assert.match(workspace, /video\.isUnread && <i className="mewmo-unread-dot"/);
  assert.match(workspace, /<p>\{video\.preview\}<\/p>/);
  assert.doesNotMatch(workspace, /mewmo-video-card__badges/);
  assert.doesNotMatch(workspace, /const watchCopy/);
  assert.match(types, /preview: string/);
  assert.match(types, /sourceTags: string\[\]/);
  assert.match(types, /mewmoTags: string\[\]/);
  assert.match(types, /suggestedTags: string\[\]/);
  assert.match(types, /description: string \| null/);
  assert.match(types, /isUnread: boolean/);
  assert.match(workspace, /menuKind="video"/);
  assert.match(workspace, /onAddToKnowledge=/);
  assert.match(workspace, /onCopyContent=/);
  assert.match(workspace, /onExport=/);
  assert.match(workspace, /onReanalyze=/);
  assert.doesNotMatch(workspace, /mewmo-video-action-bar/);
  assert.match(readerToolbar, /menuKind\?: "notes" \| "clips" \| "feed" \| "video"/);
  assert.match(readerToolbar, /menuKind === "video"/);
  assert.match(readerToolbar, /加入知识库/);
  assert.match(readerToolbar, /复制内容/);
  assert.match(readerToolbar, /重新分析/);
  assert.match(workspace, /<video/);
  const titleIndex = workspace.indexOf("<h1>{video.title}</h1>");
  const metadataIndex = workspace.indexOf("mewmo-video-source-badge", titleIndex);
  const playerIndex = workspace.indexOf("<video", titleIndex);
  const descriptionIndex = workspace.indexOf("mewmo-video-description", playerIndex);
  const teaserIndex = workspace.indexOf("mewmo-video-ai-teaser", descriptionIndex);
  const tabsIndex = workspace.indexOf('role="tablist"', teaserIndex);
  assert.ok(titleIndex >= 0);
  assert.ok(titleIndex < metadataIndex && metadataIndex < playerIndex);
  assert.ok(playerIndex < descriptionIndex && descriptionIndex < teaserIndex && teaserIndex < tabsIndex);
  assert.match(workspace, /mewmo-list-card__cover/);
  assert.match(workspace, /mewmo-list-card__source--clip/);
  assert.match(workspace, /<CardActionMenu/);
  assert.match(workspace, /kind="video"/);
  assert.match(workspace, /onToggleList=/);
  assert.match(workspace, /mewmo-workspace--list-collapsed/);
  assert.match(types, /VideoProcessingStatus/);
  assert.match(types, /VideoTranscriptSegment/);
  assert.match(types, /mockVideoUrl/);
});

test("video frontend reads and mutates the real video APIs while retaining mock assets for tests", () => {
  const mockData = read("apps/web/src/lib/video-mock-data.ts");
  const workspace = read("apps/web/src/components/video/VideoWorkspace.tsx");
  const videoApi = read("apps/web/src/lib/video-api.ts");

  assert.match(mockData, /mockVideoSources/);
  assert.match(mockData, /mockVideoDetails/);
  assert.match(mockData, /\/mock\/video-covers\/ai-memory\.jpg/);
  assert.doesNotMatch(mockData, /storage\.googleapis\.com\/gtv-videos-bucket\/sample\/images/);
  for (const cover of ["ai-memory.jpg", "knowledge-agent.jpg", "user-research.jpg", "ai-product-weekly.jpg"]) {
    const coverPath = `apps/web/public/mock/video-covers/${cover}`;
    assert.equal(existsSync(coverPath), true);
    assert.ok(statSync(coverPath).size > 1_000);
  }
  assert.doesNotMatch(workspace, /from "\.\.\/\.\.\/lib\/video-mock-data"/);
  for (const operation of [
    "fetchVideoSources",
    "fetchVideoEntries",
    "fetchVideoDetail",
    "createVideo",
    "createVideoHighlight",
    "deleteVideoHighlight",
    "deleteVideo",
    "replaceVideoTags",
    "reanalyzeVideo",
  ]) {
    assert.match(workspace, new RegExp(operation), `${operation} should be wired into the workspace`);
  }
  assert.match(workspace, /pollingAttemptsRef\.current >= 20/);
  assert.match(workspace, /video\.embedUrl/);
  assert.doesNotMatch(workspace, /前端原型/);
  assert.match(videoApi, /"\/api\/feeds\?type=video"/);
  assert.match(videoApi, /`\/api\/feed-entries\?\$\{query\.toString\(\)\}`/);
  assert.match(videoApi, /requestJson<\{ entry: \{ id: string; feedId: string \} \}>\("\/api\/videos"/);
  assert.match(videoApi, /\/highlights/);
  assert.match(videoApi, /\/tags/);
});
