import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

function read(path) {
  return readFileSync(path, "utf8");
}

test("video subscription is a dedicated frontend workspace", () => {
  const feedsPage = read("apps/web/src/app/(app)/feeds/page.tsx");
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");
  const workspace = read("apps/web/src/components/video/VideoWorkspace.tsx");
  const types = read("apps/web/src/lib/video-types.ts");

  assert.match(feedsPage, /type === "video"[\s\S]*<VideoWorkspace/);
  assert.match(sidebar, /\{ type: "video", label: "视频", icon: "video" \}/);
  assert.doesNotMatch(sidebar, /type: "video"[^\n]*deferred: true/);
  assert.match(workspace, /type VideoTab = "summary" \| "transcript" \| "highlights"/);
  assert.match(workspace, /\(\["summary", "transcript", "highlights"\] as VideoTab\[\]\)/);
  assert.match(workspace, /tab === "summary" \? "全文总结"[\s\S]*tab === "transcript" \? "原文细读"[\s\S]*`高光笔记/);
  assert.doesNotMatch(workspace, /type VideoTab[^\n]*(overview|chapters|visual)/);
  assert.match(workspace, /按时间线总结/);
  assert.match(workspace, /按主题归纳/);
  assert.match(workspace, /展开原文/);
  assert.match(workspace, /收起原文/);
  assert.match(workspace, /摘要/);
  assert.match(workspace, /亮点/);
  assert.match(workspace, /思考/);
  assert.match(workspace, /术语解释/);
  assert.match(workspace, /className="mewmo-video-panel mewmo-video-selectable" onMouseUp=\{handleTextSelection\}/);
  assert.match(workspace, /selectionToolbar\.text\.length[\s\S]*>高光<\/button>/);
  assert.match(workspace, /saveSelectionAsHighlight[\s\S]*setUserHighlights/);
  assert.match(workspace, /全部[\s\S]*AI 高光[\s\S]*我的高光/);
  assert.match(workspace, /mewmo-video-highlight-card--ai/);
  assert.match(workspace, /mewmo-video-highlight-card--user/);
  assert.match(workspace, /<video/);
  const titleIndex = workspace.indexOf("<h1>{video.title}</h1>");
  const metadataIndex = workspace.indexOf("mewmo-video-source-badge", titleIndex);
  const watchedIndex = workspace.indexOf("标为看完", titleIndex);
  const playerIndex = workspace.indexOf("<video", titleIndex);
  const quickJudgmentIndex = workspace.indexOf("AI 快速判断", playerIndex);
  const tabsIndex = workspace.indexOf('role="tablist"', quickJudgmentIndex);
  assert.ok(titleIndex >= 0);
  assert.ok(titleIndex < metadataIndex && metadataIndex < playerIndex);
  assert.ok(titleIndex < watchedIndex && watchedIndex < playerIndex);
  assert.ok(playerIndex < quickJudgmentIndex && quickJudgmentIndex < tabsIndex);
  assert.match(workspace, /mewmo-list-card__cover/);
  assert.match(workspace, /mewmo-list-card__source--clip/);
  assert.match(types, /VideoProcessingStatus/);
  assert.match(types, /VideoTranscriptSegment/);
  assert.match(types, /mockVideoUrl/);
});

test("video frontend stays on mock data without backend changes", () => {
  const mockData = read("apps/web/src/lib/video-mock-data.ts");
  const workspace = read("apps/web/src/components/video/VideoWorkspace.tsx");

  assert.match(mockData, /mockVideoSources/);
  assert.match(mockData, /mockVideoDetails/);
  assert.doesNotMatch(workspace, /fetch\(\s*["'`]\/api\/videos/);
  assert.match(workspace, /前端原型/);
});
