// 订阅源抓取 + 解析
//
// 仅做"网络层"——拿到 URL + 可选条件请求头 → 返回结构化 feed 内容，不碰 sqlite。
// db CRUD 全部由前端 lib/subscription.ts 直接 SQL 完成（与 note / clip 一致）。
//
// 去重策略：仅 ETag / If-Modified-Since 一层（HTTP 标准条件请求）。
// 未做 content-hash 兜底——v1 每天 1 次抓取，多解析一次 RSS XML 不是性能瓶颈。

use feed_rs::parser;
use reqwest::header::{
    CACHE_CONTROL, ETAG, IF_MODIFIED_SINCE, IF_NONE_MATCH, LAST_MODIFIED, PRAGMA, USER_AGENT,
};
use serde::{Deserialize, Serialize};
use std::time::Duration;

use crate::subscription::cover::cover_from_entry;

#[derive(Debug, Serialize, Deserialize)]
pub struct FetchedFeedMeta {
    pub title: String,
    pub description: String,
    pub site_url: Option<String>,
    pub favicon_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FetchedEntry {
    pub guid: String,
    pub title: String,
    pub content_html: String,
    pub excerpt: String,
    pub cover_image: String,
    pub link: Option<String>,
    pub author: String,
    pub published_at: Option<i64>, // unix epoch seconds
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "status")]
pub enum FetchOutcome {
    #[serde(rename = "not_modified")]
    NotModified,
    #[serde(rename = "updated")]
    Updated {
        feed_meta: FetchedFeedMeta,
        entries: Vec<FetchedEntry>,
        etag: Option<String>,
        last_modified: Option<String>,
    },
}

const MAX_CONTENT_BYTES: usize = 5 * 1024 * 1024; // 5MB
const REQUEST_TIMEOUT_SECS: u64 = 30;

pub async fn fetch_one(
    url: &str,
    if_none_match: Option<&str>,
    if_modified_since: Option<&str>,
) -> Result<FetchOutcome, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| format!("CLIENT_BUILD_FAILED: {}", e))?;

    let mut req = client
        .get(url)
        .header(USER_AGENT, "mewmo/0.1 (+https://github.com/...)");

    let mut sent_conditional = false;
    if let Some(etag) = if_none_match {
        if !etag.is_empty() {
            req = req.header(IF_NONE_MATCH, etag);
            sent_conditional = true;
        }
    }
    if let Some(lm) = if_modified_since {
        if !lm.is_empty() {
            req = req.header(IF_MODIFIED_SINCE, lm);
            sent_conditional = true;
        }
    }

    // 首次抓取（无条件头）时主动加 no-cache —— 应对部分 CDN/反向代理即使没收到
    // If-None-Match 也激进返回 304 的非标准行为，强制 server 给真实 body。
    if !sent_conditional {
        req = req
            .header(CACHE_CONTROL, "no-cache")
            .header(PRAGMA, "no-cache");
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("FETCH_FAILED: {}", e))?;

    let status = resp.status();

    // 304 Not Modified —— 内容没变，无 body
    if status == reqwest::StatusCode::NOT_MODIFIED {
        return Ok(FetchOutcome::NotModified);
    }

    if !status.is_success() {
        return Err(format!("FETCH_FAILED: HTTP {}", status));
    }

    // 提取响应头里的 ETag / Last-Modified（下次条件请求用）
    let etag = resp
        .headers()
        .get(ETAG)
        .and_then(|v| v.to_str().ok())
        .map(String::from);
    let last_modified = resp
        .headers()
        .get(LAST_MODIFIED)
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("FETCH_FAILED: read body: {}", e))?;

    // feed-rs 解析（统一处理 RSS 0.9-2.0 / Atom 1.0 / JSON Feed）
    let feed = parser::parse(&bytes[..]).map_err(|e| format!("PARSE_FAILED: {}", e))?;

    let feed_meta = FetchedFeedMeta {
        title: feed
            .title
            .as_ref()
            .map(|t| t.content.clone())
            .unwrap_or_default(),
        description: feed
            .description
            .as_ref()
            .map(|d| d.content.clone())
            .unwrap_or_default(),
        site_url: feed
            .links
            .iter()
            .find(|l| l.rel.as_deref() == Some("alternate") || l.rel.is_none())
            .map(|l| l.href.clone()),
        // RSS 2.0 <image><url> 和 Atom <icon>/<logo> 都被 feed-rs 映射进来。
        // 优先 icon（专门设计为小尺寸 favicon），fallback logo（banner，能用就用）。
        favicon_url: feed
            .icon
            .as_ref()
            .map(|i| i.uri.clone())
            .or_else(|| feed.logo.as_ref().map(|l| l.uri.clone())),
    };

    let entries: Vec<FetchedEntry> = feed
        .entries
        .into_iter()
        .filter_map(map_entry)
        .filter(|e| e.content_html.len() > 100)
        .collect();

    Ok(FetchOutcome::Updated {
        feed_meta,
        entries,
        etag,
        last_modified,
    })
}

