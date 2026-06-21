//! Knowledge Base Tauri commands — filesystem-based KB/folder/note CRUD
//!
//! KB content lives in `vault/library/<dir_name>/`.
//! Display metadata (color, position, description) stored in vault-meta.db `knowledge_bases` table.

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::params;
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::vault::{init, meta_db::VaultMetaDb, slug};

// ─── Structs ────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct KnowledgeBase {
    pub dir_name: String,
    pub name: String,
    pub color: String,
    pub description: String,
    pub position: i32,
    pub note_count: usize,
    pub updated_at: u64,
}

#[derive(Debug, Serialize)]
pub struct KbFolderEntry {
    pub name: String,
    pub path: String,
    pub count: usize,
}

#[derive(Debug, Serialize)]
pub struct KbNoteEntry {
    pub slug: String,
    pub title: String,
    pub preview: String,
    pub tags: Vec<String>,
    pub updated_at: u64,
}

#[derive(Debug, Serialize)]
pub struct KbContents {
    pub folders: Vec<KbFolderEntry>,
    pub notes: Vec<KbNoteEntry>,
}

// ─── Helpers ────────────────────────────────────────────────────────────────

fn require_vault() -> Result<PathBuf, String> {
    let cfg = init::read_config()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "VAULT_NOT_CONFIGURED".to_string())?;
    Ok(PathBuf::from(&cfg.vault_path))
}

fn library_dir() -> Result<PathBuf, String> {
    let vault = require_vault()?;
    let lib = vault.join("library");
    fs::create_dir_all(&lib).map_err(|e| format!("create library dir: {e}"))?;
    Ok(lib)
}

/// Count .md and .html files recursively inside a directory
fn count_notes_recursive(dir: &PathBuf) -> usize {
    let mut count = 0;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                count += count_notes_recursive(&path);
            } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if ext == "md" || ext == "html" {
                    count += 1;
                }
            }
        }
    }
    count
}

fn latest_mtime_recursive(dir: &PathBuf) -> u64 {
    let mut latest = file_mtime_secs(dir);
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let mtime = if path.is_dir() {
                latest_mtime_recursive(&path)
            } else {
                file_mtime_secs(&path)
            };
            latest = latest.max(mtime);
        }
    }
    latest
}

/// Extract title from frontmatter or fall back to filename stem
fn extract_title(path: &PathBuf) -> String {
    if let Ok(content) = fs::read_to_string(path) {
        if content.starts_with("---") {
            // Simple frontmatter title extraction
            for line in content.lines().skip(1) {
                if line.trim() == "---" {
                    break;
                }
                if let Some(rest) = line.strip_prefix("title:") {
                    let title = rest.trim().trim_matches('"').trim_matches('\'');
                    if !title.is_empty() {
                        return title.to_string();
                    }
                }
            }
        }
    }
    // Fallback: stem with dashes replaced by spaces
    path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("untitled")
        .replace('-', " ")
}

fn extract_tags(path: &PathBuf) -> Vec<String> {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    if !content.starts_with("---") {
        return Vec::new();
    }
    for line in content.lines().skip(1) {
        let trimmed = line.trim();
        if trimmed == "---" {
            break;
        }
        if let Some(rest) = trimmed.strip_prefix("tags:") {
            let value = rest.trim();
            if value == "[]" || value.is_empty() {
                return Vec::new();
            }
            if value.starts_with('[') && value.ends_with(']') {
                return value
                    .trim_matches(['[', ']'])
                    .split(',')
                    .map(|s| s.trim().trim_matches('"').trim_matches('\'').to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
            }
        }
    }
    Vec::new()
}

/// Extract first ~120 chars of body (after frontmatter) as preview
fn extract_preview(path: &PathBuf) -> String {
    let content = match fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return String::new(),
    };

    let body = if content.starts_with("---") {
        // Skip frontmatter
        if let Some(end) = content[3..].find("\n---") {
            &content[3 + end + 4..]
        } else {
            &content
        }
    } else {
        &content
    };

    body.trim()
        .lines()
        .filter(|l| !l.starts_with('#'))
        .take(3)
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(120)
        .collect()
}

