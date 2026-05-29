//! Vault search: FTS5 over vault markdown
//!
//! spec 003-notes-clips-to-vault, T007
//!
//! 责任：
//! - `build_index(vault, meta_db)`: 一次性扫所有 vault markdown 重建 FTS5 表（启动自愈用 + 全 reindex）
//! - `index_one_note` / `index_one_clip`: 增量索引一条（commands::notes/clips 写入后调用，避免依赖 watcher）
//! - `delete_index_*`: 删除条目从 FTS
//! - `search(meta_db, query) -> Vec<SearchHit>`: FTS5 查询（中英混合分词走 db::tokenize）
//!
//! 性能门槛：1k 篇规模 P95 ≤ 200ms（spec 003 SC-005）
//!
//! ⚠️ Watcher 增量更新（外部编辑场景）留 spec 004——本 spec 仅在 mewmo 内部写入时同步更新 FTS，
//! 用户在 Obsidian 改 .md 后重启 mewmo 时 `init_or_heal` 会扫一次保证一致。

use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection};
use serde::Serialize;

use super::query;

#[derive(Debug, Serialize, Clone)]
pub struct SearchHit {
    pub kind: String, // "note" | "clip"
    pub slug: String,
    pub title: String,
    pub snippet: String,
    pub url: Option<String>, // 仅剪藏有
    pub mtime: u64,
}

#[derive(Debug)]
pub enum SearchError {
    Db(rusqlite::Error),
    Io(super::io::IoError),
    Lock(String),
}

impl From<rusqlite::Error> for SearchError {
    fn from(e: rusqlite::Error) -> Self {
        SearchError::Db(e)
    }
}

impl From<super::io::IoError> for SearchError {
    fn from(e: super::io::IoError) -> Self {
        SearchError::Io(e)
    }
}

impl std::fmt::Display for SearchError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SearchError::Db(e) => write!(f, "DB_ERROR: {}", e),
            SearchError::Io(e) => write!(f, "{}", e),
            SearchError::Lock(s) => write!(f, "LOCK_ERROR: {}", s),
        }
    }
}

impl std::error::Error for SearchError {}

// ============================================================================
// Index maintenance
// ============================================================================

/// 全量重建 FTS5（启动自愈 + reindex）
///
/// 1. 清空 notes_fts / clips_fts / indexed_files
/// 2. 扫 `<vault>/wiki/notes/*.md` + `<vault>/raw/clips/*.md`
/// 3. 把每条 INSERT 进 FTS5 + indexed_files
pub async fn build_index(
    vault: &Path,
    meta_conn: &Mutex<Connection>,
) -> Result<(usize, usize), SearchError> {
    // 1. 清空（在锁内）
    {
        let conn = meta_conn
            .lock()
            .map_err(|e| SearchError::Lock(format!("meta_db poisoned: {e}")))?;
        conn.execute("DELETE FROM notes_fts", [])?;
        conn.execute("DELETE FROM clips_fts", [])?;
        conn.execute("DELETE FROM indexed_files", [])?;
    }

    // 2. 扫笔记
    let notes = query::list_notes(vault).await?;
    let mut note_count = 0;
    for summary in &notes {
        // HTML 笔记暂不进 FTS（HTML 标签直接喂 jieba 会污染索引；后续 spec 单独处理剥标签）
        if summary.format == "html" {
            continue;
        }
        let full = query::get_note(vault, &summary.slug).await?;
        index_note_in_conn(meta_conn, &full)?;
        note_count += 1;
    }

    // 3. 扫剪藏
    let clips = query::list_clips(vault).await?;
    let mut clip_count = 0;
    for summary in &clips {
        let full = query::get_clip(vault, &summary.slug).await?;
        index_clip_in_conn(meta_conn, &full)?;
        clip_count += 1;
    }

    log::info!(
        "vault::search::build_index: {} notes + {} clips indexed",
        note_count,
        clip_count
    );
    Ok((note_count, clip_count))
}

/// 增量索引一条笔记（commands::notes::create_note / update_note 写入后调）
pub fn index_one_note(
    meta_conn: &Mutex<Connection>,
    note: &query::NoteFull,
) -> Result<(), SearchError> {
    index_note_in_conn(meta_conn, note)
}

/// 增量索引一条剪藏
pub fn index_one_clip(
    meta_conn: &Mutex<Connection>,
    clip: &query::ClipFull,
) -> Result<(), SearchError> {
    index_clip_in_conn(meta_conn, clip)
}