fn map_entry(e: feed_rs::model::Entry) -> Option<FetchedEntry> {
    // guid = entry.id；空时 fallback 到 link；都没有则跳过这条 entry
    let guid = if !e.id.is_empty() {
        e.id.clone()
    } else {
        e.links.first()?.href.clone()
    };

    let title = e.title.as_ref().map(|t| t.content.clone()).unwrap_or_default();

    // content 优先取 content.body，其次 summary
    let content_html = e
        .content
        .as_ref()
        .and_then(|c| c.body.clone())
        .or_else(|| e.summary.as_ref().map(|s| s.content.clone()))
        .unwrap_or_default();

    // 剥离微信文章尾部 boilerplate（赞赏弹窗、底部元数据栏等）
    let content_html = strip_wechat_boilerplate(&content_html);

    // 去掉正文中与 entry title 重复的首个标题元素
    let content_html = strip_duplicate_title(&content_html, &title);

    // 反恶意 feed：截断超大 content
    let content_html = if content_html.len() > MAX_CONTENT_BYTES {
        let safe_end = content_html
            .char_indices()
            .take_while(|(idx, _)| *idx < MAX_CONTENT_BYTES)
            .last()
            .map(|(idx, ch)| idx + ch.len_utf8())
            .unwrap_or(0);
        let mut truncated = content_html[..safe_end].to_string();
        truncated.push_str("\n\n...[content truncated]");
        truncated
    } else {
        content_html
    };

    // excerpt = summary 优先，否则从 content 抽前 200 字（去 HTML 标签）
    let excerpt = if let Some(s) = &e.summary {
        s.content.chars().take(200).collect::<String>()
    } else {
        strip_html_tags(&content_html).chars().take(200).collect()
    };

    let link = e.links.first().map(|l| l.href.clone());

    let author = e
        .authors
        .first()
        .map(|a| a.name.clone())
        .unwrap_or_default();

    // published 优先，updated 兜底
    let published_at = e.published.or(e.updated).map(|dt| dt.timestamp());

    let cover_image = cover_from_entry(&e, &content_html);

    Some(FetchedEntry {
        guid,
        title,
        content_html,
        excerpt,
        cover_image,
        link,
        author,
        published_at,
    })
}

