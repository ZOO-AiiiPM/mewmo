# TOC mini bars 长目录溢出消失

- **症状**：TOC mini bars 长目录底部溢出；给 flex 子项加 `max-h-full overflow-hidden` 后整组消失
- **根因**：绝对定位父层用 top/bottom 隐含高度，百分比 max-height 落在 flex 子项上不稳定，长目录触发后可能按 0 高度裁切
- **修法**：测量 TOC 外框实际高度，按 bar 高度、gap、上下 padding 计算可渲染数量，只从底部截断 mini bars；hover 面板不放进裁剪容器
- **关联文件**：`app/src/components/TableOfContents.tsx`, `app/src/components/HtmlTableOfContents.tsx`, `app/src/components/useVisibleTocBarCount.ts`
- **日期**：2026-06-01

## 踩坑记录

- 第一次尝试：CSS `max-h-full overflow-hidden` → flex 子项高度算 0，整组消失
- 最终方案：JS 测量可用高度 → 计算能放几个 bar → 只渲染那么多
- **教训**：flex + 绝对定位 + 百分比高度组合不可靠，用 JS 显式测量更稳
