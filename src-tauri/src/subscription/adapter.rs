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

    let entries: Vec<FetchedEntry> = feed.entries.into_iter().filter_map(map_entry).collect();

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
        e.id
    } else {
        e.links.first()?.href.clone()
    };

    let title = e.title.map(|t| t.content).unwrap_or_default();

    // content 优先取 content.body，其次 summary
    let content_html = e
        .content
        .as_ref()
        .and_then(|c| c.body.clone())
        .or_else(|| e.summary.as_ref().map(|s| s.content.clone()))
        .unwrap_or_default();

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

    Some(FetchedEntry {
        guid,
        title,
        content_html,
        excerpt,
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
