use feed_rs::model::Entry;
use scraper::{Html, Selector};

pub fn cover_from_entry(entry: &Entry, content_html: &str) -> String {
    wechat_cover(content_html)
        .or_else(|| media_thumbnail(entry))
        .or_else(|| media_content_image(entry))
        .or_else(|| html_meta_image(content_html))
        .or_else(|| first_body_image(content_html))
        .unwrap_or_default()
}

fn wechat_cover(html: &str) -> Option<String> {
    for key in ["cdn_url_1_1", "msg_cdn_url", "cover"] {
        let needle_sq = format!("{}: '", key);
        let needle_dq = format!("{}: \"", key);
        if let Some(value) = extract_between(html, &needle_sq, "'") {
            return non_empty(value);
        }
        if let Some(value) = extract_between(html, &needle_dq, "\"") {
            return non_empty(value);
        }
        let var_sq = format!("var {} = '", key);
        let var_dq = format!("var {} = \"", key);
        if let Some(value) = extract_between(html, &var_sq, "'") {
            return non_empty(value);
        }
        if let Some(value) = extract_between(html, &var_dq, "\"") {
            return non_empty(value);
        }
    }
    None
}

fn media_thumbnail(entry: &Entry) -> Option<String> {
    entry
        .media
        .iter()
        .flat_map(|m| m.thumbnails.iter())
        .map(|t| t.image.uri.trim().to_string())
        .find(|url| !url.is_empty())
}

fn media_content_image(entry: &Entry) -> Option<String> {
    entry
        .media
        .iter()
        .flat_map(|m| m.content.iter())
        .filter(|c| {
            // Explicit image MIME type
            if c.content_type
                .as_ref()
                .map(|t| t.as_str().to_ascii_lowercase().starts_with("image/"))
                .unwrap_or(false)
            {
                return true;
            }
            // No content_type: infer from URL extension (handles WordPress <enclosure>
            // without type attr, and <media:content medium="image"> where feed-rs
            // doesn't preserve the medium attr in content_type)
            if c.content_type.is_none() {
                if let Some(url) = c.url.as_ref() {
                    return url_looks_like_image(url.as_str());
                }
            }
            false
        })
        .filter_map(|c| c.url.as_ref().map(|u| u.to_string()))
        .find(|url| !url.trim().is_empty())
}

/// Check if a URL path ends with a common image extension.
fn url_looks_like_image(url: &str) -> bool {
    // Strip query string and fragment before checking extension
    let path = url.split('?').next().unwrap_or(url);
    let path = path.split('#').next().unwrap_or(path);
    let lower = path.to_ascii_lowercase();
    lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".png")
        || lower.ends_with(".gif")
        || lower.ends_with(".webp")
        || lower.ends_with(".avif")
        || lower.ends_with(".svg")
}

fn html_meta_image(html: &str) -> Option<String> {
    if html.trim().is_empty() {
        return None;
    }
    let document = Html::parse_fragment(html);
    let selector = Selector::parse("meta[property], meta[name]").ok()?;
    for meta in document.select(&selector) {
        let value = meta.value();
        let key = value
            .attr("property")
            .or_else(|| value.attr("name"))
            .unwrap_or_default();
        if matches!(
            key,
            "og:image" | "og:image:url" | "twitter:image" | "twitter:image:src"
        ) {
            if let Some(content) = value.attr("content") {
                if let Some(url) = non_empty(content) {
                    return Some(url);
                }
            }
        }
    }
    None
}

fn first_body_image(html: &str) -> Option<String> {
    if html.trim().is_empty() {
        return None;
    }
    let document = Html::parse_fragment(html);
    let selector = Selector::parse("img[src]").ok()?;

    // Only consider images that appear in the first ~1500 bytes of HTML.
    // This prevents grabbing a random inline photo from deep in the article body
    // as the "cover" when the article starts with text paragraphs.
    // WordPress/ifanr pattern: articles with a hero/banner image always place it
    // in the first <p> or <div> at the very top.
    let early_html_end = html
        .char_indices()
        .take_while(|(idx, _)| *idx < 1500)
        .last()
        .map(|(idx, ch)| idx + ch.len_utf8())
        .unwrap_or(html.len());

    document
        .select(&selector)
        .filter(|img| {
            let el = img.value();

            // Check if this image appears early in the document.
            // Use the src attribute's position in the original HTML as a proxy.
            if let Some(src) = el.attr("src") {
                if let Some(pos) = html.find(src) {
                    if pos > early_html_end {
                        return false;
                    }
                }
            }

            // Skip tiny images: emoji, icons, spacers (width or height <= 72px)
            if let Some(w) = el.attr("width").and_then(|v| v.parse::<u32>().ok()) {
                if w <= 72 {
                    return false;
                }
            }
            if let Some(h) = el.attr("height").and_then(|v| v.parse::<u32>().ok()) {
                if h <= 72 {
                    return false;
                }
            }
            // Skip WordPress emoji (class="wp-smiley") and tracking pixels
            let class = el.attr("class").unwrap_or_default();
            if class.contains("wp-smiley") || class.contains("emoji") {
                return false;
            }
            // Skip data URIs and tracking pixels by src pattern
            let src = el.attr("src").unwrap_or_default();
            if src.starts_with("data:") || src.contains("/emoji/") || src.contains("pixel") {
                return false;
            }
            true
        })
        .filter_map(|img| img.value().attr("src"))
        .find_map(non_empty)
}

