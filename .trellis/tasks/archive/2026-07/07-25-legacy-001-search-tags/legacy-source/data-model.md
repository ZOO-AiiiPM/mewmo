# Data Model: 全局搜索 + 标签管理

## Entities

### Note（笔记，扩展现有表）

| 字段 | 类型 | 备注 |
|---|---|---|
| id | INTEGER PK | |
| title | TEXT NOT NULL DEFAULT '' | |
| content_md | TEXT NOT NULL DEFAULT '' | Markdown 正文 |
| **tags_text** | **TEXT NOT NULL DEFAULT ''** | **新增**：派生字段，由 note_tags 触发器同步，FTS5 索引这列 |
| created_at | INTEGER | unixepoch |
| updated_at | INTEGER | unixepoch |

### Clip（剪藏，扩展现有表）

| 字段 | 类型 | 备注 |
|---|---|---|
| id | INTEGER PK | |
| url, title, content_md | TEXT | |
| excerpt, site_name, favicon_url | TEXT | |
| author, published_at | TEXT | |
| cover_image | TEXT | |
| **tags_text** | **TEXT NOT NULL DEFAULT ''** | **新增**：同 Note |
| saved_at | INTEGER | unixepoch |

### Tag（新）

| 字段 | 类型 | 备注 |
|---|---|---|
| id | INTEGER PK | |
| name | TEXT NOT NULL UNIQUE | 1-50 字符（应用层校验）|
| created_at | INTEGER NOT NULL DEFAULT (unixepoch()) | |

### NoteTag / ClipTag（新，多对多关联）

```sql
CREATE TABLE note_tags (
  note_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (note_id, tag_id),
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE clip_tags (
  clip_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (clip_id, tag_id),
  FOREIGN KEY (clip_id) REFERENCES clips(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX idx_note_tags_tag ON note_tags(tag_id);
CREATE INDEX idx_clip_tags_tag ON clip_tags(tag_id);
```

注：`PRAGMA foreign_keys = ON` 必须在每次连接打开后手动启用。

## FTS5 虚表（contentless shadow 模式）

```sql
CREATE VIRTUAL TABLE notes_fts USING fts5(
  title, content_md, tags_text,
  content='notes', content_rowid='id', tokenize='jieba'
);

CREATE VIRTUAL TABLE clips_fts USING fts5(
  title, content_md, tags_text, site_name, author,
  content='clips', content_rowid='id', tokenize='jieba'
);
```

`content='notes' content_rowid='id'` = contentless shadow：FTS5 不复制原文副本，只存索引和 rowid，节省一半磁盘。

## 触发器

### FTS5 同步（限定列！）

```sql
-- notes_fts
CREATE TRIGGER notes_fts_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, content_md, tags_text)
  VALUES (new.id, new.title, new.content_md, new.tags_text);
END;

CREATE TRIGGER notes_fts_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content_md, tags_text)
  VALUES('delete', old.id, old.title, old.content_md, old.tags_text);
END;

-- ⚠ 关键：只监听 title / content_md / tags_text 三列，不监听全列！
-- knowledge-base v5→v6 修过这个 bug：监听全列会让 word_count 等更新触发 FTS 反复 DELETE+INSERT 损坏索引
CREATE TRIGGER notes_fts_au AFTER UPDATE OF title, content_md, tags_text ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content_md, tags_text)
  VALUES('delete', old.id, old.title, old.content_md, old.tags_text);
  INSERT INTO notes_fts(rowid, title, content_md, tags_text)
  VALUES (new.id, new.title, new.content_md, new.tags_text);
END;

-- clips_fts 同模式 5 个字段
```

### tags_text 派生字段同步

```sql
-- 当 note_tags 增删时，重算关联笔记的 tags_text
-- 触发链：note_tags 改 → notes.tags_text 重算 → 触发 notes_fts_au → notes_fts 同步
CREATE TRIGGER note_tags_text_sync_ai AFTER INSERT ON note_tags BEGIN
  UPDATE notes SET tags_text = (
    SELECT IFNULL(GROUP_CONCAT(t.name, ' '), '')
    FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
    WHERE nt.note_id = NEW.note_id
  ) WHERE id = NEW.note_id;
END;

CREATE TRIGGER note_tags_text_sync_ad AFTER DELETE ON note_tags BEGIN
  UPDATE notes SET tags_text = (
    SELECT IFNULL(GROUP_CONCAT(t.name, ' '), '')
    FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
    WHERE nt.note_id = OLD.note_id
  ) WHERE id = OLD.note_id;
END;

-- clip_tags 同模式 2 个触发器
```

### 标签改名手动同步（不在触发器里）

`rename_tag(old, new)` command 内部：

```sql
BEGIN;
UPDATE tags SET name = ? WHERE name = ?;
-- 必须手动 UPDATE，因为触发器只在 note_tags / clip_tags 增删时触发，tag rename 不动 note_tags
UPDATE notes SET tags_text = (...重算...) WHERE id IN (SELECT note_id FROM note_tags WHERE tag_id = ?);
UPDATE clips SET tags_text = (...重算...) WHERE id IN (SELECT clip_id FROM clip_tags WHERE tag_id = ?);
COMMIT;
```

## State Transitions

| 操作 | 触发链 |
|---|---|
| 改笔记标题 | UPDATE notes → notes_fts_au → notes_fts 重新索引 |
| 给笔记加标签 | INSERT note_tags → note_tags_text_sync_ai → UPDATE notes.tags_text → notes_fts_au → 重新索引 |
| 删除笔记 | DELETE notes → notes_fts_ad（删 FTS 索引）+ CASCADE 删 note_tags（不再触发 sync 因 notes 已删）|
| 删除标签 | DELETE tags → CASCADE 删 note_tags / clip_tags → note_tags_text_sync_ad → 重算所有受影响 notes/clips 的 tags_text → notes_fts_au / clips_fts_au |
| 改标签名 | rename_tag command（手动事务）|

## 验证规则

- `tags.name` 长度 1-50 字符（应用层校验，不在 SQL 约束里 —— 用 `set_note_tags` / `rename_tag` command 时 validate）
- `tags.name` 不能含空格（用空格做 tags_text 分隔符 —— 应用层校验）
- 每条笔记 / 剪藏挂的标签数 ≤ 20（应用层 soft limit，DB 不强约束）
- `note_id` / `clip_id` / `tag_id` 必须存在（FK 约束）

## 数据规模与性能

| 维度 | v1 上限 | v1 估算 |
|---|---|---|
| Notes | 万级（≤ 50,000） | < 100 |
| Clips | 千级（≤ 5,000） | < 100 |
| Tags | 百级（≤ 500） | < 50 |
| note_tags / clip_tags 总行数 | 万级 | < 1,000 |
| FTS5 索引膨胀比 | ~1.5-2x（jieba 词级 token，比 trigram 节省）| 同 |
| backfill 时间 | < 3s（万级笔记 jieba 分词 + FTS5 写入）| < 100ms |
