# 知识库进入二层后白屏

- **症状**：知识库 zone 第一层网格正常显示，新建知识库正常；点击进入某个知识库后 content area 白屏，React 渲染崩溃
- **根因**：`KnowledgeBase.tsx` 在 root 层 `if (isAtRoot) return (...)` 后面才声明二层视图使用的 `useState` / `useRef` / `useEffect` / `useCallback`。从 root 进入知识库时，同一组件本次 render 比上次多调用一批 hooks，违反 React hooks 顺序规则
- **修法**：把 drill-in 层用到的 hooks 全部移动到条件 return 之前；当前导航项改成可空读取，避免 root 状态下访问 undefined
- **关联文件**：`app/src/components/KnowledgeBase.tsx`
- **日期**：2026-06-16

## 踩坑记录

- **核心教训**：同一个组件里不能在条件 return 后声明 hooks。即使某个分支暂时不需要这些状态，hooks 也必须在每次 render 中以相同顺序执行
- 这类问题会被误判成 Tauri command 返回格式错误或 Rust command panic，因为崩溃发生在进入页面后、API 调用附近；先看 React hooks 顺序能更快定位
