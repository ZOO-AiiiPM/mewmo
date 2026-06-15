//! 剪藏 Tauri commands —— vault markdown 实现层
//!
//! spec 003-notes-clips-to-vault, T020-T024
//!
//! 中文站点专属字段（cdn_url_1_1 / publish_ts / ip_location）保留率 100%（FR-008 + SC-002）
//! 沿用现有 clip_parser.rs 抓取逻辑，仅改写入路径

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::vault::{
    ingest::{self, ClipMeta},
    init,
    meta_db::VaultMetaDb,
    query, search,
};

#[derive(Debug, Serialize, Deserialize)]
pub struct Clip {
    pub id: String,
    pub url: String,
    pub title: String,
    pub content_md: String,
    pub content_loaded: bool,
    pub excerpt: String,
    pub site_name: String,
    pub favicon_url: String,
    pub saved_at: i64,
    pub cover_image: String,
    pub author: String,
    /// ISO 8601 字符串
    pub published_at: String,
    /// 公众号 / 知乎 IP 属地
    pub ip_region: String,
    pub tags_text: String,
    pub pinned: bool,
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

fn input_to_meta(input: &ClipInput) -> ClipMeta {
    ClipMeta {
        url: input.url.clone(),
        site_name: opt_string(&input.site_name),
        favicon_url: opt_string(&input.favicon_url),
        excerpt: opt_string(&input.excerpt),
        author: opt_string(&input.author),
        publish_ts: opt_string(&input.published_at),
        cover_url: opt_string(&input.cover_image),
        ip_location: opt_string(&input.ip_region),
        legacy_id: None,
    }
}

fn opt_string(s: &str) -> Option<String> {
    if s.is_empty() {
        None
    } else {
        Some(s.to_string())
    }
}

fn full_to_clip(full: query::ClipFull, body_loaded: bool) -> Clip {
    let body = if body_loaded {
        full.body
    } else {
        // 列表 mode 取前 240 字预览
        let mut chars: String = full.body.chars().take(240).collect();
        if full.body.chars().count() > 240 {
            chars.push_str("...");
        }
        chars
    };
    let saved_at = if let Some(s) = full.saved_at.as_deref() {
        iso_to_unix(Some(s))
    } else {
        full.mtime as i64
    };
    Clip {
        id: full.slug,
        url: full.url,
        title: full.title,
        content_md: body,
        content_loaded: body_loaded,
        excerpt: full.excerpt.unwrap_or_default(),
        site_name: full.site_name.unwrap_or_default(),
        favicon_url: full.favicon_url.unwrap_or_default(),
        saved_at,
        cover_image: full.cover_url.unwrap_or_default(),
        author: full.author.unwrap_or_default(),
        published_at: full.publish_ts.unwrap_or_default(),
        ip_region: full.ip_location.unwrap_or_default(),
        tags_text: full.tags.join(", "),
        pinned: full.pinned,
    }
}

#[tauri::command]
pub async fn list_clips() -> Result<Vec<Clip>, String> {
    let vault = match require_vault() {
        Ok(p) => p,
        Err(_) => return Ok(Vec::new()),
    };
    let summaries = query::list_clips(&vault).await.map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(summaries.len());
    for s in summaries {
        let saved_at = if let Some(ref sa) = s.saved_at {
            iso_to_unix(Some(sa))
        } else {
            s.mtime as i64
        };
        out.push(Clip {
            id: s.slug,
            url: s.url,
            title: s.title,
            content_md: s.body_preview,
            content_loaded: false,
            excerpt: s.excerpt.unwrap_or_default(),
            site_name: s.site_name.unwrap_or_default(),
            favicon_url: s.favicon_url.unwrap_or_default(),
            saved_at,
            cover_image: s.cover_url.unwrap_or_default(),
            author: s.author.unwrap_or_default(),
            published_at: s.publish_ts.unwrap_or_default(),
            ip_region: s.ip_location.unwrap_or_default(),
            tags_text: s.tags.join(", "),
            pinned: s.pinned,
        });
    }
    // 置顶排最前，同组按 saved_at 倒序
    out.sort_by(|a, b| b.pinned.cmp(&a.pinned).then(b.saved_at.cmp(&a.saved_at)));
    Ok(out)
}

#[tauri::command]
pub async fn get_clip(id: String) -> Result<Option<Clip>, String> {
    let vault = match require_vault() {
        Ok(p) => p,
        Err(_) => return Ok(None),
    };
    match query::get_clip(&vault, &id).await {
        Ok(full) => Ok(Some(full_to_clip(full, true))),
        Err(crate::vault::io::IoError::FileNotFound(_)) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn save_clip(meta: State<'_, VaultMetaDb>, clip: ClipInput) -> Result<String, String> {
    let vault = require_vault()?;
    let cmeta = input_to_meta(&clip);
    let r = ingest::write_clip(&vault, &clip.title, &clip.content_md, &[], &cmeta)
        .await
        .map_err(|e| e.to_string())?;
    let full = query::get_clip(&vault, &r.slug)
        .await
        .map_err(|e| e.to_string())?;
    search::index_one_clip(&meta.conn, &full).map_err(|e| e.to_string())?;
    Ok(r.slug)
}

#[tauri::command]
pub async fn update_clip(
    meta: State<'_, VaultMetaDb>,
    id: String,
    patch: ClipInput,
) -> Result<String, String> {
    let vault = require_vault()?;
    let existing = query::get_clip(&vault, &id)
        .await
        .map_err(|e| e.to_string())?;
    let cmeta = input_to_meta(&patch);
    let r = ingest::update_clip(
        &vault,
        &id,
        &patch.title,
        &patch.content_md,
        &existing.tags,
        &cmeta,
        None,
    )
    .await
    .map_err(|e| e.to_string())?;
    if r.slug != id {
        search::delete_index_clip(&meta.conn, &id).map_err(|e| e.to_string())?;
    }
    let full = query::get_clip(&vault, &r.slug)
        .await
        .map_err(|e| e.to_string())?;
    search::index_one_clip(&meta.conn, &full).map_err(|e| e.to_string())?;
    Ok(r.slug)
}

#[tauri::command]
pub async fn delete_clip(meta: State<'_, VaultMetaDb>, id: String) -> Result<(), String> {
    let vault = require_vault()?;
    ingest::delete_clip(&vault, &id)
        .await
        .map_err(|e| e.to_string())?;
    search::delete_index_clip(&meta.conn, &id).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn pin_clip(id: String, pinned: bool) -> Result<(), String> {
    let vault = require_vault()?;
    let relative = format!("raw/clips/{}.md", id);
    let path = vault.join(&relative);
    if !path.exists() {
        return Err(format!("clip not found: {}", id));
    }
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;

    let updated = if content.starts_with("---\n") {
        if let Some(end) = content[4..].find("\n---") {
            let fm_content = &content[4..4 + end];
            let after = &content[4 + end + 4..];
            let mut lines: Vec<&str> = fm_content.lines().collect();
            lines.retain(|l| !l.trim_start().starts_with("pinned:"));
            if pinned {
                lines.push("pinned: true");
            }
            format!("---\n{}\n---{}", lines.join("\n"), after)
        } else {
            return Err("malformed frontmatter".to_string());
        }
    } else {
        if pinned {
            format!("---\npinned: true\n---\n\n{}", content)
        } else {
            return Ok(());
        }
    };

    std::fs::write(&path, updated).map_err(|e| e.to_string())?;
    Ok(())
}
