# 切换笔记时 debounce 内容串写到其他笔记

- **症状**：切换到未加载正文的笔记后，旧笔记 debounce 内容可能丢失或写进新笔记，表现为无法编辑或多条笔记显示同一份内容
- **根因**：`selectedNoteReady` 为 null 时 `NoteEditor` 渲染空态并卸载 CodeMirror；flush 如果只读 `cmRef`，可能在 ref 已空时清掉 timer 丢失 pending；跨笔记复用同一 CodeMirror 实例也可能留下 stale editor 状态
- **修法**：正文输入先写入 `{id,value}` pending ref，flush 优先用 pending 而不是 DOM ref；debounce 创建时捕获 note id 并显式保存；CodeMirror 加 `key={note.id}`，切笔记强制换实例
- **关联文件**：`app/src/components/NoteEditor.tsx`, `app/src/App.tsx`
- **日期**：2026-06-01

## 踩坑记录

- **核心教训**：任何 debounce/autosave 必须绑定目标 ID，不能依赖「当前选中」状态——切换瞬间「当前」已经变了，但 timer 还在跑
- CodeMirror 复用实例切笔记会留 stale state → 用 `key={id}` 强制销毁重建
