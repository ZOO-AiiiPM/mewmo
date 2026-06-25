# 012 — Blockquote 空行残留左边框 + 中文强制斜体

## 症状

1. 引用块中只含 `>` 的空行仍然渲染左边框（视觉噪音，看起来引用没结束）
2. `.cm-blockquote` 设了 `font-style: italic`，中文字体没有 italic 字形 → 浏览器用 oblique 模拟 → 文字歪斜难看

## 根因

- `handleBlockquote()` 无差别对 Blockquote 范围内每一行都加 `cm-blockquote-line` line decoration，没有判断该行是否有实际内容
- CSS 照搬英文 blockquote 惯例写了 `font-style: italic`，没考虑中文场景

## 修法

1. 遍历行时用 `/^>\s*$/` 跳过只含 `>` + 空白的行，不加 line decoration
2. `.cm-blockquote` 移除 `font-style: italic`

## 关联文件

- `app/src/lib/livePreview.ts` — `handleBlockquote()`
- `app/src/index.css` — `.cm-blockquote` 样式

## 踩坑

中文 UI 项目的排版规则和英文不同：italic 在中文语境基本无用（CJK 字体不设计斜体变体），遇到"引用/强调"需求时用颜色/边框/缩进区分，不用 italic。
