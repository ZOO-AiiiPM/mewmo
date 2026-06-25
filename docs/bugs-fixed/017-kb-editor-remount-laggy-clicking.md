# 知识库连点笔记卡顿、无响应（编辑器强制重挂载）

- **症状**：知识库（KB）zone 里快速连续点击笔记时，UI 出现「点了没反应、有延迟」现象。通过 down/up/click 事件探针验证：DOM 点击事件正常触发且没丢失，问题出在点击之后的渲染阶段
- **根因**：`KnowledgeBase.tsx` 的 `selectNote` 函数每次点击笔记都执行 `setEditorMountKey(k=>k+1)`，配合模板中的 `<NoteEditor key={editorMountKey}>`，导致每次点击都**强制 React 销毁并重新挂载整个 CodeMirror 编辑器实例**。连续点击时，主线程被反复的 CM6 初始化阻塞。对比笔记区（`App.tsx` 的 NoteEditor）没有传 key 属性，靠 NoteEditor 内部的 `keyedNoteId` 机制切换内容而不重挂载，所以体验丝滑
- **对比**：笔记区（`App.tsx` 里）保存和切换笔记均无卡顿，因为：(1) NoteEditor 组件无 key；(2) 内部靠 `keyedNoteId` 状态识别笔记变化，只重 CM6 内容不重挂载；(3) 效果是同一 editor 实例复用，切换顺畅。这就是「为什么笔记区正常、KB 不正常」
- **修法**（在 `app/src/components/KnowledgeBase.tsx`，三处改动）：
  1. 删除 state 声明 `const [editorMountKey, setEditorMountKey] = useState(0)`
  2. 删除 `selectNote` 函数里的 `setEditorMountKey(k=>k+1)` 调用
  3. 删除 NoteEditor 的 key 属性：从 `<NoteEditor key={editorMountKey} ...>` 改为 `<NoteEditor ...>`。NoteEditor 内部的 `keyedNoteId` 已足以驱动正确的内容切换
- **关联文件**：
  - `app/src/components/KnowledgeBase.tsx`（editorMountKey 三处删除点）
  - 参考实现：`app/src/App.tsx`（笔记区 NoteEditor 的正确用法，不传 key、靠内部 keyedNoteId）
  - 组件内部机制：`app/src/components/NoteEditor.tsx`（keyedNoteId）
- **验证**：在 webview 给 .cm-editor 容器打 MutationObserver，验证切笔记后同一 editor DOM 节点保持不变（即组件实例未重新挂载）。`pnpm exec tsc --noEmit` 通过无类型错误
- **日期**：2026-06-22

## 踩坑记录

- **核心教训**：控制组件挂载生命周期需要考虑 React key 的全局影响——key 变 = 组件销毁重建，这在 List 里常见且必要，但在 "单一动态内容编辑器" 里反而破坏了内部状态机。修复时对齐现有正确实现（笔记区）而非自行设计，能避免重复踩坑
- 「连点卡顿」症状很容易被误解为"事件丢失 / 状态更新慢 / 点击绑定有问题"，实际根因是"每次点击都重挂载重 compute-intensive 组件"。排查时用性能分析工具看主线程时间线，找出谁在占用大块时间
- **验证**：通过 MutationObserver 盯同一 DOM 节点，如果 nodeType/className 不变说明是内容更新；如果整个节点被替换说明是重挂载。避免凭"感觉卡"做结论
