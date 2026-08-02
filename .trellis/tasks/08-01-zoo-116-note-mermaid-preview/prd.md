# ZOO-116 笔记 Mermaid 代码块预览

## Goal

让笔记正文中语言标记为 `mermaid` 的 fenced code block 在保留源码编辑能力的同时显示安全、本地、可恢复的图表预览。Linear ZOO-116 是需求与验收真源。

## Background

- 笔记正文使用 Milkdown Crepe 7.21.2，创建入口在 `apps/web/src/components/editor/NoteEditor.tsx`。
- Crepe CodeMirror feature 已内建 `renderPreview(language, content, applyPreview)`、异步 loading、源码/纯预览切换与 preview panel；当前未配置 `renderPreview`，因此代码块只有源码。
- 现有主题文件已经为 code block preview divider 与 label 提供语义色样式 [`apps/web/src/components/editor/editor-theme.css:251`]。
- Milkdown 7.21.2 的 preview panel 会对字符串/Element 进行 DOMPurify 清洗，并只在 SVG namespace 内允许 Mermaid v11 所需的 `foreignObject`。
- 官方 Mermaid 是成熟且持续维护的完整 Mermaid syntax renderer；详细选型证据见 `research/solution.md`。

## Requirements

1. 只有标准化后语言名等于 `mermaid` 的代码块启用图表预览；所有其他语言和无语言代码块返回 `null` 并保持当前行为。
2. 使用官方 `mermaid` pnpm 依赖并本地打包，禁止 CDN、远程渲染 API 或自研 parser/renderer。
3. 通过 Crepe `CodeMirror` feature 的 `renderPreview` 接入，不增加平行 Markdown renderer、不替换 ProseMirror schema、不改变保存的 Markdown。
4. Mermaid runtime 必须动态导入，且非 Mermaid 笔记的初始执行路径不得加载它。
5. Mermaid 初始化使用 `startOnLoad: false` 与 `securityLevel: "strict"`；生成 SVG 继续交给 Milkdown preview panel 的 sanitizer。
6. 每次 render 使用唯一 DOM id；异步渲染必须防止旧请求覆盖较新的代码或语言状态。
7. Mermaid 代码块默认只显示图表预览并隐藏源码，沿用 Crepe 自带按钮显示源码进行编辑并返回纯预览；普通代码块继续默认显示源码，不增加页面级模式。
8. 空 Mermaid 代码块不显示预览；语法错误在当前代码块内显示简短、可读、使用语义色的错误状态，不能产生未处理 Promise rejection 或破坏编辑器。
9. 图表在深色与浅色主题中可读；主题变化后允许重渲染或使用稳定主题 token，但不得硬编码造成另一主题不可读的前景色。
10. 自动保存与重开笔记后，原始 fenced Markdown 保持不变并重新得到预览。

## Out Of Scope

- 普通代码块预览或页面级 Markdown 预览模式。
- 在分享页、Today、知识库、回收站或聊天中渲染 Mermaid。
- Mermaid 源码生成、图片导出、画布缩放、交互链接或点击回调。
- 服务端渲染、远程 Kroki、`mermaid-isomorphic` SSR 管线或自研图表语法。

## Acceptance Criteria

- [ ] `mermaid` fenced code block 显示图表并保留源码编辑能力。
- [ ] 初次打开或重开笔记时 Mermaid 代码块默认隐藏源码；切换按钮可以显示源码并再次隐藏。
- [ ] Crepe 自带按钮可以进入纯预览并返回编辑。
- [ ] JavaScript、TypeScript、纯文本及无语言代码块不出现 Mermaid 预览，行为不变。
- [ ] 空内容不渲染；错误语法局部显示错误，修正语法后可恢复预览。
- [ ] 快速连续编辑或切换语言时，旧异步结果不会覆盖新内容。
- [ ] 无 Mermaid 的笔记不会在初始路径加载 Mermaid runtime。
- [ ] Mermaid 使用严格安全配置，SVG 继续经过现有 sanitize 链路。
- [ ] 流程图和时序图在深色、浅色主题下均可读。
- [ ] Mermaid `foreignObject` 内的 HTML 标签文字在深色、浅色主题下均与节点背景保持清晰对比。
- [ ] 保存并重开后 Markdown 不变，预览恢复。
- [ ] 相关单元测试、Web lint、theme check、生产 build 与浏览器验收通过。
