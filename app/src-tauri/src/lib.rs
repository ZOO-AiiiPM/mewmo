mod db;
mod commands;

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

// ── 剪藏：网页抓取 + HTML→Markdown ────────────────────────────────────────

#[derive(serde::Serialize)]
struct FetchedClip {
    url: String,
    title: String,
    content_md: String,
    excerpt: String,
    site_name: String,
    favicon_url: String,
    cover_image: String,
    author: String,
    published_at: String, // ISO 8601；为空表示没拿到
}

/// 从 scraper 元素递归生成 Markdown
fn element_to_md(el: scraper::ElementRef<'_>, base_url: &str) -> String {
    use scraper::node::Node;

    let tag = el.value().name();

    // 非内容元素直接跳过
    if matches!(
        tag,
        "script" | "style" | "nav" | "footer" | "header" | "aside"
            | "noscript" | "iframe" | "button" | "form" | "input"
            | "select" | "textarea"
    ) {
        return String::new();
    }

    // 递归处理所有子节点（含文本节点）
    let inner: String = (*el)
        .children()
        .map(|child| match child.value() {
            Node::Text(t) => {
                let s = t.trim();
                if s.is_empty() { String::new() } else { format!("{} ", s) }
            }
            Node::Element(_) => scraper::ElementRef::wrap(child)
                .map(|e| element_to_md(e, base_url))
                .unwrap_or_default(),
            _ => String::new(),
        })
        .collect();

    let inner_t = inner.trim().to_string();

    // 注意：<img> 没有 inner content 也要保留，所以在判空之前处理
    if tag == "img" {
        let alt = el.value().attr("alt").unwrap_or("");
        if let Some(src) = extract_img_src(el) {
            let resolved = resolve_url(&src, base_url);
            // alt 里如有 ] / [ 会破坏 Markdown，做最简单转义
            let safe_alt = alt.replace('[', " ").replace(']', " ");
            return format!("\n![{}]({})\n\n", safe_alt, resolved);
        }
        return String::new();
    }

    if inner_t.is_empty() {
        return String::new();
    }

    // 提取此元素的 inline style（任何 tag 都可能带 color / background-color，
    // 公众号常见 `<strong style="color:rgb(...)">` 模式必须在这里捕获，否则就丢了）
    let inline_style: Option<String> = el.value().attr("style")
        .map(sanitize_style)
        .filter(|s| !s.is_empty());

    // 把 inline content 用 <span style="..."> 包一层（仅在有可保留 style 时）
    let wrap = |s: &str| -> String {
        match &inline_style {
            Some(style) => format!("<span style=\"{}\">{}</span>", style, s),
            None => s.to_string(),
        }
    };

    match tag {
        "h1" => format!("# {}\n\n", wrap(&inner_t)),
        "h2" => format!("## {}\n\n", wrap(&inner_t)),
        "h3" => format!("### {}\n\n", wrap(&inner_t)),
        "h4" | "h5" | "h6" => format!("#### {}\n\n", wrap(&inner_t)),
        "p" => format!("{}\n\n", wrap(&inner_t)),
        "strong" | "b" => format!("**{}**", wrap(&inner_t)),
        "em" | "i" => format!("*{}*", wrap(&inner_t)),
        "code" if !inner_t.contains('\n') => format!("`{}`", inner_t),
        "pre" | "code" => format!("\n```\n{}\n```\n\n", inner_t),
        "blockquote" => {
            inner_t.lines().map(|l| format!("> {}\n", l)).collect::<String>() + "\n"
        }
        "a" => {
            let href = el.value().attr("href").unwrap_or("");
            if href.starts_with("javascript") || href.is_empty() {
                wrap(&inner_t)
            } else {
                let resolved = resolve_url(href, base_url);
                format!("[{}]({})", wrap(&inner_t), resolved)
            }
        }
        "li" => format!("- {}\n", wrap(&inner_t)),
        "ul" | "ol" => format!("{}\n", inner_t),
        "br" => "\n".to_string(),
        "hr" => "\n---\n\n".to_string(),
        // 颜色 / 高亮 / 下划线等纯视觉标签：透传 HTML（marked 会原样渲染）
        "span" => wrap(&inner_t),
        "font" => {
            // <font color="red"> 优先按 color 属性来；否则 fall through 到通用 wrap
            if let Some(color) = el.value().attr("color") {
                let safe_color = sanitize_color(color);
                if !safe_color.is_empty() {
                    return format!("<span style=\"color: {}\">{}</span>", safe_color, inner_t);
                }
            }
            wrap(&inner_t)
        }
        "mark" => format!("<mark>{}</mark>", inner_t),
        "u" => format!("<u>{}</u>", wrap(&inner_t)),
        "sub" => format!("<sub>{}</sub>", wrap(&inner_t)),
        "sup" => format!("<sup>{}</sup>", wrap(&inner_t)),
        // 容器（div / section / article 等）也走 wrap，让父级 inline style 不丢失
        _ => wrap(&inner),
    }
}

