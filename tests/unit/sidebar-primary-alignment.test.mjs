import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const sidebar = readFileSync("apps/web/src/components/shell/Sidebar.tsx", "utf8");
const css = readFileSync("apps/web/src/app/globals.css", "utf8");
const icons = readFileSync("apps/web/src/components/shell/PrototypeIcon.tsx", "utf8");

test("一级侧边栏入口共用分组标题的 icon 和 label 对齐列", () => {
  assert.match(sidebar, /href="\/mew"[\s\S]{0,120}primary/);
  assert.match(sidebar, /label=\{t\("today"\)\}[\s\S]{0,120}primary/);
  assert.match(sidebar, /href="\/trash"[\s\S]{0,120}primary/);
  assert.match(sidebar, /mewmo-nav-row--\$\{primary \? "primary" : "sub"\}/);
  assert.match(css, /\.mewmo-nav-row--primary,\s*\.mewmo-nav-row--sub\s*\{\s*padding: 5px 8px 5px 32px;/);
  assert.match(css, /\.mewmo-sidebar__group-head \.mewmo-nav-row--group\s*\{\s*padding-left: 32px;/);
  assert.match(css, /\.mewmo-sidebar__group-head \.mewmo-nav-row--group > \.mewmo-nav-row__chevron\s*\{\s*position: absolute;\s*left: 6px;/);
  assert.match(sidebar, /name=\{icon\} dual opticalAlign="sidebar-primary"/);
  assert.match(sidebar, /opticalAlign=\{primary \? "sidebar-primary" : undefined\}/);
  for (const name of ["cat", "calendar", "inbox", "rss", "library", "trash"]) {
    assert.match(icons, new RegExp(`${name}: [0-9.]+ / 24`));
  }
  assert.match(icons, /transform: leftInset \? `translateX\(-\$\{leftInset \* 100\}%\)` : undefined/);
});
