# Tauri + Vite + React 桌面 App 反复踩坑速查

本项目（vibe-coding，Tauri 2 + Vite + React 19 + Tailwind）开发期间反复掉进同样的坑。每次都要花 10-30 分钟排查同样的根因，本文做一份速查。**遇到症状 → 先翻这里 → 再去 debug**。

---

## 1. Tauri API 调用「同步 throw」（最高频，黑屏 / unresponsive）

### 现象
- App 启动黑屏，或 HMR 后白屏 / 弹窗 unresponsive
- 控制台出现 `Cannot read properties of undefined (reading 'metadata')`
- 报错栈指向 `getCurrentWindow()` / `Database.load()` / `invoke()` 调用点

### 根因
Tauri 在 webview 启动早期，**`window.__TAURI_INTERNALS__` 还没被注入**就被 React effect / mousedown handler 调用了。这些 API 不是返回 reject 的 Promise，而是**同步 throw** —— `.catch()` 只接 Promise rejection，**catch 不到 sync throw**。

最容易触发的场景：
- `useTheme` 在初次挂载就调 `getCurrentWindow().setTheme()`
- 拖拽区 `onMouseDown` handler 在 React 完成 mount 之前已经被绑定，第一次鼠标事件就调 `startDragging()`
- `Database.load('sqlite:vibe.db')` 在 useEffect 里立即触发

### 修法（模板）

```ts
// ✅ 正确：try/catch 包整个调用，不要只 .catch()
try {
  getCurrentWindow().setTheme(theme).catch(() => {});
} catch {
  // Tauri API 还没注入 —— 忽略，下次 effect 再试
}

// ❌ 错误：只能接 Promise rejection，sync throw 漏网
getCurrentWindow().setTheme(theme).catch(() => {});
```

DB 调用同理：包一层 try/catch，或在调用前 `await isTauri()` 检测。

### 防御
**任何调 `@tauri-apps/api/*` 的代码路径，包一层 try/catch**。哪怕你觉得"这个一定是 mount 后才跑的" —— Vite HMR 会让组件被 unmount + remount，时序不可预测。

---

## 2. `data-tauri-drag-region` 三大坑

### 坑 A：data-attribute 与手动 `startDragging()` **不能共存**

#### 现象
窗口能拖一次，但**拖完一次后整个 app unresponsive**，鼠标点击全被吞，必须重启。

#### 根因
Tauri 全局 mousedown listener 看到 `e.target.dataset.tauriDragRegion` 就调 `startDragging()`。同一元素再写 `onMouseDown={() => getCurrentWindow().startDragging()}` 等于 **双触发**：第一次释放后 native 还以为你在拖第二次，窗口卡在 dragging 状态。

#### 修法
**只用一种**。推荐用 `data-tauri-drag-region`，删掉手动 `onMouseDown`。

```tsx
// ✅ 单一机制
<div data-tauri-drag-region onDoubleClick={() => getCurrentWindow().toggleMaximize()} className="...">

// ❌ 双重触发
<div data-tauri-drag-region onMouseDown={() => getCurrentWindow().startDragging()}>
```

### 坑 B：`data-tauri-drag-region` **不递归到子元素**

#### 现象
顶栏看起来是 drag region，但点中间空白处拖不动 —— 只有靠近边缘的几个像素能拖。

#### 根因
Tauri 2 的 drag region 检查的是 `e.target.dataset.tauriDragRegion` —— 即**鼠标实际命中的那个元素**，不会沿着 DOM 父链查找。如果外层 div 加了属性，但内层 `flex-1` 子容器没加，鼠标命中内层时就不触发拖拽。

#### 修法
**所有要让用户能拖的容器层都要加 `data-tauri-drag-region`**。`<button>` / `<a>` / `<input>` 这类 interactive element 不用加（也不应加），它们自然不触发拖拽。

```tsx
// ✅ 外层 + 内层都标
<div data-tauri-drag-region className="h-10 flex items-center pl-20 pr-3">
  <div data-tauri-drag-region className="flex-1 flex items-center gap-1">
    {tabs.map(...)}
    <button>+</button>  {/* button 自带不触发拖拽 */}
  </div>
</div>
```

### 坑 C：`onMouseDown={e => e.stopPropagation()}` 也是反模式

历史代码常见在按钮上写 `onMouseDown={e => e.stopPropagation()}` 防止冒泡触发拖拽。当你只用 `data-tauri-drag-region` 时**不需要这层**（Tauri 不靠事件冒泡触发，靠 `e.target` 检查）。删掉，避免误以为有用。

### 拖拽区集中位置（项目惯例）
窗口拖拽入口**只放在 TabBar 顶栏**一处。不要散在 Sidebar / NoteList / NoteEditor / ClipReader 各自的 h-12 顶栏里 —— 散开拖拽区 = 散开 bug 概率。

---

## 3. Tailwind padding 与背景层（vibrancy 失效）

### 现象
加了 macOS 毛玻璃 vibrancy，组件外观正常，但 sidebar 折叠 / 加 padding 后毛玻璃 "看不见了"。

### 根因
Tailwind 的 `padding` 不是"留空"，而是**把元素 box 撑大** —— `bg-white` 会把整个 box（**含 padding 区域**）涂白。padding 区域不会"透出"后面的层。

