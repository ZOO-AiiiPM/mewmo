# WebKit 空单元格复制失败

- **症状**：表格多格选区空单元格复制失败
- **根因**：WebKit/WKWebView 里 `execCommand('copy')` 对 collapsed empty selection 不触发 copy event
- **修法**：改用隐藏 textarea + `execCommand('copy')` 直接复制 text/plain
- **关联文件**：`app/src/lib/livePreview.ts`
- **日期**：2026-05-29（commit `09dda97`）
