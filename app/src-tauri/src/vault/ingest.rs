//! Vault ingest: 笔记 / 剪藏写入 vault markdown
//!
//! spec 003-notes-clips-to-vault, T004 + T005
//!
//! 责任：
//! - `write_note` / `update_note` / `delete_note`
//! - `write_clip` / `update_clip` / `delete_clip`
//! 内部走 spec 002 已实现的 [`vault::io`] (atomic + mutex) + [`vault::frontmatter`] + [`vault::slug`]
//! 失败 fail-loud（错误透传给 caller，由 commands/* 转 Tauri error event，spec 003 FR-009）

use std::path::Path;

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};

use super::{frontmatter, io, slug};

// ============================================================================
// Public types
// ============================================================================

#[derive(Debug, Serialize)]
pub struct WriteResult {
    pub slug: String,
    pub relative_path: String,
    pub mtime: u64,
}

/// 剪藏专属元数据（含中文站点专属字段，沿用 clip_parser.rs 抓取，FR-008）
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct ClipMeta {
    pub url: String,
    pub site_name: Option<String>,
    pub favicon_url: Option<String>,
    pub excerpt: Option<String>,
    pub author: Option<String>,
    /// 公众号 `wx_publish_ts`，ISO 8601 字符串
    pub publish_ts: Option<String>,
    /// 公众号 `cdn_url_1_1`（正方形封面）
    pub cover_url: Option<String>,
    /// 知乎 IP 属地
    pub ip_location: Option<String>,
    /// 搬迁脚本写入 vibe.db 旧 id 用来追溯
    pub legacy_id: Option<i64>,
}

#[derive(Debug)]
pub enum IngestError {
    Io(io::IoError),
}

impl From<io::IoError> for IngestError {
    fn from(e: io::IoError) -> Self {
        IngestError::Io(e)
    }
}

impl std::fmt::Display for IngestError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            IngestError::Io(e) => write!(f, "{}", e),
        }
    }
}

impl std::error::Error for IngestError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            IngestError::Io(e) => Some(e),
        }
    }
}

// ============================================================================
// Helpers
// ============================================================================

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

/// 转义 YAML double-quoted string
fn yaml_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// tags 数组转 YAML inline list（避免引入 yaml serializer 依赖）
fn tags_to_yaml(tags: &[String]) -> String {
    if tags.is_empty() {
        return "[]".to_string();
    }
    let items: Vec<String> = tags
        .iter()
        .map(|t| format!("\"{}\"", yaml_escape(t)))
        .collect();
    format!("[{}]", items.join(", "))
}

/// 扫描指定目录已有 .md 文件 stem，用于 unique_slug 碰撞检测（spec 002 FR-016）
fn existing_slugs(dir: &Path) -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("md") {
                if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
                    out.push(stem.to_string());
                }
            }
        }
    }
    out
}

fn final_slug_from_title(title: &str, existing: &[String]) -> String {
    let base = slug::slugify(title);
    let refs: Vec<&str> = existing.iter().map(|s| s.as_str()).collect();
    slug::unique_slug(&base, &refs)
}

// ============================================================================
// Note operations
// ============================================================================

/// 创建新笔记 → `<vault>/wiki/notes/<slug>.md`
///
/// `legacy_id` 仅搬迁脚本传，新建笔记传 `None`。
pub async fn write_note(
    vault: &Path,
    title: &str,
    body: &str,
    tags: &[String],
    legacy_id: Option<i64>,
) -> Result<WriteResult, IngestError> {
    let now = now_iso();
    let dir = vault.join("wiki/notes");
    let existing = existing_slugs(&dir);
    let final_slug = final_slug_from_title(title, &existing);

    let mut yaml = format!(
        "type: user-note\ncreated: {created}\nupdated: {updated}\ntags: {tags}",
        created = now,
        updated = now,
        tags = tags_to_yaml(tags),
    );
    if let Some(id) = legacy_id {
        yaml.push_str(&format!("\nlegacy_id: {}", id));
    }

    // 标题进 H1（spec 002 io::list 用 first_h1 当 title）
    let body_with_h1 = if body.trim_start().starts_with("# ") {
        body.to_string()
    } else {
        format!("# {}\n\n{}", title, body.trim_start_matches('\n'))
    };

    let content = frontmatter::build(&yaml, &body_with_h1);
    let relative = format!("wiki/notes/{}.md", final_slug);
    let mtime = io::write_atomic(vault, &relative, &content, None).await?;
    Ok(WriteResult {
        slug: final_slug,
        relative_path: relative,
        mtime,
    })
}

