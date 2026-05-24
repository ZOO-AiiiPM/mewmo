// Tauri command 入口：thin wrapper over adapter::fetch_one
//
// 设计原则：Rust 端只做"网络抓取 + feed 解析"，不碰 db。
// 前端拿到 FetchOutcome 后自己 SQL 写库（与既有 note/clip CRUD 一致）。

use crate::subscription::adapter::{self, FetchOutcome};

#[tauri::command]
pub async fn fetch_subscription_source(
    url: String,
    if_none_match: Option<String>,
    if_modified_since: Option<String>,
) -> Result<FetchOutcome, String> {
    adapter::fetch_one(
        &url,
        if_none_match.as_deref(),
        if_modified_since.as_deref(),
    )
    .await
}
