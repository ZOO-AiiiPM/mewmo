//! Vault query: 列表 / 获取笔记和剪藏的高层 API
//!
//! spec 003-notes-clips-to-vault, T006
//!
//! 责任：
//! - `list_notes(vault) -> Vec<NoteSummary>`
//! - `get_note(vault, slug) -> NoteFull`
//! - `list_clips(vault) -> Vec<ClipSummary>`
//! - `get_clip(vault, slug) -> ClipFull`
//!
//! 内部走 spec 002 已实现的 [`vault::io::read`] / [`vault::io::list`]（解析 frontmatter）。
//!
//! HTML 笔记导入（spec 003+）：list_notes 同时扫 wiki/notes/*.html，get_note 在 .md
//! 缺时回退 .html。HTML 不带 frontmatter，title 从 `<title>` / `<h1>` / 文件名 stem 推。

use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::Serialize;

use super::io;
use super::ingest;

// ============================================================================
// Public types（commands::notes / clips 的 typed view）
// ============================================================================

#[derive(Debug, Serialize, Clone)]
pub struct NoteSummary {
    pub slug: String,
    pub title: String,
    pub tags: Vec<String>,
    pub mtime: u64,
    /// "md"（标准笔记）或 "html"（外部 HTML 文件导入）
    pub format: String,
}

#[derive(Debug, Serialize)]
pub struct NoteFull {
    pub slug: String,
    pub title: String,
    pub body: String,
    pub tags: Vec<String>,
    pub created: Option<String>,
    pub updated: Option<String>,
    pub mtime: u64,
    pub legacy_id: Option<i64>,
    /// "md" 或 "html"。HTML 笔记的 body 是原始 HTML 字符串（前端 sanitize 后渲染）
    pub format: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ClipSummary {
    pub slug: String,
    pub title: String,
    pub url: String,
    pub site_name: Option<String>,
    pub favicon_url: Option<String>,
    pub excerpt: Option<String>,
    pub saved_at: Option<String>,
    pub tags: Vec<String>,
    pub mtime: u64,
}

#[derive(Debug, Serialize)]
pub struct ClipFull {
    pub slug: String,
    pub title: String,
    pub body: String,
    pub url: String,
    pub site_name: Option<String>,
    pub favicon_url: Option<String>,
    pub excerpt: Option<String>,
    pub author: Option<String>,
    pub saved_at: Option<String>,
    pub publish_ts: Option<String>,
    pub cover_url: Option<String>,
    pub ip_location: Option<String>,
    pub tags: Vec<String>,
    pub mtime: u64,
    pub legacy_id: Option<i64>,
}

// ============================================================================
// Note operations
// ============================================================================

/// 列出 `<vault>/wiki/notes/*.md`（user-note 类型）+ `*.html`（HTML 笔记导入），按 mtime 倒序
pub async fn list_notes(vault: &Path) -> Result<Vec<NoteSummary>, io::IoError> {
    let entries = io::list(vault, "wiki/notes", false, Some("user-note")).await?;
    let mut summaries: Vec<NoteSummary> = entries
        .into_iter()
        .map(|e| NoteSummary {
            slug: path_to_slug(&e.relative_path),
            title: e.title.unwrap_or_else(|| "无标题".to_string()),
            tags: e.tags,
            mtime: e.mtime,
            format: "md".to_string(),
        })
        .collect();

    // 追加扫 wiki/notes/*.html（io::list 只认 .md，HTML 笔记单独走文件系统枚举）
    let dir = vault.join("wiki/notes");
    if dir.is_dir() {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|s| s.to_str()) != Some("html") {
                    continue;
                }
                let stem = match path.file_stem().and_then(|s| s.to_str()) {
                    Some(s) if !s.is_empty() => s.to_string(),
                    _ => continue,
                };
                let mtime = entry
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                // title：HTML <title> / <h1> 优先，缺则用文件 stem
                let title = std::fs::read_to_string(&path)
                    .ok()
                    .and_then(|html| ingest::extract_html_title(&html))
                    .unwrap_or_else(|| stem.clone());
                summaries.push(NoteSummary {
                    slug: stem,
                    title,
                    tags: Vec::new(),
                    mtime,
                    format: "html".to_string(),
                });
            }
        }
    }

    summaries.sort_by(|a, b| b.mtime.cmp(&a.mtime));
    Ok(summaries)
}

