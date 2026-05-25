use std::collections::HashSet;
use std::path::Path;
use std::time::SystemTime;

use tauri::{Manager, State};

use crate::db::Db;

/// 保存附件到 {app_data_dir}/attachments/{uuid}.{ext}
/// 返回相对路径 "attachments/{uuid}.{ext}"，前端写入 markdown。
#[tauri::command]
pub fn save_attachment(
    app: tauri::AppHandle,
    ext: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let safe_ext = ext.trim_start_matches('.').to_lowercase();
    let allowed = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic"];
    if !allowed.contains(&safe_ext.as_str()) {
        return Err(format!("不支持的图片格式: {}", safe_ext));
    }

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("attachments");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let filename = format!("{}.{}", uuid::Uuid::new_v4(), safe_ext);
    let full_path = dir.join(&filename);
    std::fs::write(&full_path, &bytes).map_err(|e| e.to_string())?;

    Ok(format!("attachments/{}", filename))
}

/// 给前端用：返回 app_data_dir 的绝对路径，渲染时拼接相对路径再转成 webview URL。
#[tauri::command]
pub fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

/// 删除 attachments/ 下没被任何笔记引用的孤儿文件。
#[tauri::command]
pub fn cleanup_orphan_attachments(
    app: tauri::AppHandle,
    db: State<'_, Db>,
) -> Result<usize, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("attachments");

    if !dir.exists() {
        return Ok(0);
    }

    let referenced_files = referenced_attachment_files(&db)?;
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let mut deleted = 0usize;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if referenced_files.contains(name) {
            continue;
        }
        if modified_less_than_60_seconds_ago(&entry) {
            continue;
        }
        if trash::delete(&path).is_ok() {
            deleted += 1;
        }
    }

    Ok(deleted)
}

fn referenced_attachment_files(db: &Db) -> Result<HashSet<String>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT content_md FROM notes")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;

    let mut refs = HashSet::new();
    for text in rows.filter_map(Result::ok) {
        collect_attachment_refs(&text, &mut refs);
    }

    Ok(refs
        .into_iter()
        .filter_map(|p| {
            Path::new(&p)
                .file_name()
                .and_then(|n| n.to_str())
                .map(|s| s.to_string())
        })
        .collect())
}

fn collect_attachment_refs(text: &str, refs: &mut HashSet<String>) {
    const PREFIX: &str = "attachments/";
    let mut rest = text;

    while let Some(pos) = rest.find(PREFIX) {
        let matched = &rest[pos..];
        let mut end = 0usize;
        for (idx, ch) in matched.char_indices() {
            if idx < PREFIX.len() || ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-') {
                end = idx + ch.len_utf8();
            } else {
                break;
            }
        }
        if end > PREFIX.len() {
            refs.insert(matched[..end].to_string());
        }
        rest = &matched[end.max(PREFIX.len())..];
    }
}

fn modified_less_than_60_seconds_ago(entry: &std::fs::DirEntry) -> bool {
    entry
        .metadata()
        .and_then(|meta| meta.modified())
        .ok()
        .and_then(|modified| SystemTime::now().duration_since(modified).ok())
        .is_some_and(|elapsed| elapsed.as_secs() < 60)
}