/// 更新已有笔记。保留原 `created`，刷新 `updated`，覆盖 tags + body
pub async fn update_note(
    vault: &Path,
    slug: &str,
    title: &str,
    body: &str,
    tags: &[String],
    expected_mtime: Option<u64>,
) -> Result<WriteResult, IngestError> {
    let relative = format!("wiki/notes/{}.md", slug);
    let existing = io::read(vault, &relative).await?;
    let existing_fm = existing.frontmatter.unwrap_or_default();

    let created = existing_fm.created.unwrap_or_else(now_iso);
    let legacy_id = existing_fm.extra.get("legacy_id").and_then(|v| v.as_i64());
    let now = now_iso();

    let mut yaml = format!(
        "type: user-note\ncreated: {created}\nupdated: {updated}\ntags: {tags}",
        created = created,
        updated = now,
        tags = tags_to_yaml(tags),
    );
    if let Some(id) = legacy_id {
        yaml.push_str(&format!("\nlegacy_id: {}", id));
    }

    let body_with_h1 = if body.trim_start().starts_with("# ") {
        body.to_string()
    } else {
        format!("# {}\n\n{}", title, body.trim_start_matches('\n'))
    };

    let content = frontmatter::build(&yaml, &body_with_h1);
    let mtime = io::write_atomic(vault, &relative, &content, expected_mtime).await?;
    Ok(WriteResult {
        slug: slug.to_string(),
        relative_path: relative,
        mtime,
    })
}

/// 物理删除笔记（dogfood 阶段不要回收站）
pub async fn delete_note(vault: &Path, slug: &str) -> Result<(), IngestError> {
    let relative = format!("wiki/notes/{}.md", slug);
    io::validate_relative_path(&relative)?;
    let path = vault.join(&relative);
    if path.exists() {
        std::fs::remove_file(&path).map_err(io::IoError::Io)?;
    }
    Ok(())
}

// ============================================================================
// Clip operations
// ============================================================================

/// 创建新剪藏 → `<vault>/raw/clips/<slug>.md`
///
/// 中文站点专属字段（cdn_url_1_1 / publish_ts / ip_location）由 caller（commands/clips.rs
/// 沿用现有 clip_parser.rs 抓取）通过 `meta` 传入，保留率应 100%（SC-002）
pub async fn write_clip(
    vault: &Path,
    title: &str,
    body: &str,
    tags: &[String],
    meta: &ClipMeta,
) -> Result<WriteResult, IngestError> {
    let now = now_iso();
    let dir = vault.join("raw/clips");
    let existing = existing_slugs(&dir);
    let final_slug = final_slug_from_title(title, &existing);

    let yaml = build_clip_yaml(title, &now, tags, meta);
    let body_with_h1 = if body.trim_start().starts_with("# ") {
        body.to_string()
    } else {
        format!("# {}\n\n{}", title, body.trim_start_matches('\n'))
    };

    let content = frontmatter::build(&yaml, &body_with_h1);
    let relative = format!("raw/clips/{}.md", final_slug);
    let mtime = io::write_atomic(vault, &relative, &content, None).await?;
    Ok(WriteResult {
        slug: final_slug,
        relative_path: relative,
        mtime,
    })
}

/// 更新已有剪藏。保留原 `saved_at` + 中文专属字段（cdn_url_1_1 / publish_ts / ip_location 等），
/// 刷新 tags + body。Caller 想改 url / site_name 时通过 meta 传入。
pub async fn update_clip(
    vault: &Path,
    slug: &str,
    title: &str,
    body: &str,
    tags: &[String],
    meta: &ClipMeta,
    expected_mtime: Option<u64>,
) -> Result<WriteResult, IngestError> {
    let relative = format!("raw/clips/{}.md", slug);
    let existing = io::read(vault, &relative).await?;
    let existing_fm = existing.frontmatter.unwrap_or_default();

    // 保留原 saved_at（如果存在）
    let saved_at = existing_fm
        .extra
        .get("saved_at")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(now_iso);

    let yaml = build_clip_yaml(title, &saved_at, tags, meta);
    let body_with_h1 = if body.trim_start().starts_with("# ") {
        body.to_string()
    } else {
        format!("# {}\n\n{}", title, body.trim_start_matches('\n'))
    };
    let content = frontmatter::build(&yaml, &body_with_h1);
    let mtime = io::write_atomic(vault, &relative, &content, expected_mtime).await?;
    Ok(WriteResult {
        slug: slug.to_string(),
        relative_path: relative,
        mtime,
    })
}