/// 从 FTS 删除一条笔记
pub fn delete_index_note(
    meta_conn: &Mutex<Connection>,
    slug: &str,
) -> Result<(), SearchError> {
    let conn = meta_conn
        .lock()
        .map_err(|e| SearchError::Lock(format!("meta_db poisoned: {e}")))?;
    conn.execute("DELETE FROM notes_fts WHERE slug = ?1", params![slug])?;
    conn.execute(
        "DELETE FROM indexed_files WHERE slug = ?1 AND type = 'note'",
        params![slug],
    )?;
    Ok(())
}

/// 从 FTS 删除一条剪藏
pub fn delete_index_clip(
    meta_conn: &Mutex<Connection>,
    slug: &str,
) -> Result<(), SearchError> {
    let conn = meta_conn
        .lock()
        .map_err(|e| SearchError::Lock(format!("meta_db poisoned: {e}")))?;
    conn.execute("DELETE FROM clips_fts WHERE slug = ?1", params![slug])?;
    conn.execute(
        "DELETE FROM indexed_files WHERE slug = ?1 AND type = 'clip'",
        params![slug],
    )?;
    Ok(())
}

fn index_note_in_conn(
    meta_conn: &Mutex<Connection>,
    note: &query::NoteFull,
) -> Result<(), SearchError> {
    let conn = meta_conn
        .lock()
        .map_err(|e| SearchError::Lock(format!("meta_db poisoned: {e}")))?;
    // 用 jieba 切词 + 空格 join，FTS5 unicode61 按空格切回（沿用 mewmo db::tokenize 模式）
    let body_tokens = crate::db::tokenize(&note.body);
    let title_tokens = crate::db::tokenize(&note.title);
    let tags_joined = note.tags.join(" ");
    // FTS5 不支持 INSERT OR REPLACE，先 DELETE 再 INSERT
    conn.execute("DELETE FROM notes_fts WHERE slug = ?1", params![note.slug])?;
    conn.execute(
        "INSERT INTO notes_fts (slug, title, body, tags) VALUES (?1, ?2, ?3, ?4)",
        params![note.slug, title_tokens, body_tokens, tags_joined],
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO indexed_files (slug, type, mtime, indexed_at) VALUES (?1, 'note', ?2, unixepoch())",
        params![note.slug, note.mtime as i64],
    )?;
    Ok(())
}

fn index_clip_in_conn(
    meta_conn: &Mutex<Connection>,
    clip: &query::ClipFull,
) -> Result<(), SearchError> {
    let conn = meta_conn
        .lock()
        .map_err(|e| SearchError::Lock(format!("meta_db poisoned: {e}")))?;
    let body_tokens = crate::db::tokenize(&clip.body);
    let title_tokens = crate::db::tokenize(&clip.title);
    let tags_joined = clip.tags.join(" ");
    conn.execute("DELETE FROM clips_fts WHERE slug = ?1", params![clip.slug])?;
    conn.execute(
        "INSERT INTO clips_fts (slug, url, title, body, tags) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            clip.slug,
            clip.url,
            title_tokens,
            body_tokens,
            tags_joined
        ],
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO indexed_files (slug, type, mtime, indexed_at) VALUES (?1, 'clip', ?2, unixepoch())",
        params![clip.slug, clip.mtime as i64],
    )?;
    Ok(())
}

// ============================================================================
// Search query
// ============================================================================

