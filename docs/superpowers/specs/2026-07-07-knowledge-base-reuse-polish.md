# Knowledge Base Reuse Polish Design

> Date: 2026-07-07
> Status: Approved for implementation

## Goal

知识库不再单独实现一套近似 UI，而是复用今天、笔记、剪藏已经打磨过的展示机制。重点是让知识库里的笔记和文章在卡片、预览、目录、三点菜单上和原入口一致。

## Scope

本轮只做体验复用，不扩展新的知识库深功能。知识库卡片预览要复用 Markdown 预览清洗，表格分隔线、标题井号、列表符号、图片语法、粗斜体标记不显示在小字里；原始 Markdown 内容不被改写。阅读器目录复用 `ReaderToc`，笔记按 Markdown 标题生成目录，文章按 HTML 标题生成目录。左侧卡片小字沿用现有规则：有干净预览才显示，没有就不占位。卡片底部右侧补三点入口，菜单按内容类型复用笔记或剪藏动作，并保留知识库自己的“从知识库移除”动作。

## Architecture

预览文本的清洗逻辑收口到 `apps/web/src/lib/knowledge-content.ts`，内部调用现有 `notePreviewText` 和 `clipPreviewText`，避免知识库自维护一套 Markdown/文章摘要规则。目录和菜单接线留在 `apps/web/src/app/(app)/knowledge-bases/page.tsx`，因为它需要知道当前选中项、删除知识库引用、读者滚动容器和路由参数。

## Testing

先补知识库内容映射单测和静态 UI 契约测试，确认当前实现缺少复用点后再改代码。完成后运行知识库相关单测、静态 UI 测试和 Web lint。
