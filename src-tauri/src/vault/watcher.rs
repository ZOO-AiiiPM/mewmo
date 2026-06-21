//! vault 文件 watcher（spec 004）：监听 `wiki/notes` + `raw/clips`，外部写入后增量更新
//! FTS + 通知前端刷新列表，免去重启。
//!
//! 为什么需要：用户通过 skill（或 Obsidian 等）直接往 vault 磁盘写 `.md`/`.html`，绕过 app
//! commands 层。运行中的 app 只在启动时扫一次 `list_notes` + `build_index`，运行期不看文件系统，
//! 所以外部新增/改动要重启才出现。这里用 notify-debouncer-full 监听文件系统补上这一环。
//!
//! 设计要点：
//! - 用 `path.exists()` 判「增量索引」还是「删索引」，天然兼容原子保存（temp+rename）的 rename 配对。
//! - HTML 笔记不进 FTS（与 `search::build_index` 一致——HTML 标签喂 jieba 会污染索引），只 emit 刷列表。
//! - 自身写入也会触发本 watcher → 冗余刷新，但索引幂等、前端合并刷新保边，无害。
//! - emit `vault-changed` 事件，payload 标明 notes/clips 哪类变了，前端按需刷新对应列表。

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use notify_debouncer_full::{
    new_debouncer,
    notify::{RecommendedWatcher, RecursiveMode},
    DebounceEventResult, Debouncer, RecommendedCache,
};
use tauri::{AppHandle, Emitter, Manager};

use crate::vault::{meta_db::VaultMetaDb, query, search};

/// 前端 `vault-changed` 事件 payload：标明本批变更涉及笔记 / 剪藏哪类，前端只刷对应列表。
#[derive(Clone, serde::Serialize)]
struct VaultChangedPayload {
    notes: bool,
    clips: bool,
}

/// 持有 Debouncer 保活：drop 即停止监听，所以 manage 进 Tauri state 活到进程退出。
/// 用 Mutex 包一层让它满足 Tauri state 的 Send + Sync 约束；运行期不再访问（仅保活）。
struct WatcherState(#[allow(dead_code)] Mutex<Debouncer<RecommendedWatcher, RecommendedCache>>);

/// 启动 vault 文件 watcher，并把 Debouncer manage 进 app state 保活。
/// 失败返回 Err 让 caller 决定是否致命（本项目按非致命 warn 处理）。
pub fn start(app: AppHandle, vault_path: PathBuf) -> Result<(), String> {
    let notes_dir = vault_path.join("wiki/notes");
    let clips_dir = vault_path.join("raw/clips");

    let handler_app = app.clone();
    let handler_vault = vault_path.clone();
    let mut debouncer = new_debouncer(
        Duration::from_millis(500),
        None,
        move |result: DebounceEventResult| {
            let events = match result {
                Ok(evs) => evs,
                Err(errs) => {
                    log::warn!("vault watcher 事件错误（非致命）: {errs:?}");
                    return;
                }
            };
            log::info!("vault watcher 收到 {} 个事件", events.len());
            // 一批事件里同一文件可能多次出现 → 先去重受影响路径
            let mut paths: BTreeSet<PathBuf> = BTreeSet::new();
            for ev in &events {
                for p in &ev.event.paths {
                    log::info!("  事件路径: {:?} kind={:?}", p, ev.event.kind);
                    paths.insert(p.clone());
                }
            }
            handle_paths(&handler_app, &handler_vault, paths);
        },
    )
    .map_err(|e| format!("new_debouncer: {e}"))?;

    // 目录可能还没创建（vault 刚 init）；不存在不算致命，watch 失败仅 warn。
    if notes_dir.exists() {
        if let Err(e) = debouncer.watch(&notes_dir, RecursiveMode::NonRecursive) {
            log::warn!("watch wiki/notes 失败: {e}");
        }
    }
    if clips_dir.exists() {
        if let Err(e) = debouncer.watch(&clips_dir, RecursiveMode::NonRecursive) {
            log::warn!("watch raw/clips 失败: {e}");
        }
    }

    app.manage(WatcherState(Mutex::new(debouncer)));
    log::info!("vault watcher 已启动：监听 wiki/notes + raw/clips");
    Ok(())
}

/// 处理一批去重后的变更路径：分流到 notes / clips，增量更新 FTS，最后 emit 一次事件。
fn handle_paths(app: &AppHandle, vault: &Path, paths: BTreeSet<PathBuf>) {
    let notes_dir = vault.join("wiki/notes");
    let clips_dir = vault.join("raw/clips");
    // meta_db 未 managed（vault init 失败）时跳过 FTS，但仍 emit 让前端刷列表（列表读磁盘不依赖 FTS）。
    let meta = app.try_state::<VaultMetaDb>();

    let mut notes_changed = false;
    let mut clips_changed = false;

    for path in paths {
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase());
        let stem = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };

        // —— 笔记：wiki/notes/*.md（进 FTS）或 *.html（只刷列表，不进 FTS）——
        if path.starts_with(&notes_dir) {
            match ext.as_deref() {
                Some("md") => {
                    notes_changed = true;
                    if let Some(meta) = &meta {
                        if path.exists() {
                            match tauri::async_runtime::block_on(query::get_note(vault, &stem)) {
                                Ok(full) => {
                                    if let Err(e) = search::index_one_note(&meta.conn, &full) {
                                        log::warn!("watcher 索引笔记 {stem} 失败: {e}");
                                    }
                                }
                                Err(e) => log::warn!("watcher 读笔记 {stem} 失败: {e}"),
                            }
                        } else if let Err(e) = search::delete_index_note(&meta.conn, &stem) {
                            log::warn!("watcher 删笔记索引 {stem} 失败: {e}");
                        }
                    }
                }
                // HTML 笔记不进 FTS（与 build_index 一致），仅触发列表刷新
                Some("html") => notes_changed = true,
                _ => {}
            }
            continue;
        }

        // —— 剪藏：raw/clips/*.md ——
        if path.starts_with(&clips_dir) && ext.as_deref() == Some("md") {
            clips_changed = true;
            if let Some(meta) = &meta {
                if path.exists() {
                    match tauri::async_runtime::block_on(query::get_clip(vault, &stem)) {
                        Ok(full) => {
                            if let Err(e) = search::index_one_clip(&meta.conn, &full) {
                                log::warn!("watcher 索引剪藏 {stem} 失败: {e}");
                            }
                        }
                        Err(e) => log::warn!("watcher 读剪藏 {stem} 失败: {e}"),
                    }
                } else if let Err(e) = search::delete_index_clip(&meta.conn, &stem) {
                    log::warn!("watcher 删剪藏索引 {stem} 失败: {e}");
                }
            }
        }
    }

    if notes_changed || clips_changed {
        let payload = VaultChangedPayload {
            notes: notes_changed,
            clips: clips_changed,
        };
        if let Err(e) = app.emit("vault-changed", payload) {
            log::warn!("emit vault-changed 失败: {e}");
        }
    }
}
