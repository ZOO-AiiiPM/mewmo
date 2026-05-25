use std::collections::HashMap;
use std::sync::Mutex;

// ── 剪藏：webview 后台抓取（绕开 zse-ck 等 JS 反爬）─────────────────────────

/// request_id → oneshot sender；隐藏 webview 加载完成后通过 webview_html_done
/// 命令把 HTML 传回，对应 sender 唤醒等待的 fetch_via_webview。
#[derive(Default)]
pub(crate) struct FetchChannels(Mutex<HashMap<String, tokio::sync::oneshot::Sender<String>>>);

use crate::clip_parser::{parse_clip_html, FetchedClip};

/// 判断 URL 是否需要走 webview 抓取（站点有 JS 反爬，reqwest 拿不到正文）。
/// 当前**禁用**：知乎在 zse-ck 之外还有未登录强制登录墙 modal，且远程 origin
/// 通过 capability remote.urls 注入 __TAURI_INTERNALS__ 实测仍 timeout（init_script
/// 跑了但 invoke 没回到 Rust）。后续待续做，相关代码（fetch_via_webview/
/// FetchChannels/webview_html_done/capabilities/fetcher.json）保留作为脚手架。
fn needs_browser_fetch(_url: &str) -> bool {
    false
}

/// reqwest 直抓（无 JS 渲染）—— 公众号 / 普通博客 / 静态页面用这个
async fn fetch_via_reqwest(url: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {}", e))?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    resp.text()
        .await
        .map_err(|e| format!("读取响应失败: {}", e))
}

/// webview 抓取：开一个 invisible 的 WebviewWindow 加载 URL，让其执行 JS（包括
/// 知乎 zse-ck 反爬挑战），加载完成后注入的 init_script 把 outerHTML 通过
/// webview_html_done 传回 Rust。30s 超时兜底。
///
/// **当前未启用**（needs_browser_fetch 永远 false）。保留作为续做脚手架，
/// 待解决：远程 origin 实测 init_script 跑了但 invoke 没回 Rust（capability
/// remote.urls 配了仍 timeout）+ 知乎登录墙 modal 拦截未登录用户。
#[allow(dead_code)]
async fn fetch_via_webview(app: tauri::AppHandle, url: String) -> Result<String, String> {
    use tauri::Manager;

    let request_id = uuid::Uuid::new_v4().to_string();
    let label = format!("fetcher-{}", request_id.replace('-', ""));

    let (tx, rx) = tokio::sync::oneshot::channel::<String>();
    {
        let state = app.state::<FetchChannels>();
        let mut map = state.0.lock().map_err(|e| e.to_string())?;
        map.insert(request_id.clone(), tx);
    }

    // 注入到隐藏 webview 的 page context：等正文容器出现 / 或 15s 上限后回传 HTML。
    // 用 __TAURI_INTERNALS__.invoke 直接调 Rust command（capabilities/fetcher.json
    // 已经把这个 webview label + 知乎 origin 加白名单）。
    let init_script = format!(
        r#"
        (function() {{
            const REQ_ID = "{req_id}";
            const SELECTORS = ['.RichText', '.Post-RichText', 'article', '#js_content', 'main', '[data-zop]'];
            const MAX_WAIT_MS = 15000;
            const POLL_MS = 300;
            let sent = false;
            const start = Date.now();

            function send(reason) {{
                if (sent) return;
                sent = true;
                try {{
                    window.__TAURI_INTERNALS__.invoke('webview_html_done', {{
                        requestId: REQ_ID,
                        html: document.documentElement ? document.documentElement.outerHTML : ''
                    }});
                }} catch (e) {{
                    console.error('[fetcher] invoke failed:', e, reason);
                }}
            }}

            const interval = setInterval(() => {{
                const ready = SELECTORS.some(sel => {{
                    const el = document.querySelector(sel);
                    return el && el.textContent && el.textContent.trim().length > 50;
                }});
                if (ready) {{
                    clearInterval(interval);
                    send('ready');
                }} else if (Date.now() - start > MAX_WAIT_MS) {{
                    clearInterval(interval);
                    send('timeout');
                }}
            }}, POLL_MS);
        }})();
        "#,
        req_id = request_id,
    );

    let parsed_url = url
        .parse::<tauri::Url>()
        .map_err(|e| format!("URL 解析失败: {}", e))?;

    tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::External(parsed_url))
        .visible(false)
        .focused(false)
        .skip_taskbar(true)
        .inner_size(800.0, 600.0)
        .initialization_script(&init_script)
        .build()
        .map_err(|e| format!("创建抓取 webview 失败: {}", e))?;

    let html_result = tokio::time::timeout(std::time::Duration::from_secs(30), rx).await;

    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.close();
    }

    match html_result {
        Ok(Ok(html)) => Ok(html),
        Ok(Err(_)) => Err("webview 通道已关闭".into()),
        Err(_) => {
            let state = app.state::<FetchChannels>();
            if let Ok(mut map) = state.0.lock() {
                map.remove(&request_id);
            }
            Err("webview 抓取超时（30s）".into())
        }
    }
}

/// webview 内的 JS 通过 __TAURI_INTERNALS__.invoke 把 outerHTML 传回时进入这里。
/// 用 request_id 找到对应的 oneshot sender 唤醒 fetch_via_webview。
#[tauri::command]
pub(crate) fn webview_html_done(
    request_id: String,
    html: String,
    state: tauri::State<'_, FetchChannels>,
) -> Result<(), String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(tx) = map.remove(&request_id) {
        let _ = tx.send(html);
    }
    Ok(())
}

/// Tauri 命令：抓取 URL → 解析 → 返回结构化数据（前端负责写库）。
/// 知乎等 JS 反爬站点走 webview 渲染抓取，其余 reqwest 直抓。
#[tauri::command]
pub(crate) async fn fetch_clip(app: tauri::AppHandle, url: String) -> Result<FetchedClip, String> {
    let html = if needs_browser_fetch(&url) {
        fetch_via_webview(app, url.clone()).await?
    } else {
        fetch_via_reqwest(&url).await?
    };
    parse_clip_html(&html, url)
}
