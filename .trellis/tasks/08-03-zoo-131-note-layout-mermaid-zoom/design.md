# Technical Design

## Layout

将 embedded note、文章 reader 与 loading skeleton 的内容列统一放宽到 `960px`。所有阅读滚动容器、文章与 ProseMirror 内边距使用响应式 `clamp()`，桌面减少留白，窄屏保留最小安全边距；今天与知识库继续复用同一 reader 规则。

## Mermaid Interaction

Mermaid renderer 继续返回字符串，让 Milkdown 先执行既有 DOMPurify 清洗。渲染字符串外包一层稳定 class；挂载后的 observer 只在发现该 class 时动态导入 `@panzoom/panzoom` 并初始化 SVG。

- Pointer Events 负责触屏 pinch 与拖动。
- `ctrlKey` wheel 交给 `zoomWithWheel`，覆盖触控板 pinch；普通 wheel 不处理。
- `minScale: 1`、`maxScale: 5`，最小缩放时仍允许拖动查看图表边缘。
- observer cleanup 销毁实例和 wheel listener，笔记切换自然恢复默认状态。

## Security

不在 Mewmo 代码中直接执行 Mermaid SVG 的 `innerHTML`。包装后的字符串仍由 Milkdown code-block preview 的 SVG-aware DOMPurify sanitizer 处理后才进入 DOM。
