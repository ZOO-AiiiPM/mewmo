# SQLite DDL migration 必须每个 step 写成幂等，不能依赖 transaction 回滚

> migration 失败重跑撞 "duplicate column name" / "table already exists" 反复出现，根因是把 SQLite DDL 当成跟 DML 一样有强 transaction 保证。

## 一句话本质

SQLite 对 DML（INSERT/UPDATE/DELETE）的 transaction 回滚保证强；对 DDL（ALTER TABLE / CREATE TABLE / CREATE INDEX / CREATE TRIGGER / CREATE VIRTUAL TABLE）的回滚保证**弱**——某些 page-level 操作不保证完全回滚到 BEGIN 状态。migration 必须靠每个 step 的幂等设计兜底，不能靠 transaction。

## 现象

migration 第一次跑到中段失败（比如 backfill 阶段触发器逻辑 bug），整个 transaction 看起来 rollback 了，但下次重跑撞 `duplicate column name: <col>` / `table <name> already exists`——前面 ALTER TABLE 加的列 / CREATE TABLE 建的表**留在 db 上没回滚**，重跑这一步就直接报错，整个 migration 永远过不去。

复合症状：FTS5 contentless shadow 模式建表后没先 backfill，触发器装上后第一次 UPDATE 主表触发的 'delete' 命令尝试删除一个 fts 表里不存在的 row → 内部索引状态 corrupt → 下次 dev 启动 `PRAGMA integrity_check` 报 "database disk image is malformed" → app 启动 panic。这种情况即便重跑也救不了，必须 DROP fts 表 + reset user_version 才能从干净状态重来。

## 根因

SQLite 的 transaction 实现走 rollback journal / WAL，对于 page 数据的修改有完整回滚记录。但 DDL 操作涉及 schema 表（`sqlite_master`）的更新和 page 重组，部分场景下 schema 变化会先于 transaction commit 持久化到磁盘——一旦 transaction 失败，schema 已经改了，page 数据回滚了，db 处于"半成品"状态。SQLite 文档承认 DDL 回滚有限制但语焉不详，实战里只能假设"DDL 不可靠回滚"。

FTS5 的额外坑：contentless shadow 模式下 fts 表本身不存内容，只存 docid 索引，依赖触发器把主表内容同步进 fts。装好触发器后**第一次写主表**会触发 `INSERT INTO fts(fts, rowid, ...) VALUES('delete', old.id, ...)` 这种"删旧 row"的语义——但 fts 表里此时还没有任何 row，"删一个不存在的 row" 让 fts 内部索引状态从合法变 corrupt。这是 SQLite FTS5 的隐式协议（doc 不显式说，但成熟项目实战里都这么做）。

## 修法

**每个 DDL step 检查"是否已做"，做过就 skip**：

- `ALTER TABLE <t> ADD COLUMN <c>`：先 `PRAGMA table_info(<t>)` 拿现有列名列表，列已存在就 skip。SQLite 没有 `ADD COLUMN IF NOT EXISTS` 语法，只能手动检查。
- `CREATE TABLE` / `CREATE INDEX` / `CREATE TRIGGER` / `CREATE VIRTUAL TABLE`：一律加 `IF NOT EXISTS`。
- 初始数据 `INSERT`：用 `INSERT OR IGNORE` 或先 `SELECT` 检查行是否存在。
- `DROP TABLE` / `DROP INDEX` / `DROP TRIGGER`：加 `IF EXISTS`。

**FTS5 contentless shadow 表的标准建表顺序**（任何一步颠倒都会 corrupt）：

1. `CREATE VIRTUAL TABLE IF NOT EXISTS <fts> USING fts5(...)` —— 先建 fts 表
2. `ALTER TABLE <main> ADD COLUMN <token_col>` —— 主表加 token 列（如有）
3. `INSERT INTO <fts>(rowid, ...) SELECT id, ... FROM <main>` —— **backfill fts 表，让它和主表对齐**
4. `CREATE TRIGGER IF NOT EXISTS <main>_au AFTER UPDATE ON <main> ...` —— 最后才装触发器

顺序的核心是"装触发器之前 fts 表必须已经有所有现存主表 row 的镜像"，否则触发器第一次 fire 就 corrupt。

## 适用场景

- 任何 SQLite migration 设计（业务 app 的 schema 升级、Tauri 桌面 app 的 plugin-sql migration、Electron 的 better-sqlite3 migration）
- 全文检索功能里用 FTS5 contentless / external content shadow 模式建索引
- 复杂 migration 含 ALTER + CREATE + backfill + TRIGGER 多步组合，任意一步可能在测试 / 真机上失败重跑

不适用场景：纯 DML migration（只 INSERT/UPDATE 数据，无 schema 变化）—— transaction 回滚是可靠的；非 SQLite 数据库（Postgres 的 DDL 在 transaction 内基本可靠回滚，规则不一样）。

## 与其他规则的关联

- 同主题的另一面：worktree 共享 user data dir 时（见 `lessons/worktree-shared-user-data.md`），多 worktree 各自加 migration 的 user_version 号要协调，否则一个 worktree 跑过的 migration 让 user_version 累进，另一个 worktree 看不到，下次启动跳过该版本号撞 schema 不匹配。两条 lesson 一起看才完整。
- "破坏性操作必须先备份" 在 db 层的对应：DROP TABLE / RESET user_version 这种修复手段必须明确用户授权（frustration ≠ 授权），见 `~/.claude/rules/execution.md` 计划与执行段。
