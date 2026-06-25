# 知识库功能 — 转交上下文

> 日期：2026-06-16
> 转交原因：白屏 bug 未解决 + UI spec 缺失，需要新 agent 接手调试和完善

---

## 当前状态

### 已完成
1. **数据架构 spec**：`docs/superpowers/specs/2026-06-15-knowledge-base-architecture-design.md`（方案 C：文件系统即知识库）
2. **实现 plan**：`docs/superpowers/plans/2026-06-16-knowledge-base-implementation.md`
3. **后端 7 个 commits 已落**（见 `git log --oneline -8`）：
   - vault skeleton 加 `library/`
   - SQLite v3 迁移（知识库展示属性表）
   - Rust 9 个 Tauri commands（`commands/knowledge_base.rs`）
   - 前端 types + API 层（`src/lib/kb.ts`）
   - 前端组件接入真实数据（`src/components/KnowledgeBase.tsx`）
   - `list_notes` 扩展扫描 `library/`
   - `get_note` 支持 `library/` 路径

### 阻塞：白屏 bug

**症状**：知识库 zone 第一层（网格）正常，点击进入某个知识库后**整个 app 白屏**。

**已排查的**：
- 前端 `pnpm build` 通过，无 TS 错误
- 后端 `cargo check` 通过
- 参数名不匹配已修复（`kb_dir` → `dir_name`、`sub_path` → `relative_path` 等）
- Tauri MCP bridge 无法执行 webview JS（超时），无法获取 console 错误

**最可能的 root cause**：
React hooks 规则违反——`KnowledgeBase.tsx` 在条件 `if (isAtRoot) return <...>` **之后**定义了 `useState`/`useRef`/`useCallback`（第 420 行附近的 `inlineInput`、`inlineInputRef`、`handleInlineSubmit`）。React 要求 hooks 调用顺序每次 render 一致，条件 early return 之后的 hooks 会在 `isAtRoot` 为 true/false 切换时破坏顺序 → crash。

**修复方向**：把所有 hooks 提到组件顶部（条件 return 之前），或用子组件隔离第二层的 hooks。

### 缺失：UI 交互 spec

Spec 只写了数据架构，**缺少 UI 层定义**：

| 缺失项 | 描述 |
|--------|------|
| Toolbar | 进入知识库后顶部工具栏（返回、新建笔记、新建文件夹、搜索？） |
| 空状态 | 空知识库/空文件夹的引导文案和操作入口 |
| 笔记 zone 复用 | 第二层的列表+编辑器应复用 NoteList/NoteEditor 的交互模式 |
| 编辑器集成 | 点击 KB 笔记后应打开真正的 NoteEditor，不是简单的 preview |
| 右键菜单 | 重命名/删除/移动等操作 |
| 面包屑细节 | 点击面包屑返回上层的行为 |

---

## 关键文件清单

| 文件 | 说明 |
|------|------|
| `app/src/components/KnowledgeBase.tsx` | 前端主组件（**白屏 bug 在这里**） |
| `app/src/lib/kb.ts` | 前端 API 调用层 |
| `app/src/types.ts` | KB 相关类型定义（末尾） |
| `app/src-tauri/src/commands/knowledge_base.rs` | Rust 后端 9 个命令 |
| `app/src-tauri/src/vault/query.rs` | `list_notes`/`get_note` 扩展（支持 library/ 路径） |
| `app/src-tauri/src/commands/notes.rs` | 笔记 CRUD（已加 library 只读 guard） |
| `app/src-tauri/src/vault/meta_db.rs` | v3 迁移注册 |
| `app/src-tauri/src/migrations/vault_meta_v3_knowledge_bases.sql` | 迁移 SQL |

---

## 建议执行顺序

1. **修白屏 bug**：把 hooks 提到组件顶部，验证点击进入知识库不再 crash
2. **补 UI 交互**：第二层应复用笔记 zone 的模式——点击笔记打开 NoteEditor（不是 preview），toolbar 参考 NoteList 的按钮排布
3. **端到端验证**：创建知识库 → 创建文件夹 → 创建笔记 → 编辑笔记 → 返回笔记 zone 能看到该笔记

---

## 运行方式

```bash
cd /Users/zoo/zoo/CC工作目录/进行中/mewmo/.claude/worktrees/1.0version/app
PATH="$HOME/.cargo/bin:$PATH" pnpm tauri dev
```

Vault 测试数据在 `~/Documents/mewmo-vault/`，`library/` 目录已存在（内有用户创建的知识库目录）。

---

## 已知的其他问题（非阻塞，后续修）

- `list_notes` 扩展后两个 Rust 测试 fail（`test_list_notes_sorted_by_mtime_desc`、`test_list_notes_filters_non_user_note`）——因为测试 vault 里多了 library 扫描结果。需调整 test assertion 或在测试时不创建 library/。
- KB 笔记在笔记 zone 标记为只读（`LIBRARY_NOTE_READONLY`）——后续需要支持编辑。
- 新建知识库的颜色目前全部默认 "blue"——后续可加颜色选择器。
