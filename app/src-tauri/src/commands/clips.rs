use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;

#[derive(Debug, Serialize, Deserialize)]
pub struct Clip {
    pub id: i64,
    pub url: String,
    pub title: String,
    pub content_md: String,
    pub excerpt: String,
    pub site_name: String,
    pub favicon_url: String,
    pub cover_image: String,
    pub author: String,
    pub published_at: String,
    pub ip_region: String,
    pub tags_text: String,
    pub saved_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct ClipInput {
    pub url: String,
    pub title: String,
    pub content_md: String,
    pub excerpt: String,
    pub site_name: String,
    pub favicon_url: String,
    pub cover_image: String,
    pub author: String,
    pub published_at: String,
    pub ip_region: String,
}

#[tauri::command]
pub fn list_clips(db: State<Db>) -> Result<Vec<Clip>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, url, title, content_md, excerpt, site_name, favicon_url, \
                    cover_image, author, published_at, ip_region, '' AS tags_text, saved_at \
             FROM clips ORDER BY saved_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Clip {
                id: row.get(0)?,
                url: row.get(1)?,
                title: row.get(2)?,
                content_md: row.get(3)?,
                excerpt: row.get(4)?,
                site_name: row.get(5)?,
                favicon_url: row.get(6)?,
                cover_image: row.get(7)?,
                author: row.get(8)?,
                published_at: row.get(9)?,
                ip_region: row.get(10)?,
                tags_text: row.get(11)?,
                saved_at: row.get(12)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_clip(db: State<Db>, clip: ClipInput) -> Result<i64, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let tokens = crate::db::tokenize(&clip.content_md);
    conn.execute(
        "INSERT INTO clips (url, title, content_md, content_tokens, excerpt, site_name, favicon_url, \
                            cover_image, author, published_at, ip_region) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![
            clip.url, clip.title, clip.content_md, tokens, clip.excerpt,
            clip.site_name, clip.favicon_url, clip.cover_image,
            clip.author, clip.published_at, clip.ip_region
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn update_clip(db: State<Db>, id: i64, patch: ClipInput) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let tokens = crate::db::tokenize(&patch.content_md);
    conn.execute(
        "UPDATE clips SET url=?, title=?, content_md=?, content_tokens=?, excerpt=?, site_name=?, \
                          favicon_url=?, cover_image=?, author=?, published_at=?, ip_region=? \
         WHERE id=?",
        params![
            patch.url, patch.title, patch.content_md, tokens, patch.excerpt,
            patch.site_name, patch.favicon_url, patch.cover_image,
            patch.author, patch.published_at, patch.ip_region, id
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_clip(db: State<Db>, id: i64) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM clips WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