/// 抽取 img 元素真实 URL：data-src 优先（懒加载真值），其次 src，最后 srcset 第一项
/// 跳过明显的占位透明 gif（公众号 / 知乎用 1x1 透明 gif 占位）
fn extract_img_src(el: scraper::ElementRef<'_>) -> Option<String> {
    // 公众号 + 多数懒加载库
    for attr_name in &["data-src", "data-original", "data-lazy-src", "data-actualsrc"] {
        if let Some(s) = el.value().attr(attr_name) {
            let s = s.trim();
            if !s.is_empty() { return Some(s.to_string()); }
        }
    }
    // 普通 src（注意过滤占位透明 gif）
    if let Some(s) = el.value().attr("src") {
        let s = s.trim();
        if !s.is_empty()
            // 公众号占位 gif 通常 base64 R0lGODlh 开头 + 短长度
            && !(s.starts_with("data:image/gif;base64,R0lGOD") && s.len() < 200)
        {
            return Some(s.to_string());
        }
    }
    // 兜底：srcset 第一项（"url 1x, url2 2x" 格式）
    if let Some(srcset) = el.value().attr("srcset") {
        if let Some(first) = srcset.split(',').next() {
            let url = first.trim().split_whitespace().next().unwrap_or("");
            if !url.is_empty() { return Some(url.to_string()); }
        }
    }
    None
}

/// 把相对 URL（含 //host、/path、./path、纯 path）拼成绝对 URL
fn resolve_url(href: &str, base: &str) -> String {
    let h = href.trim();
    // 已是绝对地址 / data: / blob: → 原样返回
    if h.starts_with("http://") || h.starts_with("https://")
        || h.starts_with("data:") || h.starts_with("blob:")
        || h.starts_with("mailto:") || h.starts_with("tel:") {
        return h.to_string();
    }
    // 协议相对：//host/path
    if h.starts_with("//") {
        let scheme = base.split("://").next().unwrap_or("https");
        return format!("{}:{}", scheme, h);
    }
    // 解析 base 为 scheme + host + path
    let parts: Vec<&str> = base.splitn(2, "://").collect();
    if parts.len() != 2 { return h.to_string(); }
    let scheme = parts[0];
    let rest = parts[1];
    let host_end = rest.find('/').unwrap_or(rest.len());
    let host = &rest[..host_end];

    if h.starts_with('/') {
        return format!("{}://{}{}", scheme, host, h);
    }
    // 真·相对路径：取 base 的目录部分（最后一个 / 之前）
    let path = &rest[host_end..];
    let dir_end = path.rfind('/').unwrap_or(0);
    let dir = &path[..=dir_end.min(path.len().saturating_sub(1))];
    let dir = if dir.is_empty() { "/" } else { dir };
    format!("{}://{}{}{}", scheme, host, dir, h)
}

/// 只保留白名单 CSS 属性，过滤掉任何含可疑字符的值
fn sanitize_style(style: &str) -> String {
    let mut safe = Vec::new();
    for decl in style.split(';') {
        let parts: Vec<&str> = decl.splitn(2, ':').collect();
        if parts.len() != 2 { continue; }
        let prop = parts[0].trim().to_lowercase();
        let val = parts[1].trim();
        let val_lower = val.to_lowercase();
        // 黑名单：任何可能的注入字符或表达式
        if val.contains('"') || val.contains('<') || val.contains('>') || val.contains('\\')
            || val_lower.contains("javascript:")
            || val_lower.contains("expression(")
            || val_lower.contains("url(") {
            continue;
        }
        // 白名单 CSS 属性：只放视觉无害的
        if matches!(prop.as_str(),
            "color" | "background-color" | "background"
                | "font-weight" | "font-style" | "text-decoration") {
            safe.push(format!("{}: {}", prop, val));
        }
    }
    safe.join("; ")
}

