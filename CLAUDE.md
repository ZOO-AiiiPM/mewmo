# vibe-coding

体现 AI 产品思维的 vibe coding 展示项目

**事实进 `.claude/memory/`（查 MEMORY.md 索引），时间线进 `journal.md`，长规则进 `.claude/rules/`。本文件只放需要每次 session 都加载的规则 + 索引。**

---

## 跨 Session 协作（硬规则）

四个位置各司其职：

| 文件 | 存什么 | 何时读/写 |
|------|-------|----------|
| `CLAUDE.md` | 规则 + 索引（目标 < 80 行）| 每次 session 自动加载 |
| `.claude/rules/*.md` | 长规则 / 按主题拆 / 可带 `paths:` 作用域 | 自动加载 |
| `journal.md` | 时间线进度、反思、决策 | **Session 开头读顶部 3 条**；里程碑 / 踩坑后 append 顶部 |
| `.claude/memory/` | 事实（服务器 / 账号 / API / 命令）| MEMORY.md 前 200 行自动加载；主题文件按需读 |

**写入分层**：
- 事实（地址 / ID / URL / 命令 / 字段）→ `.claude/memory/{reference,project,user}_*.md` + 同步 MEMORY.md 索引
- 用户纠正 / 严重错误：短的（1-3 行）→ 本文件"项目硬规则"段；长的 → `.claude/rules/{主题}.md`。**禁止 `feedback_*.md`**
- 进度 / 反思 / 决策 → `journal.md`
- 复杂反转 / 多步踩坑 → `lessons/{主题}.md`

---

## 项目硬规则

<!-- 写本项目真实踩过坑后沉淀出的规则。命令式 + 触发锚点 + 解释 why。删除本占位注释。

**原则**：规则来自真实踩坑或用户纠正 2+ 次，不凭空想通用规则。通用的已在 `~/.claude/rules/`。写法参考 skill 的 `references/claudemd.md` 和 `references/rules.md`。
-->

---

## 关键资源索引

- **事实类**：`.claude/memory/MEMORY.md`（索引，按主题读对应 `reference_*.md` / `project_*.md`）
- **项目规则**：`.claude/rules/*.md`（自动加载，支持 paths 作用域）
- **跨项目规则**：`~/.claude/rules/`（全局，本项目不重复）
- **跨项目参考**：`~/.claude/reference/`（密钥 / 模型 / 路径 / 方法论等）
- **复杂案例**：`lessons/`
- **产品文档**：`docs/`（给人读，编号前缀排序）

---

## 待做

<!-- todo 放这里，完成即删。跨天留着没关系，只删真正完成的或不再做的。
- [ ] 按项目填第一批 todo
-->
