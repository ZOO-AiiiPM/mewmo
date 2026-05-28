//! Slug 生成
//!
//! FR-016：中文保留 / 过滤 emoji+特殊字符+空格 / 长度限制 / 碰撞自动 `-2` 后缀
//!
//! 反先验决策（research.md §5）：拒绝 `slug` crate（依赖 deunicode 转拼音破坏中文保留）；
//! 选 `sanitize-filename` + 薄包装（emoji 过滤 + 长度限制 + 碰撞处理 + 中文保留）

use sanitize_filename::sanitize;

const MAX_SLUG_LEN: usize = 80;

/// 把任意标题字符串转成合法 slug
///
/// - 中文保留
/// - 跨平台不安全字符过滤（< > : " / \ | ? * 等，由 sanitize-filename）
/// - emoji / 其他符号过滤（自定义白名单）
/// - 空格 / · 替换为 `-`
/// - 连续 `-` 合并
/// - 长度截断（按 char count 不切坏中文 byte）
/// - 全空白 / 纯标点 → `untitled`
pub fn slugify(input: &str) -> String {
    let sanitized = sanitize(input.trim());

    let filtered: String = sanitized
        .chars()
        .filter_map(|c| {
            if is_slug_char(c) {
                Some(c)
            } else if c == ' ' || c == '·' || c == '\t' {
                Some('-')
            } else {
                None
            }
        })
        .collect();

    let collapsed = collapse_dashes(&filtered);
    let truncated: String = collapsed.chars().take(MAX_SLUG_LEN).collect();
    let trimmed = truncated.trim_matches('-');

    if trimmed.is_empty() {
        "untitled".to_string()
    } else {
        trimmed.to_string()
    }
}

fn is_slug_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '-' || c == '_' || is_cjk(c)
}

/// CJK Unified Ideographs + Extension A + Compatibility Ideographs
fn is_cjk(c: char) -> bool {
    let code = c as u32;
    matches!(
        code,
        0x4E00..=0x9FFF        // CJK Unified Ideographs
        | 0x3400..=0x4DBF      // CJK Extension A
        | 0xF900..=0xFAFF      // CJK Compatibility
        | 0x3040..=0x309F      // Hiragana
        | 0x30A0..=0x30FF      // Katakana
        | 0xAC00..=0xD7AF      // Hangul Syllables
    )
}

fn collapse_dashes(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut prev_dash = false;
    for c in s.chars() {
        if c == '-' {
            if !prev_dash {
                result.push(c);
            }
            prev_dash = true;
        } else {
            result.push(c);
            prev_dash = false;
        }
    }
    result
}

/// 给定 base slug 和已存在的 slug 列表，返回不冲突的 slug
///
/// 碰撞规则：`base` -> `base-2` -> `base-3` -> ...
pub fn unique_slug(base_slug: &str, existing: &[&str]) -> String {
    if !existing.contains(&base_slug) {
        return base_slug.to_string();
    }

    let mut n: u32 = 2;
    loop {
        let candidate = format!("{}-{}", base_slug, n);
        if !existing.iter().any(|e| *e == candidate) {
            return candidate;
        }
        n += 1;
    }
}

/// slug → 文件名（加 .md 后缀）
pub fn to_filename(slug: &str) -> String {
    format!("{}.md", slug)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chinese_preserved() {
        // 反 deunicode 验证：中文不应转拼音
        let result = slugify("AI 与知识管理");
        assert!(result.contains("与知识管理"), "got: {}", result);
        assert!(!result.contains("yu-zhi-shi"), "不应转拼音: {}", result);
    }

    #[test]
    fn test_emoji_filtered() {
        let result = slugify("Hello 🚀 World");
        assert!(!result.contains('🚀'));
        assert_eq!(result, "Hello-World");
    }

    #[test]
    fn test_unsafe_chars_filtered() {
        let result = slugify("foo<bar>:baz");
        assert!(!result.contains('<'));
        assert!(!result.contains('>'));
        assert!(!result.contains(':'));
    }

    #[test]
    fn test_space_to_dash_collapsed() {
        assert_eq!(slugify("hello   world  test"), "hello-world-test");
    }

    #[test]
    fn test_unique_slug_collision() {
        let existing = vec!["foo", "foo-2"];
        assert_eq!(unique_slug("foo", &existing), "foo-3");
    }

    #[test]
    fn test_unique_slug_no_collision() {
        let existing = vec!["bar"];
        assert_eq!(unique_slug("foo", &existing), "foo");
    }

    #[test]
    fn test_empty_default() {
        assert_eq!(slugify("   "), "untitled");
        assert_eq!(slugify("---"), "untitled");
        assert_eq!(slugify(""), "untitled");
    }

    #[test]
    fn test_long_truncated_at_char_boundary() {
        let long_input = "a".repeat(200);
        let result = slugify(&long_input);
        assert!(result.chars().count() <= MAX_SLUG_LEN);
    }

    #[test]
    fn test_long_chinese_no_byte_corruption() {
        // 100 个中文字（每字 3 byte UTF-8）
        let chinese = "中".repeat(100);
        let result = slugify(&chinese);
        // char count 受限，但不应在 byte 中切坏
        assert!(result.chars().count() <= MAX_SLUG_LEN);
        // 验证 result 是合法 UTF-8（如果切坏会 panic）
        let _: &str = &result;
    }

    #[test]
    fn test_to_filename() {
        assert_eq!(to_filename("foo-bar"), "foo-bar.md");
    }
}
