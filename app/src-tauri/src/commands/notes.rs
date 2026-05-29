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
) -> Result<(), String> {
    let vault = require_vault()?;

    // patch 是部分字段（前端可能只改 title 或只改 body），先读现有再 merge
    let existing = query::get_note(&vault, &id)
        .await
        .map_err(|e| e.to_string())?;

    // body 来自 patch.content_md 或保持原 body（注意 body 已含 H1，要剥掉再合）
    let new_body = match patch.content_md {
        Some(c) => c,
        None => existing.body.clone(),
    };

    // title 来自 patch.title 或现有
    let new_title = patch.title.unwrap_or_else(|| existing.title.clone());

    // body 通常含 H1 标题（write_note 时自动加），update 时 caller 传的 content_md 不该重复 H1
    // 简化：把 body 里的 H1 行剥掉，让 update_note 内部重新加（保持 H1 = title 一致）
    let body_no_h1 = strip_first_h1(&new_body);

    ingest::update_note(&vault, &id, &new_title, &body_no_h1, &existing.tags, None)
        .await
        .map_err(|e| e.to_string())?;

    // 增量 index
    let full = query::get_note(&vault, &id)
        .await
        .map_err(|e| e.to_string())?;
    search::index_one_note(&meta.conn, &full).map_err(|e| e.to_string())?;
    Ok(())
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
