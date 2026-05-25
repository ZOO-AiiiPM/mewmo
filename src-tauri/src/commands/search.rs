use rusqlite::params;
use serde::Serialize;
use tauri::State;

use crate::db::{tokenize, Db};

#[derive(Debug, Serialize)]
pub struct NoteHit {
    pub id: i64,
    pub title_html: String,
    pub snippet: String,
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
pub struct ClipHit {
    pub id: i64,
    pub title_html: String,
    pub site_name: String,
    pub author: String,
    pub snippet: String,
    pub saved_at: i64,
}

#[derive(Debug, Serialize)]
pub struct SearchResults {
    pub notes: Vec<NoteHit>,
    pub clips: Vec<ClipHit>,
}

/// 把 jieba 切出来的 token 用双引号包进 FTS5 短语 + 空格 join。
/// 多 token 间 FTS5 默认 AND 处理，所有 token 都得命中。
/// 双引号防止 token 含 FTS5 特殊字符（`*` `(` `)` 等）。
fn build_fts_query(query: &str) -> String {
    let tokens = tokenize(query);
    if tokens.trim().is_empty() {
        return String::new();
    }
    tokens
        .split_whitespace()
        .map(|t| format!("\"{}\"", t.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" ")
}

#[tauri::command]
pub fn search_all(db: State<Db>, query: String) -> Result<SearchResults, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(SearchResults {
            notes: vec![],
            clips: vec![],
        });
    }

    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let fts_q = build_fts_query(q);

    let notes = if fts_q.is_empty() {
        search_notes_like(&conn, q)?
    } else {
        let r = search_notes_fts(&conn, &fts_q)?;
        if r.is_empty() {
            search_notes_like(&conn, q)?
        } else {
            r
        }
    };

    let clips = if fts_q.is_empty() {
        search_clips_like(&conn, q)?
    } else {
        let r = search_clips_fts(&conn, &fts_q)?;
        if r.is_empty() {
            search_clips_like(&conn, q)?
        } else {
            r
        }
    };

    Ok(SearchResults { notes, clips })
}

// ── FTS5 路径 ──────────────────────────────────────────────────────────────

fn search_notes_fts(conn: &rusqlite::Connection, fts_q: &str) -> Result<Vec<NoteHit>, String> {
    // bm25 权重 title=5 / content_tokens=1，时间衰减 0.005/天
    // title 用 highlight() 取整段含 <mark>，content 用 snippet() 截 32 token 上下文
    let mut stmt = conn
        .prepare(
            "SELECT n.id, \
                    highlight(notes_fts, 0, '<mark>', '</mark>') AS title_html, \
                    snippet(notes_fts, 1, '<mark>', '</mark>', '...', 32) AS snippet, \
                    n.updated_at \
             FROM notes_fts JOIN notes n ON n.id = notes_fts.rowid \
             WHERE notes_fts MATCH ?1 \
             ORDER BY bm25(notes_fts, 5.0, 1.0) \
                    + (julianday('now') - julianday(n.updated_at, 'unixepoch')) * 0.005 \
             LIMIT 50",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![fts_q], |row| {
            Ok(NoteHit {
                id: row.get(0)?,
                title_html: row.get(1)?,
                snippet: row.get(2)?,
                updated_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn search_clips_fts(conn: &rusqlite::Connection, fts_q: &str) -> Result<Vec<ClipHit>, String> {
    // bm25 权重 title=5 / content_tokens=1 / site_name=2 / author=2
    let mut stmt = conn
        .prepare(
            "SELECT c.id, \
                    highlight(clips_fts, 0, '<mark>', '</mark>') AS title_html, \
                    c.site_name, c.author, \
                    snippet(clips_fts, 1, '<mark>', '</mark>', '...', 32) AS snippet, \
                    c.saved_at \
             FROM clips_fts JOIN clips c ON c.id = clips_fts.rowid \
             WHERE clips_fts MATCH ?1 \
             ORDER BY bm25(clips_fts, 5.0, 1.0, 2.0, 2.0) \
                    + (julianday('now') - julianday(c.saved_at, 'unixepoch')) * 0.005 \
             LIMIT 50",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![fts_q], |row| {
            Ok(ClipHit {
                id: row.get(0)?,
                title_html: row.get(1)?,
                site_name: row.get(2)?,
                author: row.get(3)?,
                snippet: row.get(4)?,
                saved_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

// ── LIKE fallback：FTS5 0 结果时兜底（jieba 词典外的新词、纯英文混入等）─────

fn search_notes_like(conn: &rusqlite::Connection, raw_q: &str) -> Result<Vec<NoteHit>, String> {
    let like_q = format!("%{}%", escape_like(raw_q));
    let mut stmt = conn
        .prepare(
            "SELECT id, title, substr(content_md, 1, 64) AS snippet, updated_at \
             FROM notes \
             WHERE title LIKE ?1 ESCAPE '\\' OR content_md LIKE ?1 ESCAPE '\\' \
             ORDER BY updated_at DESC LIMIT 50",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![like_q], |row| {
            let title: String = row.get(1)?;
            let snip: String = row.get(2)?;
            Ok(NoteHit {
                id: row.get(0)?,
                title_html: highlight_in(&title, raw_q),
                snippet: highlight_in(&snip, raw_q),
                updated_at: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

fn search_clips_like(conn: &rusqlite::Connection, raw_q: &str) -> Result<Vec<ClipHit>, String> {
    let like_q = format!("%{}%", escape_like(raw_q));
    let mut stmt = conn
        .prepare(
            "SELECT id, title, site_name, author, substr(content_md, 1, 64) AS snippet, saved_at \
             FROM clips \
             WHERE title LIKE ?1 ESCAPE '\\' OR content_md LIKE ?1 ESCAPE '\\' \
                OR site_name LIKE ?1 ESCAPE '\\' OR author LIKE ?1 ESCAPE '\\' \
             ORDER BY saved_at DESC LIMIT 50",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![like_q], |row| {
            let title: String = row.get(1)?;
            let snip: String = row.get(4)?;
            Ok(ClipHit {
                id: row.get(0)?,
                title_html: highlight_in(&title, raw_q),
                site_name: row.get(2)?,
                author: row.get(3)?,
                snippet: highlight_in(&snip, raw_q),
                saved_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

/// LIKE pattern 转义：% / _ / \ 都得加 \ 前缀（配合 SQL ESCAPE '\\'）
fn escape_like(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

/// LIKE fallback 路径手动给 snippet 加 <mark> 高亮（FTS5 snippet 在这里没法用）
fn highlight_in(text: &str, q: &str) -> String {
    if q.is_empty() {
        return text.to_string();
    }
    text.replace(q, &format!("<mark>{}</mark>", q))
}
