# 接手简报：Shell 等宽画框 UI 改造（会话 35404036，实际发生于 2026-07-10，非 07-23）

## 结论先行

- **代码无需抢救**：产出（`--frame: 6px` 画框体系 + `--selected: #f5ecd9` 米黄选中态 + 原型 `docs/prototypes/2026-07-10-shell-frame.html`）已在 2026-07-11 被打包进提交 `8e04277`「perf(web): speed up workspace navigation and editing」进入 main 主线——⚠️ 提交标题是 perf，git log 里完全看不出这次 UI 改造。当前 ZOO-74 分支已继承。
- **与 agent-summary-sidebar worktree 的 28 个脏文件确凿无关**（脏文件 mtime 07-06 早于本会话；其脏 globals.css 无 `--frame` token；其分支不含 8e04277）。⚠️ 衍生风险：将来合并 summary-sidebar 时其旧基线 globals.css 会与 main 的 `--frame/--selected` 体系冲突，以 main 为准手工调和。

## 设计决策记录（git 里看不到，转录抢救）

- 定性：「问题不在有缝，而在缝太犹豫」→ 选型「等宽画框」（passe-partout 装裱隐喻，参照 Arc）。
- `--frame: 6px`：原型 10px 用户嫌宽改 6；单一 token 挂住侧栏 margin、列表栏、阅读面板、AI 栏 top/right/bottom、AI 拖拽手柄定位 `calc(var(--ai-w) + var(--frame)/2 - 9px)`。
- `#f5ecd9`：用户指名的 AI 栏米黄 `#fdf9f1` 与纯白只差 2% 选中态隐形 → 同色相加深一档；hover `#f7f2e7`；第一版 `#efe7d5` 被嫌偏土。
- 硬约束：最左毛玻璃导航材质永远不动；`.mewmo-marketing-page` 局部 token 块需同步补 `--selected`。
- 三个踩坑教训：① 改几何公式要 grep 所有共享同一几何假设的兄弟规则（手柄硬编码 -13px 曾偏移）；② 面板材质对齐改 base token 引用（--s2→--s3），别叠主题覆写；③ 用户引用原型说话时要回到原型结构理解意图，不是在现状上换色。

## 未完成

1. 用户最终视觉验收未发生（浅/深主题各看一眼四面板 6px、选中米黄、AI 栏与阅读面板同纸）。
2. 深色 `--selected: #2e2f34` 与旧 `--raised` 同值 → **深色下选中态无视觉变化**，专属选中色未设计。
3. 「编辑器顶栏中间大片空白」问题被指出未处理。
4. journal `journal/shell-frame-css__2026-07-10.md` 三次派子代理写、三次因分类器故障失败——本简报即为补账。
