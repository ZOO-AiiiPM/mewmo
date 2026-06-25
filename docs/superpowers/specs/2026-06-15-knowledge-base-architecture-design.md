# Knowledge Base (知识库) — 数据架构设计 v2

> 日期：2026-06-16
> 状态：Draft
> 方案：文件系统即知识库（方案 C）
> 依赖：POC 前端已验证交互模式（`app/src/components/KnowledgeBase.tsx`）

---

## 1. 概述

知识库是用户手动组织知识的确定性骨架。**知识库 = vault 里的真实文件夹结构**，笔记文件物理存在里面。

**核心原则**：
- 文件系统即数据结构，导入导出天然支持（zip 目录即可）
- 一篇笔记只属于一个位置（物理唯一性）
- 笔记 zone 仍能看到知识库里的笔记（扫描范围扩展）

---

## 2. 用户场景

1. 创建"AI 学习"知识库 → vault 里出现 `library/AI-学习/` 目录
2. 在里面建"Agent 框架"文件夹 → `library/AI-学习/Agent-框架/`
3. 在文件夹里新建笔记 → `library/AI-学习/Agent-框架/架构横评.md`
4. 笔记 zone 也能看到"架构横评"（扫描时包含 library 子目录）
5. 导出：zip `library/AI-学习/` → 用户拿到 markdown + 文件夹结构
6. 导入：把一个文件夹拖入 → 自动创建知识库 + 子目录 + 文件

---

## 3. 存储设计

### 3.1 Vault 目录结构变化

```
vault/
├── wiki/notes/          ← 普通笔记（不属于任何知识库）
├── raw/clips/           ← 剪藏
├── library/             ← 【新增】知识库根目录
│   ├── AI-学习/         ← 一个知识库（目录名 = slugify(name)）
│   │   ├── Agent-框架/  ← 子文件夹（无限嵌套）
│   │   │   └── 架构横评.md
│   │   └── RAG-实战.md
│   └── 工作项目/
│       └── 周报模板.md
└── .mewmo/
    └── vault-meta.db    ← 只存知识库的展示属性（颜色/排序）
```

### 3.2 文件系统是主存储

| 数据 | 存储位置 | 形式 |
|------|---------|------|
| 知识库列表 | `library/` 下的顶层子目录 | 目录名 = slugify(知识库名) |
| 文件夹层级 | 目录嵌套 | 真实文件系统目录 |
| 笔记内容 | `.md` / `.html` 文件 | 和 `wiki/notes/` 格式完全一致 |
| 知识库元数据 | vault-meta.db `knowledge_bases` 表 | 颜色/排序/描述（展示属性） |

### 3.3 SQLite 只存轻量展示属性

因为文件系统不能存"颜色"、"排序顺序"这类 UI 属性，所以保留一张极简表：

```sql
-- vault-meta.db v3: Knowledge Base display metadata
CREATE TABLE IF NOT EXISTS knowledge_bases (
    dir_name TEXT PRIMARY KEY,       -- 目录名（= slugify(name)，和 library/ 下的子目录对应）
    color TEXT,                      -- UI 卡片颜色，如 "blue" "amber"
    position INTEGER NOT NULL DEFAULT 0,  -- 网格排序
    description TEXT
);
```

**只有一张表**。文件夹和笔记的数据从文件系统读取，不入 DB。

---

## 4. 笔记 zone 兼容

当前 `query::list_notes()` 只扫 `wiki/notes`。扩展为同时扫 `library/` 下所有 `.md/.html`：

```rust
// 现在：
io::list(vault, "wiki/notes", false, Some("user-note"))

// 改为同时扫 library（recursive=true）：
// 1. wiki/notes（现有，不递归）
// 2. library/（新增，递归扫描所有子目录）
// 合并结果返回
```

这样笔记 zone 的时间线列表里包含所有笔记（无论在 wiki/notes 还是 library 里）。区别只是知识库 zone 按**文件夹结构**展示，笔记 zone 按**时间线**展示。

---

## 5. Tauri Commands

### 5.1 知识库 CRUD

| 命令 | 操作 | 说明 |
|------|------|------|
| `kb_list` | 扫 `library/` 子目录 + 查 DB 元数据 | 返回知识库列表 |
| `kb_create` | mkdir `library/<slug>/` + 插入 DB | 新建知识库 |
| `kb_rename` | rename 目录 + 更新 DB `dir_name` | 重命名 |
| `kb_delete` | rm -rf `library/<name>/` + 删 DB 行 | 删除知识库（含所有内容！需确认） |
| `kb_update_meta` | 更新 DB color/description | 改展示属性 |
| `kb_reorder` | 更新 DB position | 重排序 |

### 5.2 文件夹 CRUD

