# IME 拼音组字被 livePreview dispatch 打断

- **症状**：IME 拼音组字被打断，组字缓冲直接上屏成英文
- **根因**：livePreview 重写后，ViewPlugin 在每次 docChanged 后异步 dispatch rebuildEffect（queueMicrotask 与 requestAnimationFrame 分别有一处），都没检测 view.composing；在 IME composition 期间 dispatch 改光标行 decoration 打断 composition，webview 把拉丁字母直接上屏
- **修法**：两个 dispatch 点都加 `view.composing` guard：update() 第二个 if 块进入时检测，queueMicrotask 回调查一次、scheduleRebuild 的 rAF 回调查一次
- **关联文件**：`app/src/lib/livePreview.ts`（ViewPlugin.fromClass，约 1502-1540 行）
- **日期**：2026-06-04

## 踩坑记录

- **核心教训**：任何在 CodeMirror ViewPlugin 里异步 dispatch 的操作，都必须先检查 `view.composing`。IME composition 期间任何 dispatch 都会打断输入法
- 原纯 StateField 版只同步重建不额外 dispatch，无此问题——重构引入异步时忘了加 guard
