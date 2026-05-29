//! 笔记 Tauri commands —— vault markdown 实现层
//!
//! spec 003-notes-clips-to-vault, T014-T018
//!
//! Tauri command 名签名不变（FR-017），实现层从 vibe.db SQLite 切到 vault::ingest+query。
//! id 入参类型从 i64 → String（vault slug，前端 lib/db.ts 跟着改）

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::vault::{ingest, init, meta_db::VaultMetaDb, query, search};

#[derive(Debug, Serialize, Deserialize)]
pub struct Note {
    /// vault slug（从 wiki/notes/<slug>.md 取 stem）
    pub id: String,
    pub title: String,
    pub content_md: String,
    pub content_loaded: bool,
    pub tags_text: String,
    /// ISO 8601 → unix ts（前端类型保 number 兼容现有 UI 时间显示）
    pub created_at: i64,
    pub updated_at: i64,
    /// "md"（标准笔记）或 "html"（外部 HTML 文件导入），前端按此切渲染组件
    pub format: String,
}

#[derive(Debug, Deserialize)]
pub struct NotePatch {
    pub title: Option<String>,
    pub content_md: Option<String>,
}

fn require_vault() -> Result<PathBuf, String> {
    let cfg = init::read_config()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "VAULT_NOT_INITIALIZED".to_string())?;
    Ok(PathBuf::from(&cfg.vault_path))
}

fn iso_to_unix(iso: Option<&str>) -> i64 {
    iso.and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.timestamp())
        .unwrap_or(0)
}

fn first_h1(body: &str) -> Option<String> {
    for line in body.lines() {
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed.strip_prefix("# ") {
            return Some(rest.trim().to_string());
        }
    }
    None
}

#[tauri::command]
pub async fn list_notes() -> Result<Vec<Note>, String> {
    // vault 未初始化时返回空 list（不 fail，让 UI 显示空状态）
    let vault = match require_vault() {
        Ok(p) => p,
        Err(_) => return Ok(Vec::new()),
    };
    let summaries = query::list_notes(&vault)
        .await
        .map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(summaries.len());
    for s in summaries {
        // 二次 read 拿 frontmatter created / updated（跟 get_note 一致），避免列表 mtime
        // 跟点开后 frontmatter.created 不一致导致 sidebar 时间分组「今天」突跳到「本周」
        let (created_at, updated_at) = match query::get_note(&vault, &s.slug).await {
            Ok(full) => {
                let c = if full.created.is_some() {
                    iso_to_unix(full.created.as_deref())
                } else {
                    full.mtime as i64
                };
                let u = if full.updated.is_some() {
                    iso_to_unix(full.updated.as_deref())
                } else {
                    full.mtime as i64
                };
                (c, u)
            }
            Err(_) => (s.mtime as i64, s.mtime as i64),
        };
        let tags_text = s.tags.join(", ");
        // list-summary-loading：列表不带 body，按需 read 加载（沿用 spec 002 io::list 模式）
        out.push(Note {
            id: s.slug,
            title: s.title,
            content_md: String::new(),
            content_loaded: false,
            tags_text,
            created_at,
            updated_at,
            format: s.format,
        });
    }
    Ok(out)
}

