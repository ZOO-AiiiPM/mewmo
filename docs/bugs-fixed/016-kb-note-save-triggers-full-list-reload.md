# 知识库笔记保存触发整列表重读导致闪烁与点击失灵

- **症状**：知识库（KB）zone 里出现两个表面不同、实为同一根因的问题——(1) 编辑笔记正文时左侧文件/文件夹列表反复闪烁；(2) 点击文件夹/文件经常「没反应、要点好几次」
- **根因**：`KnowledgeBase.tsx` 的 `handleUpdateSelectedNote`（编辑器 onChange）在每次保存后调用 `await refreshPath(selectedNoteFolderPath)`。`refreshPath` 会重新从磁盘读当前文件夹内容（`loadContents`）+ 重新加载整个知识库列表（`refreshKbList`），替换两大块状态。而编辑器正文每停顿 400ms（`NoteEditor.tsx` 的 content debounce）就保存一次，于是列表被反复重读 → 闪烁。重读瞬间，已展开的子文件夹（`KnowledgeBase.tsx:772`）会把已加载的行替换成「加载中…」文字，用户点击落在「加载中」上 → 没反应、要再点
- **对比**：笔记区（`App.tsx` 的 `handleUpdateNote`）保存后只用 `setNotes(prev => prev.map(...))` 在内存里原地更新那一条，不重读磁盘，所以笔记区不闪、点击正常。这就是「为什么笔记区正常、KB 不正常」
- **修法**（两处，均在 `app/src/components/KnowledgeBase.tsx`）：
  1. 治本：把 `handleUpdateSelectedNote` 里的 `await refreshPath(...)` 改成对齐笔记区——保存后用 `setContentsByPath` 在内存里原地 patch 那一条（slug/title/updated_at；KB 树只显示 title，preview 不展示故不更新）。不再重读磁盘。依赖数组移除 refreshPath
  2. 补防护：子文件夹加载判断（原 `loadingPaths.has(folder.path) ?`）加上缓存保护 `&& !contentsByPath[folder.path]`，对齐根列表（`:1563` 的写法 `loadingPaths.has('') && !contentsByPath['']`）。这样即使将来有合理刷新，已加载过的子文件夹也不会再闪「加载中」
- **关联文件**：
  - `app/src/components/KnowledgeBase.tsx`（`handleUpdateSelectedNote` + 子文件夹加载判断两处）
  - 参考实现：`app/src/App.tsx` 的 `handleUpdateNote`（笔记区，内存 patch 的正确写法）
  - 触发频率来源：`app/src/components/NoteEditor.tsx` content debounce 400ms
- **日期**：2026-06-22

## 踩坑记录

- **核心教训**：保存后刷新状态时，能在内存里原地 patch 单条就别重读整块磁盘列表。重读会把已加载的行临时打回「加载中」态，配合 debounce 高频触发 → 既闪烁又抢走点击命中
- 「点击没反应、要点好几次」别先怀疑事件绑定或 z-index——这次根因是点击落在了被刷新临时替换出来的「加载中」占位上。闪烁和点击失灵两个症状同源，先找「谁在高频替换列表状态」
- 排查时用「为什么笔记区正常、KB 不正常」做对照：两块逻辑做同一件事（保存后更新列表）却行为不同，差异点（内存 patch vs 重读磁盘）就是根因
- **验证**：通过 Tauri 调试桥真实运行时验证——在 dev vault 打开子文件夹内一篇笔记，装 MutationObserver 盯侧栏，改标题触发保存，侧栏行标题正确更新（证明保存 + 内存 patch 生效，含重命名换 slug 路径）且全程 loadingSeen=false（证明不再闪「加载中」）。`pnpm exec tsc --noEmit` 通过