/// Get file mtime as unix timestamp seconds
fn file_mtime_secs(path: &PathBuf) -> u64 {
    path.metadata()
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

// ─── Commands ───────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn kb_list(meta: State<'_, VaultMetaDb>) -> Result<Vec<KnowledgeBase>, String> {
    let lib = library_dir()?;

    let mut kbs: Vec<KnowledgeBase> = Vec::new();

    let entries = fs::read_dir(&lib).map_err(|e| format!("read library dir: {e}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let dir_name = match entry.file_name().into_string() {
            Ok(n) => n,
            Err(_) => continue,
        };
        // Skip hidden directories
        if dir_name.starts_with('.') {
            continue;
        }

        let note_count = count_notes_recursive(&path);
        let fallback_name = dir_name.replace('-', " ");

        kbs.push(KnowledgeBase {
            dir_name,
            name: fallback_name,
            color: "blue".to_string(),
            description: String::new(),
            position: 0,
            note_count,
            updated_at: latest_mtime_recursive(&path),
        });
    }

    // Enrich from DB
    let conn = meta.conn.lock().map_err(|e| e.to_string())?;
    for kb in &mut kbs {
        if let Ok(row) = conn.query_row(
            "SELECT color, position, description, display_name FROM knowledge_bases WHERE dir_name = ?1",
            params![kb.dir_name],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i32>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        ) {
            kb.color = row.0;
            kb.position = row.1;
            kb.description = row.2;
            if !row.3.trim().is_empty() {
                kb.name = row.3;
            }
        }
    }

    kbs.sort_by(|a, b| a.position.cmp(&b.position).then(a.dir_name.cmp(&b.dir_name)));

    Ok(kbs)
}

#[tauri::command]
pub async fn kb_create(
    name: String,
    color: Option<String>,
    meta: State<'_, VaultMetaDb>,
) -> Result<KnowledgeBase, String> {
    let lib = library_dir()?;

    let base_slug = slug::slugify(&name);
    let existing: Vec<String> = fs::read_dir(&lib)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter_map(|e| e.file_name().into_string().ok())
        .collect();
    let existing_refs: Vec<&str> = existing.iter().map(|s| s.as_str()).collect();
    let dir_name = slug::unique_slug(&base_slug, &existing_refs);

    let kb_path = lib.join(&dir_name);
    fs::create_dir_all(&kb_path).map_err(|e| format!("mkdir kb: {e}"))?;

    let color = color.unwrap_or_else(|| "blue".to_string());

    // Insert DB row with position = MAX(position) + 1000
    let conn = meta.conn.lock().map_err(|e| e.to_string())?;
    let max_pos: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), 0) FROM knowledge_bases",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    conn.execute(
        "INSERT INTO knowledge_bases (dir_name, color, position, description, display_name) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![dir_name, color, max_pos + 1000, "", name],
    )
    .map_err(|e| format!("insert kb row: {e}"))?;

    Ok(KnowledgeBase {
        dir_name: dir_name.clone(),
        name,
        color,
        description: String::new(),
        position: max_pos + 1000,
        note_count: 0,
        updated_at: file_mtime_secs(&kb_path),
    })
}

#[tauri::command]
pub async fn kb_delete(dir_name: String, meta: State<'_, VaultMetaDb>) -> Result<(), String> {
    let lib = library_dir()?;
    let kb_path = lib.join(&dir_name);

    if kb_path.exists() {
        fs::remove_dir_all(&kb_path).map_err(|e| format!("rm kb dir: {e}"))?;
    }

    let conn = meta.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM knowledge_bases WHERE dir_name = ?1",
        params![dir_name],
    )
    .map_err(|e| format!("delete kb row: {e}"))?;

    Ok(())
}