#[tauri::command]
pub async fn get_note(id: String) -> Result<Option<Note>, String> {
    let vault = match require_vault() {
        Ok(p) => p,
        Err(_) => return Ok(None),
    };
    match query::get_note(&vault, &id).await {
        Ok(full) => {
            let tags_text = full.tags.join(", ");
            // 优先 frontmatter created/updated，缺失用 mtime
            let created_at = if full.created.is_some() {
                iso_to_unix(full.created.as_deref())
            } else {
                full.mtime as i64
            };
            let updated_at = if full.updated.is_some() {
                iso_to_unix(full.updated.as_deref())
            } else {
                full.mtime as i64
            };
            Ok(Some(Note {
                id: full.slug,
                title: full.title,
                content_md: full.body,
                content_loaded: true,
                tags_text,
                created_at,
                updated_at,
                format: full.format,
            }))
        }
        Err(crate::vault::io::IoError::FileNotFound(_)) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn create_note(meta: State<'_, VaultMetaDb>) -> Result<String, String> {
    let vault = require_vault()?;
    // 创建空笔记：title="" → slug 默认 "untitled" 自动碰撞 dedup；
    // body="" → write_note 内部加空 H1 → first_h1 取出 ""，commands list/get 给前端 title=""
    // → NoteEditor 显示「无标题」placeholder（前端 spec：title 为空时 placeholder 灰色）
    let r = ingest::write_note(&vault, "", "", &[], None)
        .await
        .map_err(|e| e.to_string())?;
    let full = query::get_note(&vault, &r.slug)
        .await
        .map_err(|e| e.to_string())?;
    search::index_one_note(&meta.conn, &full).map_err(|e| e.to_string())?;
    Ok(r.slug)
}

#[tauri::command]
pub async fn update_note(
    meta: State<'_, VaultMetaDb>,
    id: String,
    patch: NotePatch,
) -> Result<String, String> {
    let vault = require_vault()?;

    // patch 是部分字段（前端可能只改 title 或只改 body），先读现有再 merge
    let existing = query::get_note(&vault, &id)
        .await
        .map_err(|e| e.to_string())?;

    // HTML 笔记只读（前端 HtmlReader 不暴露编辑入口；这里防御性拦截）
    if existing.format == "html" {
        return Err("HTML_NOTE_READONLY".to_string());
    }

    let new_body = match patch.content_md {
        Some(c) => c,
        None => existing.body.clone(),
    };
    let new_title = patch.title.unwrap_or_else(|| existing.title.clone());

    // body 直接传，不再 strip / 注入 H1（按 Obsidian 风格：title 走 frontmatter，body 是纯内容）。
    // 老笔记 body 里仍有的 H1 由用户编辑时手动清理，不强制迁移避免误剥。
    let r = ingest::update_note(&vault, &id, &new_title, &new_body, &existing.tags, None)
        .await
        .map_err(|e| e.to_string())?;

    // title 改了 → slug 变了 → 删旧 FTS5 索引 + 索引新 slug；返回新 slug 给前端更新 state/refId
    if r.slug != id {
        search::delete_index_note(&meta.conn, &id).map_err(|e| e.to_string())?;
    }
    let full = query::get_note(&vault, &r.slug)
        .await
        .map_err(|e| e.to_string())?;
    search::index_one_note(&meta.conn, &full).map_err(|e| e.to_string())?;
    Ok(r.slug)
}

#[tauri::command]
pub async fn delete_note(meta: State<'_, VaultMetaDb>, id: String) -> Result<(), String> {
    let vault = require_vault()?;
    ingest::delete_note(&vault, &id)
        .await
        .map_err(|e| e.to_string())?;
    search::delete_index_note(&meta.conn, &id).map_err(|e| e.to_string())?;
    Ok(())
}

// ============================================================================
// HTML 笔记导入 commands（保留原始 HTML，落 wiki/notes/<slug>.html）
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct HtmlFileInput {
    /// 文件名（含扩展名 .html）—— title 解析失败时 fallback 用
    pub filename: String,
    /// HTML 全文内容
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct ImportResult {
    /// 成功时是 vault slug；失败时为 None
    pub slug: Option<String>,
    /// 来源文件名（前端展示用）
    pub source_name: String,
    /// 失败时的错误描述；成功时为 None
    pub error: Option<String>,
}

/// 导入单个 HTML 文件作为笔记
///
/// 前端通过 `<input type="file">` 读 File → text 后传内容（无需绝对路径权限）。
/// title 优先级：HTML `<title>` → 首个 `<h1>` → 文件名 stem（去 .html）。
#[tauri::command]
pub async fn import_html_note(filename: String, content: String) -> Result<String, String> {
    let vault = require_vault()?;
    let title = ingest::extract_html_title(&content)
        .or_else(|| filename_to_stem(&filename))
        .unwrap_or_else(|| "无标题".to_string());
    let r = ingest::write_html_note(&vault, &title, &content)
        .await
        .map_err(|e| e.to_string())?;
    Ok(r.slug)
}

/// 批量导入多个 HTML 文件
///
/// 单个失败不中断后续——保留全部 outcomes（沿用 ClipReader 批量添加链接的逐条容错模式）
#[tauri::command]
pub async fn import_html_dir(files: Vec<HtmlFileInput>) -> Result<Vec<ImportResult>, String> {
    let vault = require_vault()?;
    let mut results = Vec::with_capacity(files.len());
    for f in files {
        let title = ingest::extract_html_title(&f.content)
            .or_else(|| filename_to_stem(&f.filename))
            .unwrap_or_else(|| "无标题".to_string());
        let outcome = match ingest::write_html_note(&vault, &title, &f.content).await {
            Ok(r) => ImportResult {
                slug: Some(r.slug),
                source_name: f.filename,
                error: None,
            },
            Err(e) => ImportResult {
                slug: None,
                source_name: f.filename,
                error: Some(e.to_string()),
            },
        };
        results.push(outcome);
    }
    Ok(results)
}

/// 通过绝对路径批量导入（用户粘贴路径文本，每行一条；可混合 file + dir）
///
/// 每条 path 后端判断：
/// - 是 .html / .htm 文件 → 直接导入
/// - 是目录 → 递归扫所有 .html / .htm 文件批量导入
/// - 其他扩展名文件 / 不存在 → 记录失败，继续下一条
///
/// 单条失败不中断（沿用 import_html_dir 的 fail-loud + 保留 outcomes 模式）
#[tauri::command]
pub async fn import_html_paths(paths: Vec<String>) -> Result<Vec<ImportResult>, String> {
    let vault = require_vault()?;
    let mut results: Vec<ImportResult> = Vec::new();

    for raw in paths {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        let path = PathBuf::from(trimmed);
        let display_name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(trimmed)
            .to_string();

        if !path.exists() {
            results.push(ImportResult {
                slug: None,
                source_name: trimmed.to_string(),
                error: Some("PATH_NOT_FOUND".to_string()),
            });
            continue;
        }

        if path.is_dir() {
            // 递归扫所有 .html / .htm
            let mut html_files: Vec<PathBuf> = Vec::new();
            collect_html_files(&path, true, &mut html_files);
            if html_files.is_empty() {
                results.push(ImportResult {
                    slug: None,
                    source_name: trimmed.to_string(),
                    error: Some("EMPTY_DIR_NO_HTML".to_string()),
                });
                continue;
            }
            for f in html_files {
                results.push(import_one_path(&vault, &f).await);
            }
            continue;
        }

        // 单文件
        match path.extension().and_then(|s| s.to_str()) {
            Some(ext) if ext.eq_ignore_ascii_case("html") || ext.eq_ignore_ascii_case("htm") => {
                results.push(import_one_path(&vault, &path).await);
            }
            _ => {
                results.push(ImportResult {
                    slug: None,
                    source_name: display_name,
                    error: Some("NOT_HTML_FILE".to_string()),
                });
            }
        }
    }

    Ok(results)
}

async fn import_one_path(vault: &std::path::Path, file: &std::path::Path) -> ImportResult {
    let display_name = file
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    match std::fs::read_to_string(file) {
        Ok(html) => {
            let title = ingest::extract_html_title(&html)
                .or_else(|| {
                    file.file_stem()
                        .and_then(|s| s.to_str())
                        .map(|s| s.to_string())
                        .filter(|s| !s.is_empty())
                })
                .unwrap_or_else(|| "无标题".to_string());
            match ingest::write_html_note(vault, &title, &html).await {
                Ok(r) => ImportResult {
                    slug: Some(r.slug),
                    source_name: display_name,
                    error: None,
                },
                Err(e) => ImportResult {
                    slug: None,
                    source_name: display_name,
                    error: Some(e.to_string()),
                },
            }
        }
        Err(e) => ImportResult {
            slug: None,
            source_name: display_name,
            error: Some(format!("READ_FAILED: {}", e)),
        },
    }
}

fn collect_html_files(dir: &std::path::Path, recursive: bool, out: &mut Vec<PathBuf>) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            if recursive {
                collect_html_files(&p, recursive, out);
            }
            continue;
        }
        match p.extension().and_then(|s| s.to_str()) {
            Some(ext) if ext.eq_ignore_ascii_case("html") || ext.eq_ignore_ascii_case("htm") => {
                out.push(p);
            }
            _ => {}
        }
    }
}

fn filename_to_stem(filename: &str) -> Option<String> {
    let stem = std::path::Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())?
        .trim()
        .to_string();
    if stem.is_empty() {
        None
    } else {
        Some(stem)
    }
}

/// 把 markdown body 第一个 H1 行剥掉（如有）+ 后面紧邻空行也剥
fn strip_first_h1(body: &str) -> String {
    let mut lines = body.lines().peekable();
    let mut out = Vec::new();
    let mut h1_stripped = false;
    while let Some(line) = lines.next() {
        if !h1_stripped && line.trim_start().starts_with("# ") {
            h1_stripped = true;
            // 跳过紧邻的空行
            if matches!(lines.peek(), Some(l) if l.trim().is_empty()) {
                lines.next();
            }
            continue;
        }
        out.push(line);
    }
    if h1_stripped {
        out.join("\n")
    } else {
        body.to_string()
    }
}

#[allow(dead_code)]
fn _h1_unused(s: &str) {
    let _ = first_h1(s);
}