/// 物理删除剪藏
pub async fn delete_clip(vault: &Path, slug: &str) -> Result<(), IngestError> {
    let relative = format!("raw/clips/{}.md", slug);
    io::validate_relative_path(&relative)?;
    let path = vault.join(&relative);
    if path.exists() {
        std::fs::remove_file(&path).map_err(io::IoError::Io)?;
    }
    Ok(())
}

/// 拼装剪藏 frontmatter YAML 字符串
fn build_clip_yaml(title: &str, saved_at: &str, tags: &[String], meta: &ClipMeta) -> String {
    let mut yaml = format!(
        "type: clip\nsource: web\ntitle: \"{title}\"\nurl: \"{url}\"\nsaved_at: {saved_at}\ntags: {tags}",
        title = yaml_escape(title),
        url = yaml_escape(&meta.url),
        saved_at = saved_at,
        tags = tags_to_yaml(tags),
    );
    if let Some(s) = &meta.site_name {
        yaml.push_str(&format!("\nsite_name: \"{}\"", yaml_escape(s)));
    }
    if let Some(s) = &meta.favicon_url {
        yaml.push_str(&format!("\nfavicon_url: \"{}\"", yaml_escape(s)));
    }
    if let Some(s) = &meta.excerpt {
        // excerpt 可能含换行，转单行
        let one_line = s.replace('\n', " ");
        yaml.push_str(&format!("\nexcerpt: \"{}\"", yaml_escape(&one_line)));
    }
    if let Some(s) = &meta.author {
        yaml.push_str(&format!("\nauthor: \"{}\"", yaml_escape(s)));
    }
    if let Some(s) = &meta.publish_ts {
        yaml.push_str(&format!("\npublish_ts: \"{}\"", yaml_escape(s)));
    }
    if let Some(s) = &meta.cover_url {
        yaml.push_str(&format!("\ncover_url: \"{}\"", yaml_escape(s)));
    }
    if let Some(s) = &meta.ip_location {
        yaml.push_str(&format!("\nip_location: \"{}\"", yaml_escape(s)));
    }
    if let Some(id) = meta.legacy_id {
        yaml.push_str(&format!("\nlegacy_id: {}", id));
    }
    yaml
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_vault() -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let pid = std::process::id();
        let path = std::env::temp_dir().join(format!("mewmo-ingest-test-{}-{}", pid, nanos));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[tokio::test]
    async fn test_write_note_creates_md() {
        let vault = temp_vault();
        let tags = vec!["ai".to_string(), "knowledge".to_string()];
        let r = write_note(&vault, "测试笔记", "这是正文", &tags, None)
            .await
            .unwrap();
        assert_eq!(r.slug, "测试笔记");
        assert!(vault.join(&r.relative_path).exists());
        let content =
            std::fs::read_to_string(vault.join(&r.relative_path)).unwrap();
        assert!(content.contains("type: user-note"));
        assert!(content.contains("\"ai\""));
        assert!(content.contains("\"knowledge\""));
        assert!(content.contains("# 测试笔记"));
        assert!(content.contains("这是正文"));
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_write_note_slug_collision_dedup() {
        let vault = temp_vault();
        let _ = write_note(&vault, "重复标题", "v1", &[], None)
            .await
            .unwrap();
        let r2 = write_note(&vault, "重复标题", "v2", &[], None)
            .await
            .unwrap();
        assert_eq!(r2.slug, "重复标题-2");
        let r3 = write_note(&vault, "重复标题", "v3", &[], None)
            .await
            .unwrap();
        assert_eq!(r3.slug, "重复标题-3");
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_update_note_preserves_created() {
        let vault = temp_vault();
        let r1 = write_note(&vault, "笔记", "v1", &[], None).await.unwrap();
        // 等 1 秒以保证时间戳能比较出来
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        let r2 = update_note(
            &vault,
            &r1.slug,
            "笔记",
            "v2",
            &["new-tag".to_string()],
            None,
        )
        .await
        .unwrap();
        let parsed = io::read(&vault, &r2.relative_path).await.unwrap();
        let fm = parsed.frontmatter.unwrap();
        assert!(fm.created.is_some());
        assert!(fm.updated.is_some());
        assert_ne!(fm.created, fm.updated, "created 应保留原值，updated 应刷新");
        assert!(parsed.body.contains("v2"));
        assert!(fm.tags.contains(&"new-tag".to_string()));
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_delete_note_unlinks() {
        let vault = temp_vault();
        let r = write_note(&vault, "待删", "x", &[], None).await.unwrap();
        let path = vault.join(&r.relative_path);
        assert!(path.exists());
        delete_note(&vault, &r.slug).await.unwrap();
        assert!(!path.exists());
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_delete_note_idempotent() {
        let vault = temp_vault();
        // 删除不存在的笔记不报错（dogfood 简化）
        delete_note(&vault, "nonexistent").await.unwrap();
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_write_clip_chinese_fields_preserved() {
        // FR-008 / SC-002：公众号 / 知乎专属字段保留率 100%
        let vault = temp_vault();
        let meta = ClipMeta {
            url: "https://mp.weixin.qq.com/s/abc".to_string(),
            site_name: Some("某公众号".to_string()),
            favicon_url: Some("https://mmbiz.qpic.cn/favicon.ico".to_string()),
            excerpt: Some("这是摘要".to_string()),
            author: Some("作者".to_string()),
            publish_ts: Some("2026-05-15T08:00:00+08:00".to_string()),
            cover_url: Some("https://mmbiz.qpic.cn/cdn_url_1_1.jpg".to_string()),
            ip_location: Some("上海".to_string()),
            legacy_id: None,
        };
        let r = write_clip(&vault, "公众号文章", "正文 markdown", &[], &meta)
            .await
            .unwrap();
        let content = std::fs::read_to_string(vault.join(&r.relative_path)).unwrap();
        assert!(content.contains("type: clip"));
        assert!(content.contains("source: web"));
        assert!(content.contains("publish_ts:"));
        assert!(content.contains("cdn_url_1_1.jpg"));
        assert!(content.contains("ip_location: \"上海\""));
        assert!(content.contains("# 公众号文章"));
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_update_clip_preserves_saved_at_and_chinese_fields() {
        let vault = temp_vault();
        let meta = ClipMeta {
            url: "https://example.com".to_string(),
            site_name: Some("X 站".to_string()),
            cover_url: Some("https://x.com/cover.jpg".to_string()),
            ..Default::default()
        };
        let r1 = write_clip(&vault, "原标题", "v1", &[], &meta)
            .await
            .unwrap();
        let parsed1 = io::read(&vault, &r1.relative_path).await.unwrap();
        let saved_at_orig = parsed1
            .frontmatter
            .unwrap()
            .extra
            .get("saved_at")
            .and_then(|v| v.as_str())
            .unwrap()
            .to_string();
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        update_clip(
            &vault,
            &r1.slug,
            "新标题",
            "v2",
            &["new".to_string()],
            &meta,
            None,
        )
        .await
        .unwrap();
        let parsed2 = io::read(&vault, &r1.relative_path).await.unwrap();
        let fm = parsed2.frontmatter.unwrap();
        let saved_at_new = fm.extra.get("saved_at").and_then(|v| v.as_str()).unwrap();
        assert_eq!(saved_at_orig, saved_at_new, "update_clip 应保留原 saved_at");
        assert!(parsed2.body.contains("v2"));
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_delete_clip_unlinks() {
        let vault = temp_vault();
        let meta = ClipMeta {
            url: "https://example.com".to_string(),
            ..Default::default()
        };
        let r = write_clip(&vault, "待删剪藏", "x", &[], &meta)
            .await
            .unwrap();
        let path = vault.join(&r.relative_path);
        assert!(path.exists());
        delete_clip(&vault, &r.slug).await.unwrap();
        assert!(!path.exists());
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_write_note_with_legacy_id() {
        // 搬迁脚本场景：传 legacy_id
        let vault = temp_vault();
        let r = write_note(&vault, "旧笔记", "vibe.db 来的", &[], Some(42))
            .await
            .unwrap();
        let parsed = io::read(&vault, &r.relative_path).await.unwrap();
        let fm = parsed.frontmatter.unwrap();
        assert_eq!(fm.extra.get("legacy_id").and_then(|v| v.as_i64()), Some(42));
        std::fs::remove_dir_all(&vault).ok();
    }
}
