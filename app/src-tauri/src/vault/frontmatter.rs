//! YAML frontmatter 解析
//!
//! 不变式 I5（损坏不致命）：解析失败返回 (None, 原文) 而不是报错——让上层降级处理
//! 不变式 I6（跨语言兼容）：与 Python PyYAML safe_load + OrderedDict 对齐
//!
//! 设计选择（research.md §13）：
//! - 用 gray_matter 0.3（54k 月下载，2025-07，Rust 真空地带）
//! - 不引入额外 yaml crate；写入端用字符串模板（caller 主动构造已知 well-formed 字段）

use gray_matter::engine::YAML;
use gray_matter::Matter;
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// 解析结果
pub struct ParsedFrontmatter {
    /// frontmatter（None = 无 frontmatter 块或解析失败，I5 降级）
    pub frontmatter: Option<FrontmatterData>,
    /// 正文（已剥离 frontmatter 块）
    pub body: String,
}

/// frontmatter 已识别字段（spec data-model.md §3 Wiki 页 schema）
///
/// 未识别字段进 `extra`，保证用户自定义字段不丢失。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct FrontmatterData {
    /// `type` 是 Rust keyword，用 `kind` 别名
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "type")]
    pub kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub created: Option<String>, // ISO 8601 字符串（避免 chrono 强依赖；运行时 parse）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub author: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,

    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default)]
    pub related: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub due: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub slug: Option<String>,

    /// 未识别字段（用户自定义 / 未来扩展）—— 跨语言保序（serde_json::Map 在 preserve_order feature 下保序，否则按插入顺序）
    #[serde(flatten)]
    pub extra: serde_json::Map<String, Value>,
}

/// 解析含可选 frontmatter 的 markdown 字符串
///
/// 不变式 I5：损坏不报错，降级返回 `frontmatter: None` + 原文 `body`
pub fn parse(content: &str) -> ParsedFrontmatter {
    let matter = Matter::<YAML>::new();

    // gray_matter 0.3 的 parse 返回 Result<ParsedEntity, Error>
    // 整体解析失败时降级返回原文（不变式 I5）
    let parsed = match matter.parse(content) {
        Ok(p) => p,
        Err(e) => {
            log::warn!("frontmatter 整体 parse 失败（降级返回原文）: {e}");
            return ParsedFrontmatter {
                frontmatter: None,
                body: content.to_string(),
            };
        }
    };

    let frontmatter =
        parsed.data.and_then(
            |pod: gray_matter::Pod| match pod.deserialize::<FrontmatterData>() {
                Ok(data) => Some(data),
                Err(e) => {
                    log::warn!("frontmatter 反序列化失败（降级为无 frontmatter）: {e}");
                    None
                }
            },
        );

    ParsedFrontmatter {
        frontmatter,
        body: parsed.content,
    }
}

/// 把 frontmatter YAML 字符串 + 正文组装回完整 markdown
///
/// caller 自行构造 well-formed YAML 字段（避免引入 yaml serializer 依赖）。
/// 例如 caller 用 `format!("type: user-note\ncreated: {ts}\n...")` 拼好后传入。
pub fn build(frontmatter_yaml: &str, body: &str) -> String {
    format!(
        "---\n{}\n---\n\n{}",
        frontmatter_yaml.trim_matches('\n'),
        body.trim_start_matches('\n')
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_basic_frontmatter() {
        let content = "---\ntype: user-note\ncreated: 2026-05-27T10:00:00Z\nauthor: cat\ntags: [ai, knowledge]\n---\n\n# Hello\n\nbody text";
        let parsed = parse(content);
        let fm = parsed.frontmatter.expect("应解析出 frontmatter");
        assert_eq!(fm.kind, Some("user-note".to_string()));
        assert_eq!(fm.author, Some("cat".to_string()));
        assert_eq!(fm.tags, vec!["ai", "knowledge"]);
        assert!(parsed.body.contains("# Hello"));
    }

    #[test]
    fn test_parse_no_frontmatter() {
        let content = "no frontmatter here\n\njust body";
        let parsed = parse(content);
        assert!(parsed.frontmatter.is_none());
        assert_eq!(parsed.body, content);
    }

    #[test]
    fn test_parse_corrupt_yaml_graceful() {
        // 不变式 I5：损坏 frontmatter 不报错
        let content = "---\ntype: { unclosed brace\n---\nbody";
        let parsed = parse(content);
        // 损坏时 frontmatter 是 None，body 仍可访问
        assert!(parsed.frontmatter.is_none());
    }

    #[test]
    fn test_extra_fields_preserved() {
        let content = "---\ntype: user-note\ncustom_field: my-value\nanother_one: 42\n---\nbody";
        let parsed = parse(content);
        let fm = parsed.frontmatter.expect("应解析");
        assert!(fm.extra.contains_key("custom_field"));
        assert!(fm.extra.contains_key("another_one"));
    }

    #[test]
    fn test_build_roundtrip() {
        let yaml = "type: user-note\ncreated: 2026-05-27T10:00:00Z";
        let body = "# Title\n\ncontent";
        let combined = build(yaml, body);
        assert!(combined.starts_with("---\ntype: user-note"));
        assert!(combined.contains("---\n\n# Title"));
    }
}
