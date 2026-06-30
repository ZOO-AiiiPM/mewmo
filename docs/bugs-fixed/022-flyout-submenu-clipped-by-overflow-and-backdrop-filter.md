# 022 - 账户菜单二级飞出菜单被裁切（overflow:hidden + backdrop-filter 双层叠加）

## 症状

账户菜单（左下角 `.acct-menu`）里带 `›` 的项（主题色 / 外观模式 / 字体字号 / 导入导出）hover 时，本该往右飞出的二级菜单 `.acct-submenu` 看不到，只在选中行右缘露出一条极窄的缝。这个 bug「一直没做好」，多次尝试调 `z-index` 都无效。

## 根因（两层叠加，且有一个反直觉陷阱）

1. `.acct-submenu` 用 `position:absolute; left: calc(100% + 4px)` 往右飞出到 `.side` 右边界之外。
2. `.side` 上被加了 `overflow:hidden`（grid 那条 `.side { grid-column:1; min-width:0; overflow:hidden }`），把飞出右边界（~187px）的菜单（要到 ~312px）裁掉，只剩 ~15px。
3. **反直觉陷阱（关键）**：试图用 `position:fixed` 让菜单逃出 overflow 裁切——但实测无效。原因是 `.side` 上有 `backdrop-filter: blur(20px) saturate(1.4)`，而 backdrop-filter（和 filter / transform / will-change 一样）会**为 position:fixed/absolute 后代建立 containing block（包含块）**，导致 fixed 元素仍被同一个祖先的 `overflow:hidden` 裁切。实证方法：fixed 后 `getBoundingClientRect` 报的几何 rect 没被裁（到 322），但 `document.elementFromPoint(菜单中心)` 打到的是后面 `.list` 里的 `.ncard__time`（`insideSubmenu=false`），说明可见 / 命中区仍被裁到 187。
4. 排除了 z-index 假设：实测 `.list` 是 `z-index:auto` + `position:static` 不形成层叠上下文，`.side` 有 `z-index:20`，所以 `.side` 内容本就画在 `.list` 之上，**没有 z-index 问题**。

## 修法

删掉 `.side` 的 `overflow:hidden`（保留 `min-width:0`），定位保持原始 `position:absolute`。验证过 `.side` 内部滚动由 `.side__nav { overflow-y:auto }` 和 `.side__stage { overflow:hidden }` 各自处理、内容有 7px padding 内缩于 16px 圆角内，所以去掉 `.side` 这层 overflow 不影响滚动和圆角。在该行加了注释 `/* 不可加 overflow:hidden：会裁掉账户菜单飞出的二级菜单 */` 防回退。

## 关联文件

`docs/prototypes/notes-home.html`：`.side` 规则（约 line 94）、`.acct-submenu` 规则（约 line 260）、`.side` 内部 `.side__nav` / `.side__stage`（约 line 117 / 145）。

## 踩坑记录 / 可复用教训

**flyout / dropdown 飞出菜单被裁，第一嫌疑永远是祖先链上的 `overflow:hidden`，不是 `z-index`。** 而且 `position:fixed` 不是万能逃生门——只要祖先有 `backdrop-filter` / `filter` / `transform` / `perspective` / `will-change` 形成 containing block（包含块），fixed 照样被该祖先的 `overflow` 裁切。诊断要用 `document.elementFromPoint` 看命中元素 + 沿父链 `getComputedStyle` 找 `overflow≠visible` 的 clipper（裁切元素），靠实测而非猜 z-index。