/// 读单条笔记完整内容（先尝试 .md，缺则尝试 .html）
pub async fn get_note(vault: &Path, slug: &str) -> Result<NoteFull, io::IoError> {
    let md_relative = format!("wiki/notes/{}.md", slug);
    let md_path = vault.join(&md_relative);

    if md_path.exists() {
        let r = io::read(vault, &md_relative).await?;
        let fm = r.frontmatter.unwrap_or_default();
        let title = first_h1(&r.body).unwrap_or_else(|| slug.to_string());
        let legacy_id = fm.extra.get("legacy_id").and_then(|v| v.as_i64());
        return Ok(NoteFull {
            slug: slug.to_string(),
            title,
            body: r.body,
            tags: fm.tags,
            created: fm.created,
            updated: fm.updated,
            mtime: r.mtime,
            legacy_id,
            format: "md".to_string(),
        });
    }

    // .md 不存在 → 尝试 .html
    let html_relative = format!("wiki/notes/{}.html", slug);
    let html_path = vault.join(&html_relative);
    if !html_path.exists() {
        return Err(io::IoError::FileNotFound(slug.to_string()));
    }
    let html = std::fs::read_to_string(&html_path).map_err(io::IoError::Io)?;
    let mtime = html_path
        .metadata()
        .map_err(io::IoError::Io)?
        .modified()
        .map_err(io::IoError::Io)?
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let title = ingest::extract_html_title(&html).unwrap_or_else(|| slug.to_string());
    Ok(NoteFull {
        slug: slug.to_string(),
        title,
        body: html, // 前端 sanitize + dangerouslySetInnerHTML
        tags: Vec::new(),
        created: None,
        updated: None,
        mtime,
        legacy_id: None,
        format: "html".to_string(),
    })
}

// ============================================================================
// Clip operations
// ============================================================================

/// 列出 `<vault>/raw/clips/*.md`，按 mtime 倒序
///
/// 比 `list_notes` 多一次 read（需要拿 url / site_name / excerpt / saved_at），
/// 1k 篇规模性能可接受（dogfood 估算 ≤ 200ms）；超 5k 时考虑用 EntrySummary 扩展字段优化
pub async fn list_clips(vault: &Path) -> Result<Vec<ClipSummary>, io::IoError> {
    let entries = io::list(vault, "raw/clips", false, Some("clip")).await?;
    let mut summaries = Vec::with_capacity(entries.len());
    for e in entries {
        let slug = path_to_slug(&e.relative_path);
        let r = io::read(vault, &e.relative_path).await?;
        let fm = r.frontmatter.unwrap_or_default();
        let title = fm
            .extra
            .get("title")
            .and_then(|v| v.as_str())
            .map(String::from)
            .or(e.title)
            .unwrap_or_else(|| "无标题".to_string());
        summaries.push(ClipSummary {
            slug,
            title,
            url: extra_str(&fm, "url"),
            site_name: extra_opt(&fm, "site_name"),
            favicon_url: extra_opt(&fm, "favicon_url"),
            excerpt: extra_opt(&fm, "excerpt"),
            saved_at: extra_opt(&fm, "saved_at"),
            tags: fm.tags,
            mtime: e.mtime,
        });
    }
    summaries.sort_by(|a, b| b.mtime.cmp(&a.mtime));
    Ok(summaries)
}

/// 读单条剪藏完整内容（含中文站点专属字段，FR-008）
pub async fn get_clip(vault: &Path, slug: &str) -> Result<ClipFull, io::IoError> {
    let relative = format!("raw/clips/{}.md", slug);
    let r = io::read(vault, &relative).await?;
    let fm = r.frontmatter.unwrap_or_default();
    // 先借用 fm.extra 把 String / Option<String> 提取出来，最后才 move fm.author / fm.tags
    let title_from_extra = fm
        .extra
        .get("title")
        .and_then(|v| v.as_str())
        .map(String::from);
    let title = title_from_extra
        .or_else(|| first_h1(&r.body))
        .unwrap_or_else(|| slug.to_string());
    let url = extra_str(&fm, "url");
    let site_name = extra_opt(&fm, "site_name");
    let favicon_url = extra_opt(&fm, "favicon_url");
    let excerpt = extra_opt(&fm, "excerpt");
    let saved_at = extra_opt(&fm, "saved_at");
    let publish_ts = extra_opt(&fm, "publish_ts");
    let cover_url = extra_opt(&fm, "cover_url");
    let ip_location = extra_opt(&fm, "ip_location");
    let legacy_id = fm.extra.get("legacy_id").and_then(|v| v.as_i64());
    // 借用全部结束，可以 move
    Ok(ClipFull {
        slug: slug.to_string(),
        title,
        body: r.body,
        url,
        site_name,
        favicon_url,
        excerpt,
        author: fm.author,
        saved_at,
        publish_ts,
        cover_url,
        ip_location,
        tags: fm.tags,
        mtime: r.mtime,
        legacy_id,
    })
}

// ============================================================================
// Helpers
// ============================================================================