### 修法
**双层结构**：外层只负责留空（透明），内层负责画背景。

```tsx
// ✅ 双层
<div className="pl-56">                 {/* 外层透明，padding 透出 vibrancy */}
  <div className="bg-white">...</div>   {/* 内层不透明 */}
</div>

// ❌ 单层
<div className="pl-56 bg-white">...</div>  {/* padding 区域也是白的 */}
```

### 适用范围
任何想让背景毛玻璃 / 渐变穿透到子区域的场景：sidebar 折叠占位、tab 栏左侧红绿灯让位、抽屉浮层下方等。

---

## 4. macOS traffic light position 反直觉

### 现象
说"红绿灯 y 值再低些"，调小 y → 红绿灯反而往**上**移。调大 y → 红绿灯往**下**移。

### 根因
`trafficLightPosition: { x, y }` 中 y 是 **从窗口顶部往下偏移的距离**（不是屏幕底部往上）。越大 = 越靠下。

### 模板
本项目当前 `{ x: 18, y: 24 }`，搭配 `h-10` (40px) 的 TabBar 顶栏视觉对齐。改前先记住：

| 视觉感受 | y 值方向 |
|---------|---------|
| 红绿灯往上移（更靠顶边） | y 调**小** |
| 红绿灯往下移（更靠中间） | y 调**大** |

`titleBarStyle: "Overlay"` + `hiddenTitle: true` 是配合 `trafficLightPosition` 的必须项，少一个红绿灯会回到默认位置。

---

## 5. Linter / 编辑器自动 reformat **删 unused 然后调用方崩**

### 现象
你刚把 `aiOpen / onToggleAI` props 加回 NoteEditor，下一次编辑时 linter 自动把它们从 destructure 里删掉，然后 App.tsx 还在传 → TS 不报但运行时 props 是 undefined / 拼写出错。

### 根因
项目跑了若干自动 reformat hook（含 vercel-plugin 的"建议"）。它们认为 unused prop 是死代码，自动清理。**修改循环里来回加 / 删同一组 props 时尤其危险**。

### 防御
- 每次大改 props 时，**props 类型 + 函数签名 + 调用点三处一起改完才停手**，不要"先改类型，下一轮再补调用点"
- 怀疑被 reformat 过 → 先 `pnpm tsc --noEmit` 看类型，再跑 dev 看运行时
- TS 编译过≠运行时正确（ClipReader 删 props 类型但 App 传值，TS 会接受 unused props）

---

## 6. vercel-plugin 误报：项目不是 Next.js

### 现象
每次 Edit 后 hook 输出：
```
React hooks require "use client" directive — add it at the top of client components
You must run the Skill(workflow) tool / Skill(nextjs)
```

### 根因
全局装了 `vercel-plugin`，根据**文件路径 / 命令字面量**做模式匹配，无法区分：
- `app/` 是 Tauri 子目录还是 Next.js App Router
- `pnpm dev` 是 Vite 还是 Next.js
- React 组件是否需要 `"use client"`（Vite 没有 RSC，**不需要**）

### 处理
**全部忽略**。不读 Next.js 文档、不加 `"use client"`、不调用 `Skill(nextjs)` / `Skill(workflow)`。详见 `.claude/rules/ignore-vercel-hooks.md`。

唯一可能需要 reconsider 的场景：未来真把项目迁到 Next.js（不会发生 —— 桌面 app 不需要 SSR）。

---

## 7. CodeMirror 文档切换：dispatch 而不是 value 绑定

### 现象
切换笔记时光标跳到文末 / 内容闪烁 / undo 历史串了。

### 根因
直接把 `value={note.content_md}` 绑定给 `<CodeMirror>`，每次 React rerender 都 reset 整个 editor state，CM 内部 history / selection 全废。

### 修法（项目当前用法）
```tsx
// useEffect 监听 note.id 变化，手动 dispatch 替换 doc，不动 selection / history
useEffect(() => {
  if (!note || note.id === lastNoteIdRef.current) return;
  const view = cmRef.current?.view;
  if (view) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: note.content_md ?? '' },
    });
    lastNoteIdRef.current = note.id;
  }
}, [note]);
```

`<CodeMirror value={note.content_md}>` 仍然写，但只在初次挂载生效；切换由 useEffect 接管。

---

## 8. main 分支「永远可运行」铁律（已有 lesson）

详见 [大功能开发期间app挂了阻塞小功能.md](./大功能开发期间app挂了阻塞小功能.md)。本节不重复。

要点：UI 大改前**先建 feature 分支**；commit 前 `pnpm tauri dev` 必须能跑；feature flag 包住未完成的 UI。

---

## 排查口诀（出 bug 时按顺序自查）

1. **黑屏 / unresponsive** → 先看是不是 sync throw（Tauri API 注入时序）→ try/catch
2. **拖一次卡死** → 双触发（drag-region + 手动 startDragging），删掉手动那份
3. **拖不动** → drag-region 不递归，给所有空白容器层都加属性
4. **vibrancy 看不见** → padding 元素带了 `bg-*`，拆双层
5. **红绿灯位置反了** → y 值是 from top，不是 from bottom
6. **改完 props 编译过但跑挂** → linter reformat 把 destructure 删了，把类型 / 签名 / 调用点同步改一遍
7. **hook 喊 `"use client"`** → 忽略，项目不是 Next.js