fn extract_between<'a>(haystack: &'a str, start: &str, end: &str) -> Option<&'a str> {
    let s = haystack.find(start)? + start.len();
    let rest = &haystack[s..];
    let e = rest.find(end)?;
    Some(&rest[..e])
}

fn non_empty(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::cover_from_entry;
    use feed_rs::model::{Entry, Image, MediaContent, MediaObject, MediaThumbnail};

    fn entry_with_html(html: &str) -> (Entry, String) {
        (Entry::default(), html.to_string())
    }

    #[test]
    fn extracts_wechat_cdn_url_1_1_cover() {
        let (entry, html) = entry_with_html(
            r#"<script>var msg_cdn_url = ""; var something = { cdn_url_1_1: 'https://mmbiz.qpic.cn/cover/640?wx_fmt=jpeg' };</script>"#,
        );

        assert_eq!(
            cover_from_entry(&entry, &html),
            "https://mmbiz.qpic.cn/cover/640?wx_fmt=jpeg"
        );
    }

    #[test]
    fn prefers_media_thumbnail_before_body_image() {
        let mut entry = Entry::default();
        let mut media = MediaObject::default();
        media.thumbnails.push(MediaThumbnail {
            image: Image {
                uri: "https://cdn.example.com/media-thumb.jpg".to_string(),
                title: None,
                link: None,
                width: None,
                height: None,
                description: None,
            },
            time: None,
        });
        entry.media.push(media);

        assert_eq!(
            cover_from_entry(&entry, r#"<p><img src="https://cdn.example.com/body.jpg"></p>"#),
            "https://cdn.example.com/media-thumb.jpg"
        );
    }

    #[test]
    fn uses_media_image_content_when_thumbnail_missing() {
        let mut entry = Entry::default();
        let mut media = MediaObject::default();
        media.content.push(MediaContent {
            url: Some("https://cdn.example.com/media-content.jpg".parse().unwrap()),
            content_type: Some("image/jpeg".parse().unwrap()),
            height: None,
            width: None,
            duration: None,
            size: None,
            rating: None,
        });
        entry.media.push(media);

        assert_eq!(
            cover_from_entry(&entry, ""),
            "https://cdn.example.com/media-content.jpg"
        );
    }

    #[test]
    fn uses_open_graph_image_before_body_image() {
        let (entry, html) = entry_with_html(
            r#"<meta property="og:image" content="https://cdn.example.com/og.jpg"><img src="https://cdn.example.com/body.jpg">"#,
        );

        assert_eq!(cover_from_entry(&entry, &html), "https://cdn.example.com/og.jpg");
    }

    #[test]
    fn falls_back_to_first_body_image() {
        let (entry, html) = entry_with_html(
            r#"<p>hello</p><img src="https://cdn.example.com/body.jpg">"#,
        );

        assert_eq!(cover_from_entry(&entry, &html), "https://cdn.example.com/body.jpg");
    }

    #[test]
    fn media_content_without_type_uses_image_url_extension() {
        // WordPress <enclosure> without type attr, or <media:content medium="image">
        // where feed-rs doesn't preserve the medium attr → content_type is None
        let mut entry = Entry::default();
        let mut media = MediaObject::default();
        media.content.push(MediaContent {
            url: Some("https://s3.ifanr.com/wp-content/uploads/featured.jpg".parse().unwrap()),
            content_type: None,
            height: None,
            width: None,
            duration: None,
            size: None,
            rating: None,
        });
        entry.media.push(media);

        assert_eq!(
            cover_from_entry(&entry, r#"<p><img src="https://s3.ifanr.com/body.jpg" width="800"></p>"#),
            "https://s3.ifanr.com/wp-content/uploads/featured.jpg"
        );
    }

    #[test]
    fn media_content_without_type_skips_non_image_url() {
        // Enclosure pointing to audio/video should not be treated as cover
        let mut entry = Entry::default();
        let mut media = MediaObject::default();
        media.content.push(MediaContent {
            url: Some("https://cdn.example.com/podcast.mp3".parse().unwrap()),
            content_type: None,
            height: None,
            width: None,
            duration: None,
            size: None,
            rating: None,
        });
        entry.media.push(media);

        assert_eq!(
            cover_from_entry(&entry, r#"<img src="https://cdn.example.com/body.jpg">"#),
            "https://cdn.example.com/body.jpg"
        );
    }

    #[test]
    fn skips_emoji_and_tiny_images_in_body() {
        // ifanr 早报 pattern: first images are wp-smiley emoji (30x30),
        // real cover comes after
        let (entry, html) = entry_with_html(
            r#"<p><img src="https://s.w.org/images/core/emoji/11/72x72/1f525.png" alt="🔥" class="wp-smiley" style="height: 1em;" /></p><p><img src="https://s3.ifanr.com/cover.jpg" width="1280" height="720" /></p>"#,
        );

        assert_eq!(
            cover_from_entry(&entry, &html),
            "https://s3.ifanr.com/cover.jpg"
        );
    }

    #[test]
    fn skips_images_with_small_explicit_dimensions() {
        let (entry, html) = entry_with_html(
            r#"<img src="https://cdn.example.com/icon.png" width="30" height="30"><img src="https://cdn.example.com/real.jpg" width="800" height="600">"#,
        );

        assert_eq!(
            cover_from_entry(&entry, &html),
            "https://cdn.example.com/real.jpg"
        );
    }

    #[test]
    fn returns_empty_when_images_only_deep_in_body() {
        // If article starts with several paragraphs of text and images only appear
        // deep in the body, we should NOT pick a random inline photo as cover.
        // Use 2000 chars of padding to push the image beyond the 1500-byte threshold.
        let padding = "a".repeat(2000);
        let html = format!(
            r#"<p>{}</p><img src="https://cdn.example.com/deep-body.jpg" width="800">"#,
            padding
        );
        let (entry, html) = (Entry::default(), html);

        assert_eq!(cover_from_entry(&entry, &html), "");
    }

    #[test]
    fn picks_image_when_near_top_of_body() {
        // Image in the first paragraph (well within 1500 bytes) should be picked
        let (entry, html) = entry_with_html(
            r#"<p><img class="alignnone size-full" src="https://s3.ifanr.com/banner.jpg" width="959" height="539" /></p><p>Article content goes here...</p>"#,
        );

        assert_eq!(
            cover_from_entry(&entry, &html),
            "https://s3.ifanr.com/banner.jpg"
        );
    }
}

#[cfg(test)]
mod werss_test {
    use super::*;

    #[test]
    fn test_werss_feed_enclosure() {
        let xml = r#"<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel><title>Test</title>
<item>
<id>2396019580-3009371077_1</id>
<title>Test Article</title>
<description>desc</description>
<guid>https://mp.weixin.qq.com/s/xxx</guid>
<enclosure url="https://mmbiz.qpic.cn/cover_image.jpg" length="0" type="image/jpeg"></enclosure>
<content:encoded>&lt;p&gt;hello&lt;/p&gt;&lt;img src="https://mmbiz.qpic.cn/body_first_image.jpg"&gt;</content:encoded>
</item>
</channel></rss>"#;
        
        let feed = feed_rs::parser::parse(xml.as_bytes()).unwrap();
        let entry = &feed.entries[0];
        
        println!("entry.id = {:?}", entry.id);
        println!("entry.media count = {}", entry.media.len());
        for (i, m) in entry.media.iter().enumerate() {
            println!("  media[{}] thumbnails: {:?}", i, m.thumbnails.len());
            println!("  media[{}] content: {:?}", i, m.content.iter().map(|c| (c.url.as_ref().map(|u| u.to_string()), c.content_type.as_ref().map(|t| t.to_string()))).collect::<Vec<_>>());
        }
        
        let content_html = entry.content.as_ref().and_then(|c| c.body.clone()).unwrap_or_default();
        let cover = cover_from_entry(entry, &content_html);
        println!("cover_from_entry result = {:?}", cover);
    }
}
