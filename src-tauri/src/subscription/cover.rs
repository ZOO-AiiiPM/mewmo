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
            c.content_type
                .as_ref()
                .map(|t| t.as_str().to_ascii_lowercase().starts_with("image/"))
                .unwrap_or(false)
        })
        .filter_map(|c| c.url.as_ref().map(|u| u.to_string()))
        .find(|url| !url.trim().is_empty())
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
    document
        .select(&selector)
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
}