/// 全文搜索笔记 + 剪藏
///
/// 中英混合：用户输入走 `db::tokenize` 切词后用空格 + AND 连接（FTS5 默认 AND 语义）。
/// 返回按 mtime 倒序混合 hit list。
pub fn search(
    vault: &Path,
    meta_conn: &Mutex<Connection>,
    query_text: &str,
    limit: usize,
) -> Result<Vec<SearchHit>, SearchError> {
    let tokens = crate::db::tokenize(query_text);
    if tokens.trim().is_empty() {
        return Ok(Vec::new());
    }
    // 把 tokens 转成 FTS5 query：每 token 加引号 + AND
    let fts_query: String = tokens
        .split_whitespace()
        .map(|t| format!("\"{}\"", t.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" AND ");

    let conn = meta_conn
        .lock()
        .map_err(|e| SearchError::Lock(format!("meta_db poisoned: {e}")))?;

    let mut hits = Vec::new();

    // 笔记
    let mut stmt = conn.prepare(
        "SELECT n.slug, snippet(notes_fts, 2, '<mark>', '</mark>', '...', 32), \
                COALESCE(i.mtime, 0) \
         FROM notes_fts n \
         LEFT JOIN indexed_files i ON i.slug = n.slug AND i.type = 'note' \
         WHERE notes_fts MATCH ?1 \
         ORDER BY i.mtime DESC \
         LIMIT ?2",
    )?;
    let note_rows = stmt.query_map(params![&fts_query, limit as i64], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?))
    })?;
    for r in note_rows {
        let (slug, snippet, mtime) = r?;
        // 拿 title from vault file（snippet 列是 body 截出来的，title 单独读）
        // 简化：直接从 indexed slug 读 vault；list_notes 已经按 mtime 排序，性能 OK 在 1k 规模
        let path_rel = format!("wiki/notes/{}.md", slug);
        let display_title = read_title_or_slug(vault, &path_rel, &slug);
        hits.push(SearchHit {
            kind: "note".to_string(),
            slug,
            title: display_title,
            snippet,
            url: None,
            mtime: mtime as u64,
        });
    }
    drop(stmt);

    // 剪藏
    let mut stmt = conn.prepare(
        "SELECT c.slug, c.url, snippet(clips_fts, 3, '<mark>', '</mark>', '...', 32), \
                COALESCE(i.mtime, 0) \
         FROM clips_fts c \
         LEFT JOIN indexed_files i ON i.slug = c.slug AND i.type = 'clip' \
         WHERE clips_fts MATCH ?1 \
         ORDER BY i.mtime DESC \
         LIMIT ?2",
    )?;
    let clip_rows = stmt.query_map(params![&fts_query, limit as i64], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, i64>(3)?,
        ))
    })?;
    for r in clip_rows {
        let (slug, url, snippet, mtime) = r?;
        let path_rel = format!("raw/clips/{}.md", slug);
        let display_title = read_title_or_slug(vault, &path_rel, &slug);
        hits.push(SearchHit {
            kind: "clip".to_string(),
            slug,
            title: display_title,
            snippet,
            url: Some(url),
            mtime: mtime as u64,
        });
    }

    // 笔记 + 剪藏 hit 按 mtime 倒序合并
    hits.sort_by(|a, b| b.mtime.cmp(&a.mtime));
    hits.truncate(limit);
    Ok(hits)
}