#[tauri::command]
pub async fn kb_update_meta(
    dir_name: String,
    name: Option<String>,
    color: Option<String>,
    description: Option<String>,
    position: Option<i32>,
    meta: State<'_, VaultMetaDb>,
) -> Result<(), String> {
    let conn = meta.conn.lock().map_err(|e| e.to_string())?;

    // Upsert: ensure row exists
    conn.execute(
        "INSERT OR IGNORE INTO knowledge_bases (dir_name) VALUES (?1)",
        params![dir_name],
    )
    .map_err(|e| e.to_string())?;

    if let Some(n) = name {
        conn.execute(
            "UPDATE knowledge_bases SET display_name = ?1 WHERE dir_name = ?2",
            params![n, dir_name],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(c) = color {
        conn.execute(
            "UPDATE knowledge_bases SET color = ?1 WHERE dir_name = ?2",
            params![c, dir_name],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(d) = description {
        conn.execute(
            "UPDATE knowledge_bases SET description = ?1 WHERE dir_name = ?2",
            params![d, dir_name],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(p) = position {
        conn.execute(
            "UPDATE knowledge_bases SET position = ?1 WHERE dir_name = ?2",
            params![p, dir_name],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn kb_folder_create(dir_name: String, relative_path: String, folder_name: String) -> Result<String, String> {
    let lib = library_dir()?;
    let parent = if relative_path.is_empty() {
        lib.join(&dir_name)
    } else {
        lib.join(&dir_name).join(&relative_path)
    };

    if !parent.exists() {
        return Err(format!("KB '{}' not found", dir_name));
    }

    let base_slug = slug::slugify(&folder_name);
    let existing: Vec<String> = fs::read_dir(&parent)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter_map(|e| e.file_name().into_string().ok())
        .collect();
    let existing_refs: Vec<&str> = existing.iter().map(|s| s.as_str()).collect();
    let slug_name = slug::unique_slug(&base_slug, &existing_refs);

    let folder_path = parent.join(&slug_name);
    fs::create_dir_all(&folder_path).map_err(|e| format!("mkdir folder: {e}"))?;

    Ok(slug_name)
}

#[tauri::command]
pub async fn kb_folder_rename(
    dir_name: String,
    relative_path: String,
    new_name: String,
) -> Result<String, String> {
    let lib = library_dir()?;
    let old_path = lib.join(&dir_name).join(&relative_path);

    if !old_path.exists() {
        return Err(format!("Folder '{}' not found", relative_path));
    }

    let parent = old_path.parent().ok_or("invalid path")?.to_path_buf();
    let base_slug = slug::slugify(&new_name);
    let existing: Vec<String> = fs::read_dir(&parent)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter_map(|e| e.file_name().into_string().ok())
        .collect();
    let existing_refs: Vec<&str> = existing.iter().map(|s| s.as_str()).collect();
    let slug_name = slug::unique_slug(&base_slug, &existing_refs);

    let new_path = parent.join(&slug_name);
    fs::rename(&old_path, &new_path).map_err(|e| format!("rename folder: {e}"))?;

    Ok(slug_name)
}

#[tauri::command]
pub async fn kb_folder_delete(dir_name: String, relative_path: String) -> Result<(), String> {
    let lib = library_dir()?;
    let folder_path = lib.join(&dir_name).join(&relative_path);

    if folder_path.exists() {
        fs::remove_dir_all(&folder_path).map_err(|e| format!("rm folder: {e}"))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn kb_list_contents(dir_name: String, relative_path: Option<String>) -> Result<KbContents, String> {
    let lib = library_dir()?;
    let target = if let Some(ref sp) = relative_path {
        lib.join(&dir_name).join(sp)
    } else {
        lib.join(&dir_name)
    };

    if !target.exists() {
        return Err(format!("Path not found: {}", target.display()));
    }

    let mut folders: Vec<KbFolderEntry> = Vec::new();
    let mut notes: Vec<KbNoteEntry> = Vec::new();

    let entries = fs::read_dir(&target).map_err(|e| format!("read_dir: {e}"))?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = match entry.file_name().into_string() {
            Ok(n) => n,
            Err(_) => continue,
        };

        if name.starts_with('.') {
            continue;
        }

        if path.is_dir() {
            let relative = if let Some(ref sp) = relative_path {
                format!("{}/{}", sp, name)
            } else {
                name.clone()
            };
            folders.push(KbFolderEntry {
                name: name.replace('-', " "),
                path: relative,
                count: count_notes_recursive(&path),
            });
        } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            if ext == "md" || ext == "html" {
                let stem = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("untitled")
                    .to_string();

                let slug_path = if let Some(ref sp) = relative_path {
                    format!("library/{}/{}/{}", dir_name, sp, stem)
                } else {
                    format!("library/{}/{}", dir_name, stem)
                };

                notes.push(KbNoteEntry {
                    slug: slug_path,
                    title: extract_title(&path),
                    preview: extract_preview(&path),
                    tags: extract_tags(&path),
                    updated_at: file_mtime_secs(&path),
                });
            }
        }
    }

    folders.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    notes.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    Ok(KbContents { folders, notes })
}

#[tauri::command]
pub async fn kb_create_note(
    dir_name: String,
    relative_path: Option<String>,
    title: String,
) -> Result<KbNoteEntry, String> {
    let lib = library_dir()?;
    let parent = if let Some(ref fp) = relative_path {
        lib.join(&dir_name).join(fp)
    } else {
        lib.join(&dir_name)
    };

    if !parent.exists() {
        fs::create_dir_all(&parent).map_err(|e| format!("mkdir parent: {e}"))?;
    }

    let base_slug = slug::slugify(&title);
    let existing: Vec<String> = fs::read_dir(&parent)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter_map(|e| {
            e.path()
                .file_stem()
                .and_then(|s| s.to_str().map(String::from))
        })
        .collect();
    let existing_refs: Vec<&str> = existing.iter().map(|s| s.as_str()).collect();
    let file_stem = slug::unique_slug(&base_slug, &existing_refs);

    let now = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true);
    let content = format!(
        "---\ntype: user-note\ntitle: \"{}\"\ncreated: {}\nupdated: {}\ntags: []\n---\n\n",
        title, now, now
    );

    let file_path = parent.join(format!("{}.md", file_stem));
    fs::write(&file_path, &content).map_err(|e| format!("write note: {e}"))?;

    let slug_path = if let Some(ref fp) = relative_path {
        format!("library/{}/{}/{}", dir_name, fp, file_stem)
    } else {
        format!("library/{}/{}", dir_name, file_stem)
    };

    Ok(KbNoteEntry {
        slug: slug_path,
        title,
        preview: String::new(),
        tags: Vec::new(),
        updated_at: file_mtime_secs(&file_path),
    })
}

// ─── Import Folder ──────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ImportFolderStats {
    pub kb_dir_name: String,
    pub notes_count: usize,
    pub attachments_count: usize,
    pub errors: Vec<String>,
}

fn is_note_file(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()),
        Some("md" | "markdown" | "html" | "htm")
    )
}

fn is_attachment(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_lowercase())
            .as_deref(),
        Some("png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "ico" | "pdf" | "mp4" | "mp3" | "wav" | "mov")
    )
}

fn copy_folder_recursive(
    src_dir: &Path,
    src_root: &Path,
    target_root: &Path,
    notes_count: &mut usize,
    attachments_count: &mut usize,
    errors: &mut Vec<String>,
) {
    let entries = match fs::read_dir(src_dir) {
        Ok(e) => e,
        Err(e) => {
            errors.push(format!("读取目录失败 {}: {e}", src_dir.display()));
            return;
        }
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path
            .file_name()
            .and_then(|n| n.to_str())
            .map_or(false, |n| n.starts_with('.'))
        {
            continue;
        }

        let relative = path.strip_prefix(src_root).unwrap_or(&path);
        let dest = target_root.join(relative);

        if path.is_dir() {
            if let Err(e) = fs::create_dir_all(&dest) {
                errors.push(format!("创建目录失败 {}: {e}", dest.display()));
            }
            copy_folder_recursive(
                &path,
                src_root,
                target_root,
                notes_count,
                attachments_count,
                errors,
            );
        } else if is_note_file(&path) {
            if let Err(e) = fs::copy(&path, &dest) {
                errors.push(format!("复制笔记失败 {}: {e}", path.display()));
            } else {
                *notes_count += 1;
            }
        } else if is_attachment(&path) {
            if let Err(e) = fs::copy(&path, &dest) {
                errors.push(format!("复制附件失败 {}: {e}", path.display()));
            } else {
                *attachments_count += 1;
            }
        }
    }
}

#[tauri::command]
pub async fn kb_import_folder(
    app: AppHandle,
    source_path: String,
    name: Option<String>,
    color: Option<String>,
    meta: State<'_, VaultMetaDb>,
) -> Result<ImportFolderStats, String> {
    let _vault = require_vault()?;
    let source = PathBuf::from(&source_path);

    if !source.is_dir() {
        return Err("所选路径不是有效目录".to_string());
    }

    let kb_name = name.unwrap_or_else(|| {
        source
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("未命名知识库")
            .to_string()
    });

    let color_val = color.unwrap_or_else(|| "blue".to_string());

    let lib = library_dir()?;
    let base_slug = slug::slugify(&kb_name);
    let existing: Vec<String> = fs::read_dir(&lib)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter_map(|e| e.file_name().into_string().ok())
        .collect();
    let existing_refs: Vec<&str> = existing.iter().map(|s| s.as_str()).collect();
    let dir_name = slug::unique_slug(&base_slug, &existing_refs);

    let target = lib.join(&dir_name);
    fs::create_dir_all(&target).map_err(|e| format!("创建 KB 目录失败: {e}"))?;

    let mut notes_count = 0usize;
    let mut attachments_count = 0usize;
    let mut errors = Vec::new();

    copy_folder_recursive(
        &source,
        &source,
        &target,
        &mut notes_count,
        &mut attachments_count,
        &mut errors,
    );

    let conn = meta.conn.lock().map_err(|e| e.to_string())?;
    let max_pos: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), 0) FROM knowledge_bases",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    conn.execute(
        "INSERT INTO knowledge_bases (dir_name, color, position, description, display_name) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![dir_name, color_val, max_pos + 1000, "", kb_name],
    )
    .map_err(|e| format!("写入 KB 元数据失败: {e}"))?;

    let _ = app.emit("vault-changed", serde_json::json!({ "notes": true, "clips": false }));

    Ok(ImportFolderStats {
        kb_dir_name: dir_name,
        notes_count,
        attachments_count,
        errors,
    })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    /// Build a small source tree and assert copy_folder_recursive copies
    /// exactly the expected number of notes/attachments and skips hidden files.
    #[test]
    fn test_copy_folder_recursive_counts() {
        let src_tmp = TempDir::new().unwrap();
        let dst_tmp = TempDir::new().unwrap();

        let src = src_tmp.path();
        let dst = dst_tmp.path();

        // Notes
        fs::write(src.join("note1.md"), "# Hello").unwrap();
        fs::write(src.join("note2.html"), "<h1>Hi</h1>").unwrap();
        fs::write(src.join("readme.markdown"), "text").unwrap();

        // Attachment
        fs::write(src.join("image.png"), [0u8; 4]).unwrap();

        // Hidden — must be skipped
        fs::write(src.join(".DS_Store"), "").unwrap();
        fs::write(src.join(".hidden.md"), "should be ignored").unwrap();

        // Unrecognised extension — must be skipped
        fs::write(src.join("data.csv"), "col1,col2").unwrap();

        // Subdirectory with more notes
        let sub = src.join("sub");
        fs::create_dir_all(&sub).unwrap();
        fs::write(sub.join("deep.md"), "deep note").unwrap();
        fs::write(sub.join("photo.jpg"), [0u8; 4]).unwrap();

        let mut notes = 0usize;
        let mut attachments = 0usize;
        let mut errors = Vec::new();

        copy_folder_recursive(src, src, dst, &mut notes, &mut attachments, &mut errors);

        assert!(errors.is_empty(), "unexpected errors: {:?}", errors);
        assert_eq!(notes, 4, "expected 4 note files (md/html/markdown + deep.md)");
        assert_eq!(attachments, 2, "expected 2 attachments (png + jpg)");

        // Verify files actually exist at destination
        assert!(dst.join("note1.md").exists());
        assert!(dst.join("sub/deep.md").exists());
        assert!(dst.join("image.png").exists());

        // Hidden and unknown must NOT appear at dest
        assert!(!dst.join(".DS_Store").exists());
        assert!(!dst.join("data.csv").exists());
    }

    #[test]
    fn test_is_note_file_recognises_all_extensions() {
        assert!(is_note_file(Path::new("file.md")));
        assert!(is_note_file(Path::new("file.markdown")));
        assert!(is_note_file(Path::new("file.html")));
        assert!(is_note_file(Path::new("file.htm")));
        assert!(!is_note_file(Path::new("file.txt")));
        assert!(!is_note_file(Path::new("file.pdf")));
    }

    #[test]
    fn test_is_attachment_case_insensitive() {
        assert!(is_attachment(Path::new("photo.PNG")));
        assert!(is_attachment(Path::new("doc.PDF")));
        assert!(is_attachment(Path::new("video.MP4")));
        assert!(!is_attachment(Path::new("data.csv")));
        assert!(!is_attachment(Path::new("note.md")));
    }
}
