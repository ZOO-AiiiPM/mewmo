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
  assert.match(css, /\.mewmo-sidebar__group-head > \.mewmo-nav-row--group\s*\{\s*padding-left: 32px;/);
  assert.match(css, /\.mewmo-sidebar__group-head > \.mewmo-nav-row--group\s*\{[\s\S]*?font-size: 12\.5px;/);
  assert.match(css, /\.mewmo-sidebar__group-head \.mewmo-nav-row--group > \.mewmo-nav-row__chevron\s*\{\s*position: absolute;\s*left: 6px;/);
  assert.match(sidebar, /<span className="mewmo-nav-row__label">\{title\}<\/span>/);
  assert.doesNotMatch(sidebar, /opticalAlign|mewmo-nav-row__icon--primary|data-icon/);
  assert.doesNotMatch(icons, /opticalAlign|SIDEBAR_PRIMARY_ICON_LEFT_INSET|leftInset/);
  assert.doesNotMatch(css, /scaleX\(/);
});