/// 同步读 markdown 文件取 frontmatter title 或 H1（fallback slug）
fn read_title_or_slug(vault: &Path, relative: &str, slug: &str) -> String {
    let path = vault.join(relative);
    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return slug.to_string(),
    };
    let parsed = super::frontmatter::parse(&content);
    if let Some(fm) = &parsed.frontmatter {
        if let Some(title) = fm.extra.get("title").and_then(|v| v.as_str()) {
            return title.to_string();
        }
    }
    for line in parsed.body.lines() {
        let t = line.trim_start();
        if let Some(rest) = t.strip_prefix("# ") {
            return rest.trim().to_string();
        }
    }
    slug.to_string()
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::super::ingest::{self, ClipMeta};
    use super::super::meta_db;
    use super::*;

    fn temp_vault() -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let pid = std::process::id();
        let path = std::env::temp_dir().join(format!("mewmo-search-test-{}-{}", pid, nanos));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[tokio::test]
    async fn test_build_index_full_rebuild() {
        let vault = temp_vault();
        let db = meta_db::init(&vault).unwrap();
        ingest::write_note(&vault, "AI 笔记", "关于人工智能的内容", &[], None)
            .await
            .unwrap();
        ingest::write_note(&vault, "另一篇", "无关内容", &[], None)
            .await
            .unwrap();
        let meta = ClipMeta {
            url: "https://example.com".to_string(),
            ..Default::default()
        };
        ingest::write_clip(&vault, "剪藏标题", "AI 相关网页", &[], &meta)
            .await
            .unwrap();
        let (note_n, clip_n) = build_index(&vault, &db.conn).await.unwrap();
        assert_eq!(note_n, 2);
        assert_eq!(clip_n, 1);
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_search_chinese_query() {
        let vault = temp_vault();
        let db = meta_db::init(&vault).unwrap();
        ingest::write_note(&vault, "AI 笔记", "关于人工智能和机器学习的笔记", &[], None)
            .await
            .unwrap();
        ingest::write_note(&vault, "做饭日记", "今天做了番茄炒蛋", &[], None)
            .await
            .unwrap();
        build_index(&vault, &db.conn).await.unwrap();
        let hits = search(&vault, &db.conn, "人工智能", 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].kind, "note");
        assert!(hits[0].title.contains("AI 笔记"));
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_search_english_query() {
        let vault = temp_vault();
        let db = meta_db::init(&vault).unwrap();
        ingest::write_note(&vault, "rust", "rust ownership and borrowing", &[], None)
            .await
            .unwrap();
        ingest::write_note(&vault, "python", "python decorators", &[], None)
            .await
            .unwrap();
        build_index(&vault, &db.conn).await.unwrap();
        let hits = search(&vault, &db.conn, "ownership", 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert!(hits[0].title.contains("rust"));
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_search_mixed_chinese_english() {
        let vault = temp_vault();
        let db = meta_db::init(&vault).unwrap();
        ingest::write_note(
            &vault,
            "OpenAI 介绍",
            "OpenAI 是一家做 AI 的公司",
            &[],
            None,
        )
        .await
        .unwrap();
        build_index(&vault, &db.conn).await.unwrap();
        let hits = search(&vault, &db.conn, "OpenAI", 10).unwrap();
        assert_eq!(hits.len(), 1);
        let hits = search(&vault, &db.conn, "AI", 10).unwrap();
        assert_eq!(hits.len(), 1);
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_index_one_note_after_build() {
        // 模拟 commands::notes::create_note 流程：写 vault + 增量 index
        let vault = temp_vault();
        let db = meta_db::init(&vault).unwrap();
        // 初始空 index
        build_index(&vault, &db.conn).await.unwrap();
        // 写一条新笔记
        let r = ingest::write_note(&vault, "新增笔记", "新增内容", &[], None)
            .await
            .unwrap();
        // 增量 index
        let full = query::get_note(&vault, &r.slug).await.unwrap();
        index_one_note(&db.conn, &full).unwrap();
        // 搜索应找到
        let hits = search(&vault, &db.conn, "新增", 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].slug, r.slug);
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_delete_index_note_removes_from_search() {
        let vault = temp_vault();
        let db = meta_db::init(&vault).unwrap();
        let r = ingest::write_note(&vault, "待删", "待删内容", &[], None)
            .await
            .unwrap();
        build_index(&vault, &db.conn).await.unwrap();
        // 删除索引
        delete_index_note(&db.conn, &r.slug).unwrap();
        let hits = search(&vault, &db.conn, "待删", 10).unwrap();
        assert_eq!(hits.len(), 0);
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_search_empty_query_returns_empty() {
        let vault = temp_vault();
        let db = meta_db::init(&vault).unwrap();
        ingest::write_note(&vault, "笔记", "内容", &[], None)
            .await
            .unwrap();
        build_index(&vault, &db.conn).await.unwrap();
        let hits = search(&vault, &db.conn, "", 10).unwrap();
        assert_eq!(hits.len(), 0);
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_search_note_and_clip_both_match() {
        let vault = temp_vault();
        let db = meta_db::init(&vault).unwrap();
        ingest::write_note(&vault, "AI 笔记", "AI 内容", &[], None)
            .await
            .unwrap();
        let meta = ClipMeta {
            url: "https://example.com/ai".to_string(),
            ..Default::default()
        };
        ingest::write_clip(&vault, "AI 剪藏", "AI 网页内容", &[], &meta)
            .await
            .unwrap();
        build_index(&vault, &db.conn).await.unwrap();
        let hits = search(&vault, &db.conn, "AI", 10).unwrap();
        assert_eq!(hits.len(), 2);
        // 至少有一条 kind=note 和一条 kind=clip
        assert!(hits.iter().any(|h| h.kind == "note"));
        assert!(hits.iter().any(|h| h.kind == "clip"));
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_search_perf_1k_under_200ms() {
        // SC-005：1k 篇规模搜索 P95 ≤ 200ms
        let vault = temp_vault();
        let db = meta_db::init(&vault).unwrap();
        for i in 0..1000 {
            ingest::write_note(
                &vault,
                &format!("笔记{}", i),
                &format!("内容 {} 中文混合 english body", i),
                &[],
                None,
            )
            .await
            .unwrap();
        }
        build_index(&vault, &db.conn).await.unwrap();
        let start = std::time::Instant::now();
        let hits = search(&vault, &db.conn, "中文", 20).unwrap();
        let elapsed = start.elapsed();
        assert!(!hits.is_empty());
        assert!(
            elapsed.as_millis() < 200,
            "search 1k 篇耗时 {} ms 应 < 200ms",
            elapsed.as_millis()
        );
        std::fs::remove_dir_all(&vault).ok();
    }
}