/// <font color> 的属性值过滤（只允许字母数字 + # + rgb 函数字符）
fn sanitize_color(color: &str) -> String {
    color.chars()
        .filter(|c| c.is_alphanumeric()
            || *c == '#' || *c == '(' || *c == ')'
            || *c == ',' || *c == ' ' || *c == '%' || *c == '.')
        .collect::<String>()
        .trim()
        .to_string()
}

/// 按选择器优先级找正文，清理多余空行
fn extract_article_md(document: &scraper::Html, base_url: &str) -> String {
    // `#js_content` = 公众号正文容器；`.RichText` = 知乎专栏；其他通用语义标签兜底
    for sel_str in &["#js_content", ".RichText", "article", "[role='main']", "main",
                     ".article-body", ".post-content", ".entry-content", "body"] {
        let Ok(sel) = scraper::Selector::parse(sel_str) else { continue };
        let Some(el) = document.select(&sel).next() else { continue };
        let raw = element_to_md(el, base_url);
        if raw.trim().len() < 100 { continue }

        // 压缩连续空行为单个空行
        let mut out = String::new();
        let mut blank = 0usize;
        for line in raw.lines() {
            let t = line.trim();
            if t.is_empty() {
                blank += 1;
                if blank == 1 { out.push('\n'); }
            } else {
                blank = 0;
                out.push_str(t);
                out.push('\n');
            }
        }
        return out.trim().to_string();
    }
    String::new()
}

/// 提取 <meta property/name="..."> 的 content 值
fn meta_content(document: &scraper::Html, key: &str) -> Option<String> {
    for attr in &["property", "name"] {
        let q = format!("meta[{}='{}']", attr, key);
        let Ok(sel) = scraper::Selector::parse(&q) else { continue };
        if let Some(el) = document.select(&sel).next() {
            let s = el.value().attr("content").unwrap_or("").trim().to_string();
            if !s.is_empty() { return Some(s); }
        }
    }
    None
}

fn page_title(document: &scraper::Html) -> String {
    meta_content(document, "og:title")
        .or_else(|| {
            scraper::Selector::parse("title").ok().and_then(|sel| {
                document.select(&sel).next().map(|el| el.inner_html().trim().to_string())
            })
        })
        .unwrap_or_default()
}

fn url_domain(url: &str) -> String {
    url.split("://").nth(1)
        .and_then(|s| s.split('/').next())
        .map(|s| s.trim_start_matches("www.").to_string())
        .unwrap_or_default()
}

fn page_favicon(document: &scraper::Html, base_url: &str) -> String {
    for sel_str in &["link[rel='icon']", "link[rel='shortcut icon']", "link[rel='apple-touch-icon']"] {
        let Ok(sel) = scraper::Selector::parse(sel_str) else { continue };
        if let Some(el) = document.select(&sel).next() {
            let href = el.value().attr("href").unwrap_or("");
            if href.is_empty() { continue }
            if href.starts_with("http") { return href.to_string(); }
            if href.starts_with("//") { return format!("https:{}", href); }
            // 相对路径 → 拼 origin
            let origin = base_url.split("://").collect::<Vec<_>>();
            if origin.len() >= 2 {
                let host = origin[1].split('/').next().unwrap_or("");
                return format!("{}://{}{}", origin[0], host, href);
            }
        }
    }
    // 兜底 /favicon.ico
    let origin = base_url.split("://").collect::<Vec<_>>();
    if origin.len() >= 2 {
        let host = origin[1].split('/').next().unwrap_or("");
        return format!("{}://{}/favicon.ico", origin[0], host);
    }
    String::new()
}

/// 封面图：og:image 优先；twitter:image 备选
fn page_cover(document: &scraper::Html, base_url: &str) -> String {
    for key in &["og:image", "twitter:image", "og:image:url"] {
        if let Some(s) = meta_content(document, key) {
            return resolve_url(&s, base_url);
        }
    }
    String::new()
}

/// 作者：og 标准 → meta name → 公众号 #js_name 节点文本
fn page_author(document: &scraper::Html) -> String {
    for key in &["article:author", "og:article:author", "author", "twitter:creator"] {
        if let Some(s) = meta_content(document, key) {
            // 部分站点 article:author 是 URL，过滤掉 http 前缀的
            if !s.starts_with("http") {
                return s;
            }
        }
    }
    // 公众号专属：#js_name 是公众号名（最常见落点）
    for sel_str in &["#js_name", ".rich_media_meta_nickname", ".author"] {
        let Ok(sel) = scraper::Selector::parse(sel_str) else { continue };
        if let Some(el) = document.select(&sel).next() {
            let text: String = el.text().collect::<Vec<_>>().join("").trim().to_string();
            if !text.is_empty() { return text; }
        }
    }
    String::new()
}

