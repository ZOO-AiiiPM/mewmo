-- vibe.db v8: drop legacy notes / clips tables
-- spec 003-notes-clips-to-vault, T030
--
-- 数据已通过 Claude 一次性搬迁脚本（tmp/migrate-notes-clips-to-vault.py）搬到
-- <vault>/wiki/notes/*.md + <vault>/raw/clips/*.md，commands::notes/clips/search 切到 vault。
--
-- 现在 drop 老表：
-- 1. 释放磁盘空间（笔记/剪藏 markdown 重 vibe.db ~MB 级）
-- 2. 杜绝代码路径回退到 vibe.db notes/clips（commands 已切 vault，不再 SELECT 这两表）
--
-- ⚠️ 不可逆操作。Claude 在跑 v8 前已手工备份 vibe.db.pre-spec003-<ts>。
-- 用户 dogfood 期反悔路径：重命名 backup 回 vibe.db + 删 vault wiki/notes + raw/clips + 删 vault-meta.db migrated 标记 + git revert spec 003 commits。

DROP TABLE IF EXISTS notes_fts;
DROP TABLE IF EXISTS clips_fts;
DROP TABLE IF EXISTS notes;
DROP TABLE IF EXISTS clips;

