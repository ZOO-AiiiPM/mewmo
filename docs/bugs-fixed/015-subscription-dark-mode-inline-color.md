# 015 - 订阅正文深色模式下文字不可见

## 症状

在系统深色模式下，订阅区（EntryReader）的正文大部分文字仍为深色（如 #333、rgb(28,25,23)），在深色背景上几乎不可见。同一 app 的剪藏区（ClipReader）深色模式正常。

## 根因

微信/公众号文章 HTML 带有大量 inline `style="color: #333"` 等灰阶色 hard-code。CSS 的 `html.dark .clip-prose { color: #e7e5e4 }` 优先级低于 inline style，无法覆盖。

ClipReader 已有处理：useEffect + MutationObserver 遍历 `[style]` 元素，保存原始 color，dark mode 下将灰阶色（R/G/B 最大差值 < 30）清空让 CSS 主题色接管，彩色装饰色保留。

EntryReader 缺少这段逻辑。

## 修法

将 ClipReader 的 `isNeutralColor` 函数和 dark mode useEffect 完整移植到 EntryReader.tsx：
- `isNeutralColor(c)`: 判断 rgb/hex 颜色是否为灰阶（channel spread < 30）
- useEffect 监听 `document.documentElement` class 变化 + contentRef 子树变化
- dark mode 下：灰阶 color → 清空（让 CSS 接管）；彩色 color → 保留

## 关联文件

- `app/src/components/EntryReader.tsx`
- `app/src/components/ClipReader.tsx`（参考源）
- `app/src/index.css`（`.clip-prose` 的 dark 规则）

## 踩坑

- 必须监听 contentRef 的 childList 变化：手动设置 innerHTML 后 React re-render 可能重置 DOM，需要 MutationObserver 重新 apply
- 监听 attributes 会导致自己 apply 触发循环，只监听 childList + subtree
