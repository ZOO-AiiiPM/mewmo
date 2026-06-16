//! Knowledge Base Tauri commands — filesystem-based KB/folder/note CRUD
//!
//! KB content lives in `vault/library/<dir_name>/`.
//! Display metadata (color, position, description) stored in vault-meta.db `knowledge_bases` table.

use std::fs;
use std::path::PathBuf;

use rusqlite::params;
use serde::Serialize;
use tauri::State;

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
}

#[derive(Debug, Serialize)]
pub struct KbFolderEntry {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
pub struct KbNoteEntry {
    pub slug: String,
    pub title: String,
    pub preview: String,
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
        let name = dir_name.replace('-', " ");

        kbs.push(KnowledgeBase {
            dir_name,
            name,
            color: "blue".to_string(),
            description: String::new(),
            position: 0,
            note_count,
        });
    }

    // Enrich from DB
    let conn = meta.conn.lock().map_err(|e| e.to_string())?;
    for kb in &mut kbs {
        if let Ok(row) = conn.query_row(
            "SELECT color, position, description FROM knowledge_bases WHERE dir_name = ?1",
            params![kb.dir_name],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i32>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        ) {
            kb.color = row.0;
            kb.position = row.1;
            kb.description = row.2;
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
        "INSERT INTO knowledge_bases (dir_name, color, position, description) VALUES (?1, ?2, ?3, ?4)",
        params![dir_name, color, max_pos + 1000, ""],
    )
    .map_err(|e| format!("insert kb row: {e}"))?;

    Ok(KnowledgeBase {
        dir_name: dir_name.clone(),
        name: dir_name.replace('-', " "),
        color,
        description: String::new(),
        position: max_pos + 1000,
        note_count: 0,
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
pub async fn kb_folder_create(kb_dir: String, folder_name: String) -> Result<String, String> {
    let lib = library_dir()?;
    let parent = lib.join(&kb_dir);

    if !parent.exists() {
        return Err(format!("KB '{}' not found", kb_dir));
    }

    let base_slug = slug::slugify(&folder_name);
    let existing: Vec<String> = fs::read_dir(&parent)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter_map(|e| e.file_name().into_string().ok())
        .collect();
    let existing_refs: Vec<&str> = existing.iter().map(|s| s.as_str()).collect();
    let dir_name = slug::unique_slug(&base_slug, &existing_refs);

    let folder_path = parent.join(&dir_name);
    fs::create_dir_all(&folder_path).map_err(|e| format!("mkdir folder: {e}"))?;

    Ok(dir_name)
}

#[tauri::command]
pub async fn kb_folder_rename(
    kb_dir: String,
    old_name: String,
    new_name: String,
) -> Result<String, String> {
    let lib = library_dir()?;
    let old_path = lib.join(&kb_dir).join(&old_name);

    if !old_path.exists() {
        return Err(format!("Folder '{}' not found in KB '{}'", old_name, kb_dir));
    }

    let parent = lib.join(&kb_dir);
    let base_slug = slug::slugify(&new_name);
    let existing: Vec<String> = fs::read_dir(&parent)
        .map_err(|e| e.to_string())?
        .flatten()
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| n != &old_name)
        .collect();
    let existing_refs: Vec<&str> = existing.iter().map(|s| s.as_str()).collect();
    let dir_name = slug::unique_slug(&base_slug, &existing_refs);

    let new_path = parent.join(&dir_name);
    fs::rename(&old_path, &new_path).map_err(|e| format!("rename folder: {e}"))?;

    Ok(dir_name)
}

#[tauri::command]
pub async fn kb_folder_delete(kb_dir: String, folder_name: String) -> Result<(), String> {
    let lib = library_dir()?;
    let folder_path = lib.join(&kb_dir).join(&folder_name);

    if folder_path.exists() {
        fs::remove_dir_all(&folder_path).map_err(|e| format!("rm folder: {e}"))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn kb_list_contents(kb_dir: String, sub_path: Option<String>) -> Result<KbContents, String> {
    let lib = library_dir()?;
    let target = if let Some(ref sp) = sub_path {
        lib.join(&kb_dir).join(sp)
    } else {
        lib.join(&kb_dir)
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
            let relative = if let Some(ref sp) = sub_path {
                format!("{}/{}", sp, name)
            } else {
                name.clone()
            };
            folders.push(KbFolderEntry {
                name: name.replace('-', " "),
                path: relative,
            });
        } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            if ext == "md" || ext == "html" {
                let stem = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("untitled")
                    .to_string();

                let slug_path = if let Some(ref sp) = sub_path {
                    format!("library/{}/{}/{}", kb_dir, sp, stem)
                } else {
                    format!("library/{}/{}", kb_dir, stem)
                };

                notes.push(KbNoteEntry {
                    slug: slug_path,
                    title: extract_title(&path),
                    preview: extract_preview(&path),
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
    kb_dir: String,
    folder_path: Option<String>,
    title: String,
) -> Result<KbNoteEntry, String> {
    let lib = library_dir()?;
    let parent = if let Some(ref fp) = folder_path {
        lib.join(&kb_dir).join(fp)
    } else {
        lib.join(&kb_dir)
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

    let slug_path = if let Some(ref fp) = folder_path {
        format!("library/{}/{}/{}", kb_dir, fp, file_stem)
    } else {
        format!("library/{}/{}", kb_dir, file_stem)
    };

    Ok(KbNoteEntry {
        slug: slug_path,
        title,
        preview: String::new(),
        updated_at: file_mtime_secs(&file_path),
    })
}