fn path_to_slug(relative: &str) -> String {
    Path::new(relative)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string()
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

fn extra_str(fm: &super::frontmatter::FrontmatterData, key: &str) -> String {
    fm.extra
        .get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn extra_opt(fm: &super::frontmatter::FrontmatterData, key: &str) -> Option<String> {
    fm.extra.get(key).and_then(|v| v.as_str()).map(String::from)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::super::ingest::{self, ClipMeta};
    use super::*;

    fn temp_vault() -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let pid = std::process::id();
        let path = std::env::temp_dir().join(format!("mewmo-query-test-{}-{}", pid, nanos));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[tokio::test]
    async fn test_list_notes_sorted_by_mtime_desc() {
        let vault = temp_vault();
        ingest::write_note(&vault, "first", "v1", &[], None)
            .await
            .unwrap();
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        ingest::write_note(&vault, "second", "v2", &[], None)
            .await
            .unwrap();
        let list = list_notes(&vault).await.unwrap();
        assert_eq!(list.len(), 2);
        // 倒序：second 在前（更新更晚）
        assert_eq!(list[0].slug, "second");
        assert_eq!(list[1].slug, "first");
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_get_note_parses_frontmatter() {
        let vault = temp_vault();
        let tags = vec!["ai".to_string(), "knowledge".to_string()];
        let r = ingest::write_note(&vault, "测试笔记", "正文内容", &tags, Some(99))
            .await
            .unwrap();
        let full = get_note(&vault, &r.slug).await.unwrap();
        assert_eq!(full.title, "测试笔记");
        assert!(full.body.contains("正文内容"));
        assert_eq!(full.tags, tags);
        assert!(full.created.is_some());
        assert!(full.updated.is_some());
        assert_eq!(full.legacy_id, Some(99));
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_list_clips_includes_chinese_fields_in_url_filter() {
        let vault = temp_vault();
        let meta = ClipMeta {
            url: "https://mp.weixin.qq.com/s/abc".to_string(),
            site_name: Some("某公众号".to_string()),
            excerpt: Some("摘要".to_string()),
            cover_url: Some("https://mmbiz.qpic.cn/cdn.jpg".to_string()),
            ..Default::default()
        };
        ingest::write_clip(&vault, "公众号文章", "正文", &[], &meta)
            .await
            .unwrap();
        let list = list_clips(&vault).await.unwrap();
        assert_eq!(list.len(), 1);
        let c = &list[0];
        assert_eq!(c.title, "公众号文章");
        assert_eq!(c.url, "https://mp.weixin.qq.com/s/abc");
        assert_eq!(c.site_name, Some("某公众号".to_string()));
        assert_eq!(c.excerpt, Some("摘要".to_string()));
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_get_clip_returns_full_chinese_fields() {
        let vault = temp_vault();
        let meta = ClipMeta {
            url: "https://www.zhihu.com/answer/123".to_string(),
            site_name: Some("知乎".to_string()),
            author: Some("某大 V".to_string()),
            ip_location: Some("北京".to_string()),
            publish_ts: Some("2026-05-01T08:00:00+08:00".to_string()),
            ..Default::default()
        };
        let r = ingest::write_clip(&vault, "知乎回答", "回答正文", &[], &meta)
            .await
            .unwrap();
        let full = get_clip(&vault, &r.slug).await.unwrap();
        assert_eq!(full.title, "知乎回答");
        assert_eq!(full.url, "https://www.zhihu.com/answer/123");
        assert_eq!(full.site_name, Some("知乎".to_string()));
        assert_eq!(full.author, Some("某大 V".to_string()));
        assert_eq!(full.ip_location, Some("北京".to_string()));
        assert_eq!(full.publish_ts, Some("2026-05-01T08:00:00+08:00".to_string()));
        assert!(full.body.contains("回答正文"));
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_list_notes_filters_non_user_note() {
        // 验证 list_notes 只返 type=user-note，不串其他类型
        let vault = temp_vault();
        ingest::write_note(&vault, "正常笔记", "x", &[], None)
            .await
            .unwrap();
        // 手工写一个 wiki-summary 进 wiki/notes/（模拟未来 LLM 生成的合成页）
        super::super::io::write_atomic(
            &vault,
            "wiki/notes/synthesized.md",
            "---\ntype: wiki-summary\n---\n# 合成页",
            None,
        )
        .await
        .unwrap();
        let list = list_notes(&vault).await.unwrap();
        assert_eq!(list.len(), 1, "list_notes 应只含 user-note");
        assert_eq!(list[0].slug, "正常笔记");
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_get_note_not_found() {
        let vault = temp_vault();
        let result = get_note(&vault, "nonexistent").await;
        assert!(matches!(
            result.unwrap_err(),
            super::io::IoError::FileNotFound(_)
        ));
        std::fs::remove_dir_all(&vault).ok();
    }
}