| 命令 | 操作 | 说明 |
|------|------|------|
| `kb_folder_list` | read_dir 递归 | 返回某知识库的目录树 |
| `kb_folder_create` | mkdir | 新建子文件夹 |
| `kb_folder_rename` | rename 目录 | 重命名 |
| `kb_folder_move` | rename（改路径） | 移动到其他位置 |
| `kb_folder_delete` | rm -rf 目录 | 删除（含内容！需确认） |

### 5.3 笔记操作（知识库内）

| 命令 | 操作 | 说明 |
|------|------|------|
| `kb_list_contents` | read_dir 当前层 | 列出某文件夹下的子文件夹+笔记 |
| `kb_create_note` | write_atomic 到 `library/<kb>/<folder>/` | 在 KB 里新建笔记 |
| `kb_move_note` | rename 文件 | 把笔记从一个位置移到另一个 |
| `kb_import_folder` | 递归复制外部目录到 `library/` | 导入整个文件夹为知识库 |
| `kb_export` | 复制 `library/<kb>/` 到指定路径 | 导出知识库 |

### 5.4 笔记读写

知识库里的笔记**复用现有的 `get_note` / `update_note`**，只是 slug 变成相对路径（如 `library/AI-学习/Agent-框架/架构横评`）而非简单的 stem name。

---

## 6. 标识符变化

当前 slug 只是文件 stem（`my-note`），因为所有笔记都在同一个扁平目录。知识库引入了嵌套结构，需要用**相对路径**做标识：

| 位置 | 标识符形式 | 示例 |
|------|-----------|------|
| `wiki/notes/foo.md` | `foo` | 不变 |
| `library/AI-学习/bar.md` | `library/AI-学习/bar` | 新增 |
| `library/AI-学习/子目录/baz.md` | `library/AI-学习/子目录/baz` | 新增 |

前端传给 `get_note` 的 id 从纯 slug 变为相对路径。后端 `io::read()` 已支持相对路径，无需改动。

---

## 7. Vault Skeleton 变化

`vault/init.rs::create_skeleton()` 新增：
```rust
create_dir_all(vault.join("library"))?;
```

仅创建 `library/` 根目录，不创建子目录（由用户动态创建）。

---

## 8. FTS 索引兼容

当前 `vault/search.rs` 索引 `wiki/notes/` 下的文件。需扩展为同时索引 `library/` 下所有 `.md`：

- `indexed_files` 表的 `slug` 字段改为存相对路径
- `notes_fts` 的 `slug UNINDEXED` 同样存相对路径
- 启动自检逻辑扫描 `wiki/notes/` + `library/`

---

## 9. 实现路径

### Phase 1：后端基础
1. `vault/init.rs` — `create_skeleton` 新增 `library/` 目录
2. `vault/migrations/vault_meta_v3_knowledge_bases.sql` — 一张元数据表
3. `vault/meta_db.rs` — 注册 v3 迁移
4. `commands/knowledge_base.rs` — KB/文件夹/内容 CRUD（文件系统操作）
5. `commands/mod.rs` + `lib.rs` — 注册命令

### Phase 2：扫描范围扩展
1. `vault/query.rs::list_notes()` — 扩展扫描 `library/`
2. `vault/search.rs` — FTS 索引覆盖 `library/`
3. 前端 Note 类型的 `id` 适配相对路径

### Phase 3：前端接入
1. `src/types.ts` — 添加 KnowledgeBase 类型
2. `src/lib/kb.ts` — API 调用层
3. `src/components/KnowledgeBase.tsx` — 用真实数据替换 mock

### Phase 4：交互完善
1. 在 KB 内新建笔记/文件夹的 UI
2. 移动笔记到知识库的操作
3. 导入/导出功能

---

## 10. 对比旧方案（v1 spec）

| 维度 | v1（SQLite 引用） | v2（文件系统） |
|------|------------------|---------------|
| 存储 | 3 张表 + 引用关系 | 文件夹 + 1 张展示属性表 |
| 导入导出 | 需要"组装"逻辑 | zip 目录即可 |
| 同一笔记多 KB | ✅ 支持 | ❌ 不支持（物理唯一） |
| 编辑一致性 | 引用指向同一文件 | 天然（只有一份文件） |
| 死链问题 | 有（笔记删了引用悬空） | 无 |
| 复杂度 | 高（引用管理 + 解析） | 低（文件系统操作） |

---

## 11. 验证

1. `pnpm build` — 前端编译通过
2. `PATH="$HOME/.cargo/bin:$PATH" cargo test`（在 `app/src-tauri`）
3. `pnpm tauri dev` 端到端：
   - 创建知识库 → `library/` 下出现目录 + 网格显示
   - 创建文件夹 → 目录嵌套
   - 新建笔记 → .md 文件在对应目录
   - 笔记 zone 能看到知识库里的笔记
   - 删除知识库 → 目录和内容一起消失
