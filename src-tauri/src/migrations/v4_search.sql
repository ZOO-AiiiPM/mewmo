-- v4: jieba 中文分词 + FTS5 全文搜索
-- 实现路径：应用层 jieba 切词 → 存进 content_tokens 派生字段 → FTS5 用 unicode61 按空格切
-- 等效 jieba tokenizer，无 unsafe Rust 注册成本
-- backfill 在 db.rs migration 完成后由 Rust 代码调 jieba 跑（SQL 内不能调 jieba）

-- 注意：notes / clips 的 content_tokens 列由 db.rs idempotent ALTER 处理（容忍列已存在）。
-- 这个 SQL 文件假设列已就绪。

-- FTS5 虚表（contentless shadow，节约空间）
-- title 不切词（unicode61 按字 token，短词如 'AI' 'iOS' 直接命中）
-- content_tokens 已被 jieba 空格分割，unicode61 按空格切回原 jieba token
CREATE VIRTUAL TABLE notes_fts USING fts5(
  title, content_tokens,
  content='notes', content_rowid='id',
  tokenize='unicode61 remove_diacritics 0'
);

CREATE VIRTUAL TABLE clips_fts USING fts5(
  title, content_tokens, site_name, author,
  content='clips', content_rowid='id',
  tokenize='unicode61 remove_diacritics 0'
);

-- backfill fts 表：把 notes / clips 现有行写进 fts，让后续 UPDATE 触发器
-- 的 'delete' 命令能找到对应 row（否则触发器删一个不存在的 row 会让 fts 索引 corrupt）
-- content_tokens 此时是空字符串，db.rs 的 backfill_tokens 跑 jieba 后会通过 UPDATE 触发器同步进来
INSERT INTO notes_fts(rowid, title, content_tokens)
  SELECT id, title, content_tokens FROM notes;
INSERT INTO clips_fts(rowid, title, content_tokens, site_name, author)
  SELECT id, title, content_tokens, site_name, author FROM clips;

-- notes 同步触发器（限定列！避免索引损坏）
CREATE TRIGGER notes_fts_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, content_tokens)
  VALUES (new.id, new.title, new.content_tokens);
END;

CREATE TRIGGER notes_fts_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content_tokens)
  VALUES('delete', old.id, old.title, old.content_tokens);
END;

CREATE TRIGGER notes_fts_au AFTER UPDATE OF title, content_tokens ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content_tokens)
  VALUES('delete', old.id, old.title, old.content_tokens);
  INSERT INTO notes_fts(rowid, title, content_tokens)
  VALUES (new.id, new.title, new.content_tokens);
END;

-- clips 同步触发器（4 字段）
CREATE TRIGGER clips_fts_ai AFTER INSERT ON clips BEGIN
  INSERT INTO clips_fts(rowid, title, content_tokens, site_name, author)
  VALUES (new.id, new.title, new.content_tokens, new.site_name, new.author);
END;

CREATE TRIGGER clips_fts_ad AFTER DELETE ON clips BEGIN
  INSERT INTO clips_fts(clips_fts, rowid, title, content_tokens, site_name, author)
  VALUES('delete', old.id, old.title, old.content_tokens, old.site_name, old.author);
END;

CREATE TRIGGER clips_fts_au AFTER UPDATE OF title, content_tokens, site_name, author ON clips BEGIN
  INSERT INTO clips_fts(clips_fts, rowid, title, content_tokens, site_name, author)
  VALUES('delete', old.id, old.title, old.content_tokens, old.site_name, old.author);
  INSERT INTO clips_fts(rowid, title, content_tokens, site_name, author)
  VALUES (new.id, new.title, new.content_tokens, new.site_name, new.author);
END;
