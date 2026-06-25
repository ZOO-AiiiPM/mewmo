# 014 - 订阅正文重复显示文章标题

## 症状

EntryReader 阅读视图中，文章标题出现两次：一次是 EntryReader 自己渲染的 `<h1>{entry.title}</h1>`，另一次是正文 HTML 里微信 CMS 自带的 `<h1 class="rich_media_title">标题</h1>`。

## 根因

微信公众号的 HTML content 包含完整页面结构，title 既在 RSS XML 的 `<title>` 字段里（被 feed-rs 解析为 entry.title），也在 `<content:encoded>` 的 HTML body 里作为 h1 元素。EntryReader 两处都渲染，造成视觉重复。

## 修法

在 adapter.rs 的 `map_entry` 流程中加入 `strip_duplicate_title`：
1. scraper 解析 content HTML
2. 选择前 3 个 h1/h2/h3 元素
3. 对比 `.text().trim()` 与 `entry.title.trim()`
4. 完全匹配时，将该节点 id 加入 skip set，用 `serialize_tree` 重新序列化时跳过

只检查前 3 个 heading 避免误删正文中碰巧同名的小节标题。

## 关联文件

- `app/src-tauri/src/subscription/adapter.rs` (`strip_duplicate_title`)

## 踩坑

同 013——不能用 `el.html()` + `replacen` 做字符串替换，必须走 NodeId skip + 重新序列化。
