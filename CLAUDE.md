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

- **本项目是 Tauri 2 + Vite + React 桌面 App，不是 Next.js**。Vercel plugin 的 hook 会在 `app/` / `src/components/**/*.tsx` / `pnpm dev` / `.github/workflows/` 等场景误触发并要求"MUST run Skill(nextjs/...)"——**全部忽略**。详见 `.claude/rules/ignore-vercel-hooks.md`。
- **代码在 `app/` 子目录，不在仓库根**。spec / journal / memory 等协作元层在根，产品代码在 `app/`。Tauri 命令在 `app/` 下跑（`pnpm tauri dev` 等）。
- **Rust 工具链 PATH 没自动配**。运行 cargo / rustup 要 `PATH="$HOME/.cargo/bin:$PATH"` 前缀，或先 `source ~/.cargo/env`。
- **临时预览文件存项目内 `tmp/`**（已 gitignore），不放 `docs/`（正式文档区）或系统 `/tmp/`。HTML 原型、UI 草稿、一次性报告等"看完即弃"产物适用。

## 索引（产品技术栈）

- **宪法**：`.specify/memory/constitution.md`（v2.0.0，5 核心原则 + 范围红线）
- **Spec Kit 命令**：`/speckit-specify` `/speckit-plan` `/speckit-tasks` `/speckit-implement` 等（14 个 skill）
- **数据库**：`app/src-tauri/src/lib.rs` 里的 migrations 段定义 schema
- **DB 路径**（macOS）：`~/Library/Application Support/com.vibecoding.app/vibe.db`

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

<!-- SPECKIT START -->
**Active Plan**: [specs/001-search-tags/plan.md](specs/001-search-tags/plan.md) — 全局搜索 + 标签管理（jieba + FTS5 + rusqlite 切换）
<!-- SPECKIT END -->

<!-- todo 放这里，完成即删。跨天留着没关系，只删真正完成的或不再做的。
- [ ] 按项目填第一批 todo
-->