/// 发布时间：article:published_time / itemprop=datePublished / time[datetime]
/// 返回 ISO 8601 字符串（不解析成 unix timestamp，前端 new Date() 处理）
fn page_published(document: &scraper::Html) -> String {
    for key in &["article:published_time", "og:published_time", "datePublished",
                 "publishdate", "publish_date", "date"] {
        if let Some(s) = meta_content(document, key) {
            return s;
        }
    }
    // <time datetime="..."> 标签
    if let Ok(sel) = scraper::Selector::parse("time[datetime]") {
        if let Some(el) = document.select(&sel).next() {
            if let Some(dt) = el.value().attr("datetime") {
                return dt.to_string();
            }
        }
    }
    // <meta itemprop="datePublished">
    if let Ok(sel) = scraper::Selector::parse("[itemprop='datePublished']") {
        if let Some(el) = document.select(&sel).next() {
            if let Some(c) = el.value().attr("content") {
                return c.to_string();
            }
            let text: String = el.text().collect::<Vec<_>>().join("").trim().to_string();
            if !text.is_empty() { return text; }
        }
    }
    String::new()
}

/// 取 URL 的 stem：去掉 query string 和 fragment（用于跨 CDN 参数匹配）
fn url_stem(url: &str) -> &str {
    let u = url.trim();
    let q = u.find(|c: char| c == '?' || c == '#').unwrap_or(u.len());
    &u[..q]
}

/// 图片去重的归一化 key
///
/// Why: 同一张图在 cover 与正文中常有微妙差异——
///   - query 不同（CDN 参数）：`?wx_fmt=jpeg` vs 无参数
///   - 末尾 size 标识不同：公众号 `/640`（缩略图）vs `/0`（原图），路径其余完全相同
/// 这两类差异都不该被视作不同图。比对前先归一化。
fn image_match_key(url: &str) -> String {
    let stem = url_stem(url);
    // 末尾若是 `/数字`（公众号尺寸标识），砍掉这一段
    if let Some(slash) = stem.rfind('/') {
        let tail = &stem[slash + 1..];
        if !tail.is_empty() && tail.chars().all(|c| c.is_ascii_digit()) {
            return stem[..slash].to_string();
        }
    }
    stem.to_string()
}

/// 正文图片去重：同时处理"cover 在正文重复"和"正文内部同图反复"两类问题
///
/// Why: 用 [[image_match_key]] 做归一化匹配，比单纯 url_stem 更宽松（覆盖公众号 size 变体）。
/// 把 cover_url 预置入 seen 集合，扫描 markdown 时同 key 的图片一律跳过——
/// 第一次见的保留，后续重复的删掉；cover 因为已预置，正文里所有匹配项都被砍。
fn dedup_images(content_md: &str, cover_url: &str) -> String {
    use std::collections::HashSet;
    let mut seen: HashSet<String> = HashSet::new();
    if !cover_url.is_empty() {
        let k = image_match_key(cover_url);
        if !k.is_empty() { seen.insert(k); }
    }

    let mut out = String::new();
    for line in content_md.lines() {
        let t = line.trim_start();
        if t.starts_with("![") {
            if let Some(open) = t.find("](") {
                let after = &t[open + 2..];
                if let Some(close) = after.find(')') {
                    let img_url = &after[..close];
                    let key = image_match_key(img_url);
                    if !key.is_empty() && !seen.insert(key) {
                        continue;
                    }
                }
            }
        }
        out.push_str(line);
        out.push('\n');
    }
    // 压掉因为删行可能产生的开头 / 连续空行
    let mut compact = String::new();
    let mut blank = 0usize;
    for line in out.lines() {
        if line.trim().is_empty() {
            blank += 1;
            if blank == 1 && !compact.is_empty() { compact.push('\n'); }
        } else {
            blank = 0;
            compact.push_str(line);
            compact.push('\n');
        }
    }
    compact.trim().to_string()
}

