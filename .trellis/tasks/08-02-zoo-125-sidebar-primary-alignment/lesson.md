# Lessons: ZOO-125 统一 Web 侧边栏一级入口对齐

This file captures raw observations from this task. Keep evidence and uncertainty visible; a later curation pass promotes durable guidance into `.trellis/spec/`.

## Observations

- `SidebarLink` 同时渲染一级入口和二级项；用可选的 `primary` 修饰符区分层级，避免改变二级项的既有缩进。
- 分组标题的 chevron 在 flex 内容流中会推动 icon / label；仅在 sidebar group head 中绝对定位它，可保留其他返回行的既有布局。
