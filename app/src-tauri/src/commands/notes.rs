use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::db::Db;

#[derive(Debug, Serialize, Deserialize)]
pub struct Note {
    pub id: i64,
    pub title: String,
    pub content_md: String,
    pub tags_text: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
pub struct NotePatch {
    pub title: Option<String>,
    pub content_md: Option<String>,
}

#[tauri::command]
pub fn list_notes(db: State<Db>) -> Result<Vec<Note>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, title, content_md, '' AS tags_text, created_at, updated_at \
             FROM notes ORDER BY updated_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Note {
                id: row.get(0)?,
                title: row.get(1)?,
                content_md: row.get(2)?,
                tags_text: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_note(db: State<Db>) -> Result<i64, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("INSERT INTO notes (title, content_md) VALUES ('', '')", [])
        .map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn update_note(db: State<Db>, id: i64, patch: NotePatch) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let result = match (patch.title, patch.content_md) {
        (Some(t), Some(c)) => {
            let tokens = crate::db::tokenize(&c);
            conn.execute(
                "UPDATE notes SET title = ?, content_md = ?, content_tokens = ?, updated_at = unixepoch() WHERE id = ?",
                params![t, c, tokens, id],
            )
        }
        (Some(t), None) => conn.execute(
            "UPDATE notes SET title = ?, updated_at = unixepoch() WHERE id = ?",
            params![t, id],
        ),
        (None, Some(c)) => {
            let tokens = crate::db::tokenize(&c);
            conn.execute(
                "UPDATE notes SET content_md = ?, content_tokens = ?, updated_at = unixepoch() WHERE id = ?",
                params![c, tokens, id],
            )
        }
        (None, None) => return Ok(()),
    };
    result.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_note(db: State<Db>, id: i64) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM notes WHERE id = ?", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
