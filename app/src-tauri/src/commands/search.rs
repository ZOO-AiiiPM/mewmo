//! 全文搜索 Tauri command —— vault FTS5 实现层
//!
//! spec 003-notes-clips-to-vault, T025
//!
//! 从 vibe.db v4_search FTS5 切到 vault-meta.db FTS5（笔记 + 剪藏部分）
//! 订阅源（feed_entries）目前不在搜索范围（推 spec 004 做订阅 AI 检索）

use serde::Serialize;
use tauri::State;

use crate::vault::{init, meta_db::VaultMetaDb, search};
use std::path::PathBuf;

#[derive(Debug, Serialize)]
pub struct NoteHit {
    /// vault slug
    pub id: String,
    pub title_html: String,
    pub snippet: String,
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
pub struct ClipHit {
    pub id: String,
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

fn require_vault() -> Result<PathBuf, String> {
    let cfg = init::read_config()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "VAULT_NOT_INITIALIZED".to_string())?;
    Ok(PathBuf::from(&cfg.vault_path))
}

#[tauri::command]
pub fn search_all(meta: State<'_, VaultMetaDb>, query: String) -> Result<SearchResults, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(SearchResults {
            notes: vec![],
            clips: vec![],
        });
    }

    let vault = match require_vault() {
        Ok(p) => p,
        Err(_) => {
            return Ok(SearchResults {
                notes: vec![],
                clips: vec![],
            })
        }
    };

    let hits = search::search(&vault, &meta.conn, q, 50).map_err(|e| e.to_string())?;

    let mut notes = Vec::new();
    let mut clips = Vec::new();
    for h in hits {
        // title_html: vault::search::SearchHit 已经返回 title 字符串（无 highlight）
        // 简化：title_html = title 原文（vault FTS title 列已经是 jieba tokenized，重原 title 显示）
        // snippet 列已含 <mark> 高亮
        let title_html = h.title.clone();
        match h.kind.as_str() {
            "note" => notes.push(NoteHit {
                id: h.slug,
                title_html,
                snippet: h.snippet,
                updated_at: h.mtime as i64,
            }),
            "clip" => clips.push(ClipHit {
                id: h.slug,
                title_html,
                site_name: String::new(), // 简化：title 显示已含；侧栏 site_name 用 url 提取
                author: String::new(),
                snippet: h.snippet,
                saved_at: h.mtime as i64,
            }),
            _ => {}
        }
    }

    Ok(SearchResults { notes, clips })
}