/// Tauri 命令：抓取 URL → 解析 → 返回结构化数据（前端负责写库）
#[tauri::command]
async fn fetch_clip(url: String) -> Result<FetchedClip, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {}", e))?;

    let resp = client.get(&url).send().await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let html = resp.text().await
        .map_err(|e| format!("读取响应失败: {}", e))?;

    let doc = scraper::Html::parse_document(&html);

    let title = page_title(&doc);
    let excerpt: String = meta_content(&doc, "og:description")
        .or_else(|| meta_content(&doc, "description"))
        .unwrap_or_default()
        .chars().take(300).collect();
    let site_name = meta_content(&doc, "og:site_name")
        .unwrap_or_else(|| url_domain(&url));
    let favicon_url = page_favicon(&doc, &url);
    let cover_image = page_cover(&doc, &url);
    let author = page_author(&doc);
    let published_at = page_published(&doc);
    let raw_content = extract_article_md(&doc, &url);
    let content_md = dedup_images(&raw_content, &cover_image);

    Ok(FetchedClip {
        url, title, content_md, excerpt, site_name, favicon_url,
        cover_image, author, published_at,
    })
}

/// 保存附件到 {app_data_dir}/attachments/{uuid}.{ext}
/// 返回相对路径 "attachments/{uuid}.{ext}"，前端写入 markdown
#[tauri::command]
fn save_attachment(
    app: tauri::AppHandle,
    ext: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    use tauri::Manager;

    // 白名单扩展名（防御性，前端已限定但后端兜底）
    let safe_ext = ext.trim_start_matches('.').to_lowercase();
    let allowed = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "heic"];
    if !allowed.contains(&safe_ext.as_str()) {
        return Err(format!("不支持的图片格式: {}", safe_ext));
    }

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("attachments");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let filename = format!("{}.{}", uuid::Uuid::new_v4(), safe_ext);
    let full_path = dir.join(&filename);
    std::fs::write(&full_path, &bytes).map_err(|e| e.to_string())?;

    Ok(format!("attachments/{}", filename))
}

/// 给前端用：返回 app_data_dir 的绝对路径，渲染时拼接相对路径再转成 webview URL
#[tauri::command]
fn get_app_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())
}