/// 极简 HTML 标签剥离（用于生成 excerpt，不追求严格——只是预览用）
fn strip_html_tags(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for ch in s.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// 剥离微信公众号文章 HTML 中的 boilerplate 区域：
/// - 赞赏弹窗（class 含 "reward"）
/// - 底部元数据栏（class 含 "rich_media_meta_list"）
/// - 隐藏元素（display:none）
/// 非微信内容直接原样返回（无特征时不做修改）。
fn strip_wechat_boilerplate(html: &str) -> String {
    if html.is_empty() {
        return String::new();
    }
    // 快速路径：不含微信特征 class 的内容跳过
    if !html.contains("reward") && !html.contains("rich_media_meta_list") {
        return html.to_string();
    }

    use scraper::{Html, Selector};

    let document = Html::parse_fragment(html);
    let boilerplate = Selector::parse(
        r#"[class*="reward"], [class*="rich_media_meta_list"], [style*="display:none"], [style*="display: none"]"#
    ).unwrap();

    let remove_ids: std::collections::HashSet<ego_tree::NodeId> = document
        .select(&boilerplate)
        .map(|el| el.id())
        .collect();

    if remove_ids.is_empty() {
        return html.to_string();
    }

    let mut out = String::with_capacity(html.len());
    serialize_tree(document.tree.root(), &remove_ids, &mut out);
    out
}

fn serialize_tree(
    node: ego_tree::NodeRef<scraper::Node>,
    skip: &std::collections::HashSet<ego_tree::NodeId>,
    out: &mut String,
) {
    use scraper::Node;
    for child in node.children() {
        if skip.contains(&child.id()) {
            continue;
        }
        match child.value() {
            Node::Text(t) => out.push_str(t),
            Node::Element(el) => {
                out.push('<');
                out.push_str(el.name());
                for (name, value) in el.attrs() {
                    out.push(' ');
                    out.push_str(name);
                    out.push_str("=\"");
                    out.push_str(&value.replace('"', "&quot;"));
                    out.push('"');
                }
                out.push('>');
                serialize_tree(child, skip, out);
                let void_tags = ["br", "hr", "img", "input", "meta", "link", "area", "col"];
                if !void_tags.contains(&el.name()) {
                    out.push_str("</");
                    out.push_str(el.name());
                    out.push('>');
                }
            }
            Node::Fragment => {
                serialize_tree(child, skip, out);
            }
            _ => {}
        }
    }
}

/// 去掉正文 HTML 中与 entry title 重复的首个标题（h1-h3）。
/// 微信/WordPress 等 CMS 会在 content 里重复包含文章标题，
/// 而 EntryReader 已经单独渲染了 entry.title，导致视觉上出现两遍。
fn strip_duplicate_title(html: &str, title: &str) -> String {
    if html.is_empty() || title.is_empty() {
        return html.to_string();
    }

    use scraper::{Html, Selector};

    let document = Html::parse_fragment(html);
    let heading_sel = Selector::parse("h1, h2, h3").unwrap();

    // 只检查前 3 个 heading，避免误删正文中碰巧同名的小节标题
    for el in document.select(&heading_sel).take(3) {
        let text: String = el.text().collect::<String>();
        let text_trimmed = text.trim();
        if text_trimmed == title.trim() {
            let mut skip = std::collections::HashSet::new();
            skip.insert(el.id());
            let mut out = String::with_capacity(html.len());
            serialize_tree(document.tree.root(), &skip, &mut out);
            return out;
        }
    }
    html.to_string()
}

#[cfg(test)]
mod tests {
    use super::strip_wechat_boilerplate;

    #[test]
    fn strips_reward_and_meta_sections() {
        let html = r#"<p>正文内容</p><div class="reward_area"><p>微信扫一扫赞赏作者</p></div><div class="rich_media_meta_list"><span>北京</span></div>"#;
        let cleaned = strip_wechat_boilerplate(html);
        assert!(!cleaned.contains("赞赏"));
        assert!(!cleaned.contains("北京"));
        assert!(cleaned.contains("正文内容"));
    }

    #[test]
    fn strips_display_none_elements() {
        // display:none 元素在微信页面里通常同时有 reward 或 meta class；
        // 此处测试带 reward class + display:none 的组合
        let html = r#"<p>可见内容</p><div class="reward_popup" style="display:none;"><p>赞赏弹窗</p></div>"#;
        let cleaned = strip_wechat_boilerplate(html);
        assert!(cleaned.contains("可见内容"));
        assert!(!cleaned.contains("赞赏弹窗"));
    }

    #[test]
    fn passthrough_non_wechat_content() {
        let html = "<p>Normal RSS article</p><img src=\"test.jpg\">";
        let cleaned = strip_wechat_boilerplate(html);
        assert_eq!(cleaned, html);
    }

    #[test]
    fn strips_duplicate_title_from_content() {
        use super::strip_duplicate_title;
        let html = r#"<h1 class="rich_media_title">老程序员也有春天</h1><p>正文开始</p>"#;
        let result = strip_duplicate_title(html, "老程序员也有春天");
        assert!(!result.contains("老程序员也有春天</h1>"));
        assert!(result.contains("正文开始"));
    }

    #[test]
    fn keeps_non_matching_title() {
        use super::strip_duplicate_title;
        let html = r#"<h2>不同的标题</h2><p>正文</p>"#;
        let result = strip_duplicate_title(html, "文章标题");
        assert!(result.contains("不同的标题"));
    }
}
