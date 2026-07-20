import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("feed refresh UI reports queued work instead of a completed check", () => {
  const sidebar = read("apps/web/src/components/shell/Sidebar.tsx");

  assert.match(sidebar, /queued\?: boolean/);
  assert.match(sidebar, /已安排更新，后台将在一分钟内处理/);
  assert.doesNotMatch(sidebar, /已检查该订阅，暂无新文章/);
});

test("feed actions belong to cards instead of the list header", () => {
  const page = read("apps/web/src/app/(app)/feeds/page.tsx");

  assert.doesNotMatch(page, /overflowAction=\{/);
  assert.match(
    page,
    /mewmo-list-card-wrap[\s\S]*<CardActionMenu[\s\S]*kind="feed"/,
  );
});

test("add-feed primary action has a semantic disabled appearance", () => {
  const css = read("apps/web/src/app/globals.css");

  assert.match(
    css,
    /\.addfeed__actions[\s\S]*\.mewmo-button--primary:disabled[\s\S]*cursor:\s*not-allowed/,
  );
});

test("feed reader metadata omits word count and estimated reading time", () => {
  const page = read("apps/web/src/app/(app)/feeds/page.tsx");
  const display = read("apps/web/src/lib/feed-display.ts");

  assert.doesNotMatch(page, /countWords\(/);
  assert.doesNotMatch(display, /\$\{words\} 字|预计 \$\{minutes\} 分钟/);
});
