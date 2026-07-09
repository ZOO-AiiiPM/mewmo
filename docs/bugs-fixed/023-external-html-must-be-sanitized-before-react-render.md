# 023 - 外部 HTML 进入 React 前必须白名单清洗

## 症状

RSS/Atom 正文、网页剪藏、Markdown 渲染结果、搜索高亮都可能携带不可信 HTML。如果这些内容直接进入 React 的 `dangerouslySetInnerHTML`，页面会把外部网页或 feed 里的标签、链接、图片、事件属性当成可信内容渲染。

## 根因

SQLite 或数据库只是缓存层，不改变内容源头。剪藏解析器、feed `content_html`、Markdown 渲染器、搜索高亮都可能把外部输入变成 HTML 字符串；如果渲染入口各自临时处理，容易出现某个入口绕过白名单的漏洞。

## 修法

任何 `dangerouslySetInnerHTML` 都必须先走共享 sanitizer。正文阅读场景只允许阅读所需标签、HTTP/HTTPS 链接、安全图片协议和极少量样式；搜索高亮场景只允许 `<mark>`。新增允许的标签、属性、协议或 style property 时，只能在共享白名单里集中添加，并说明阅读体验为什么需要它。

## 关联文件

曾作为项目规则保存在 `.claude/rules/html-safety.md`，适用范围是 `apps/web/src/**/*.tsx`、`apps/web/src/**/*.ts`、`packages/shared/src/**/*.ts`。

## 踩坑记录 / 可复用教训

禁止直接信任 `marked.parse()`、feed `content_html`、剪藏解析器生成的 HTML，也禁止用正则临时删 `<script>` 充当 sanitizer。外部 HTML 的安全边界必须集中、白名单化、按渲染场景区分 rich 内容和 highlight 内容。