/// 删除 attachments/ 下没被任何笔记引用的孤儿文件
///
/// `referenced` 是前端从所有笔记 content_md 里正则提的相对路径数组
/// （形如 ["attachments/xxx.png", ...]），后端取 file_name 做集合比对。
///
/// 防御：60 秒内修改的文件跳过 —— 防止「用户刚 paste 图片还没 saveNote」时
/// cleanup 误删刚上传的文件。
#[tauri::command]
fn cleanup_orphan_attachments(
    app: tauri::AppHandle,
    referenced: Vec<String>,
) -> Result<usize, String> {
    use std::collections::HashSet;
    use std::path::Path;
    use std::time::SystemTime;
    use tauri::Manager;

    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("attachments");

    if !dir.exists() {
        return Ok(0);
    }

    let referenced_files: HashSet<String> = referenced
        .iter()
        .filter_map(|p| {
            Path::new(p)
                .file_name()
                .and_then(|n| n.to_str())
                .map(|s| s.to_string())
        })
        .collect();

    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let mut deleted = 0usize;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if referenced_files.contains(name) {
            continue;
        }
        // 跳过 60s 内修改的（race 防御：刚 paste 还没 commit 到 DB 的文件）
        if let Ok(meta) = entry.metadata() {
            if let Ok(modified) = meta.modified() {
                if let Ok(elapsed) = SystemTime::now().duration_since(modified) {
                    if elapsed.as_secs() < 60 {
                        continue;
                    }
                }
            }
        }
        // 送系统回收站（macOS ~/.Trash）而非物理删除，给用户反悔余地
        if trash::delete(&path).is_ok() {
            deleted += 1;
        }
    }

    Ok(deleted)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut builder = tauri::Builder::default();

  #[cfg(debug_assertions)]
  {
    builder = builder.plugin(tauri_plugin_mcp_bridge::init());
  }

  builder
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
        save_attachment,
        get_app_data_dir,
        cleanup_orphan_attachments,
        fetch_clip,
        commands::notes::list_notes,
        commands::notes::create_note,
        commands::notes::update_note,
        commands::notes::delete_note,
        commands::clips::list_clips,
        commands::clips::save_clip,
        commands::clips::update_clip,
        commands::clips::delete_clip,
        commands::search::search_all,
    ])
    .setup(|app| {
      use tauri::Manager;

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // 初始化数据库（rusqlite + 自管 migration，后续 jieba tokenizer 注册也走这里）
      let database = db::init(app.handle())
        .map_err(|e| format!("init db: {e}"))?;
      app.manage(database);

      // macOS 毛玻璃效果（Sidebar material 类似 Notes / Mail / Finder 的侧栏）
      #[cfg(target_os = "macos")]
      {
        let window = app.get_webview_window("main").expect("main window");
        apply_vibrancy(
          &window,
          NSVisualEffectMaterial::Sidebar,
          Some(NSVisualEffectState::FollowsWindowActiveState),
          Some(12.0),
        )
        .expect("apply vibrancy");
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn match_key_strips_query() {
        assert_eq!(
            image_match_key("https://cdn.example.com/a/b/c.jpg?w=640&h=480"),
            "https://cdn.example.com/a/b/c.jpg"
        );
    }

    #[test]
    fn match_key_strips_trailing_size_segment() {
        // 公众号典型：尾段是纯数字尺寸标识，归一化掉
        assert_eq!(
            image_match_key("https://mmbiz.qpic.cn/sz_mmbiz_jpg/abc/640"),
            "https://mmbiz.qpic.cn/sz_mmbiz_jpg/abc"
        );
        assert_eq!(
            image_match_key("https://mmbiz.qpic.cn/sz_mmbiz_jpg/abc/0?wx_fmt=jpeg"),
            "https://mmbiz.qpic.cn/sz_mmbiz_jpg/abc"
        );
    }

    #[test]
    fn match_key_keeps_filename_with_extension() {
        // 末尾不是纯数字（含字母 / 点），不动
        assert_eq!(
            image_match_key("https://cdn.example.com/foo/bar/image.jpg"),
            "https://cdn.example.com/foo/bar/image.jpg"
        );
    }

    #[test]
    fn dedup_removes_cover_appearing_in_body() {
        let body = "标题段\n\n![](https://cdn.example.com/cover.jpg)\n\n正文一些文字\n";
        let cover = "https://cdn.example.com/cover.jpg?v=2";
        let out = dedup_images(body, cover);
        assert!(!out.contains("cover.jpg"), "cover 应被从正文移除：{}", out);
        assert!(out.contains("正文一些文字"));
    }

    #[test]
    fn dedup_removes_cover_appearing_multiple_times() {
        // 同一封面在正文里出现 2 次都要删
        let body = "![](https://cdn.example.com/cover.jpg)\n\n中段\n\n![](https://cdn.example.com/cover.jpg?w=300)\n\n尾段";
        let cover = "https://cdn.example.com/cover.jpg";
        let out = dedup_images(body, cover);
        assert!(!out.contains("cover.jpg"), "两次 cover 都应被删：{}", out);
        assert!(out.contains("中段") && out.contains("尾段"));
    }

    #[test]
    fn dedup_handles_wechat_size_variants() {
        // cover 用 /640，正文用 /0 —— 同图不同 size
        let body = "![](https://mmbiz.qpic.cn/sz_mmbiz_jpg/abc/0?wx_fmt=jpeg)\n\n正文";
        let cover = "https://mmbiz.qpic.cn/sz_mmbiz_jpg/abc/640";
        let out = dedup_images(body, cover);
        assert!(!out.contains("mmbiz.qpic.cn"), "同图不同 size 应被识别为重复：{}", out);
    }

    #[test]
    fn dedup_collapses_repeated_inner_images() {
        // 正文内部同图重复，第二次起删除
        let body = "![](https://cdn.example.com/x.jpg)\n\n中段\n\n![](https://cdn.example.com/x.jpg)\n\n尾段";
        let out = dedup_images(body, "");
        let count = out.matches("x.jpg").count();
        assert_eq!(count, 1, "正文内部同图应只保留一次：{}", out);
    }

    #[test]
    fn dedup_preserves_distinct_images() {
        let body = "![](https://cdn.example.com/a.jpg)\n\n![](https://cdn.example.com/b.jpg)";
        let out = dedup_images(body, "");
        assert!(out.contains("a.jpg") && out.contains("b.jpg"), "不同图应保留：{}", out);
    }

    #[test]
    fn dedup_empty_cover_only_handles_inner_duplicates() {
        // 没 cover 时，正文内部仍要去重
        let body = "![](https://cdn.example.com/a.jpg)\n\n![](https://cdn.example.com/a.jpg?v=2)";
        let out = dedup_images(body, "");
        let count = out.matches("a.jpg").count();
        assert_eq!(count, 1, "cover 为空时正文内部仍应去重：{}", out);
    }
}
