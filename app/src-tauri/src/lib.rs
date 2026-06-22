mod attachments;
mod clip_fetch;
mod clip_parser;
mod commands;
mod db;
mod subscription;
mod vault;

#[cfg(target_os = "macos")]
use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(debug_assertions)]
    let builder = tauri::Builder::default().plugin(tauri_plugin_mcp_bridge::init());

    #[cfg(not(debug_assertions))]
    let builder = tauri::Builder::default();

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(clip_fetch::FetchChannels::default())
        .invoke_handler(tauri::generate_handler![
            attachments::save_attachment,
            attachments::get_app_data_dir,
            attachments::cleanup_orphan_attachments,
            clip_fetch::fetch_clip,
            clip_fetch::webview_html_done,
            commands::notes::list_notes,
            commands::notes::get_note,
            commands::notes::create_note,
            commands::notes::update_note,
            commands::notes::delete_note,
            commands::notes::pin_note,
            commands::notes::import_html_note,
            commands::notes::import_html_dir,
            commands::notes::import_html_paths,
            commands::clips::list_clips,
            commands::clips::get_clip,
            commands::clips::save_clip,
            commands::clips::update_clip,
            commands::clips::delete_clip,
            commands::clips::migrate_clips_to_html,
            commands::search::search_all,
            commands::subscriptions::add_subscription,
            commands::subscriptions::list_sources_with_unread,
            commands::subscriptions::list_entries_for_source,
            commands::subscriptions::mark_entry_read,
            commands::subscriptions::delete_source,
            commands::subscriptions::refresh_all_subscriptions,
            commands::subscriptions::should_auto_refresh_on_startup,
            commands::vault::vault_initialize,
            commands::vault::vault_get_config,
            commands::vault::vault_default_path,
            commands::vault::vault_read,
            commands::vault::vault_write_atomic,
            commands::vault::vault_list,
            commands::knowledge_base::kb_list,
            commands::knowledge_base::kb_create,
            commands::knowledge_base::kb_delete,
            commands::knowledge_base::kb_update_meta,
            commands::knowledge_base::kb_folder_create,
            commands::knowledge_base::kb_folder_rename,
            commands::knowledge_base::kb_folder_delete,
            commands::knowledge_base::kb_list_contents,
            commands::knowledge_base::kb_create_note,
            commands::knowledge_base::kb_create_clip,
            commands::knowledge_base::kb_get_clip,
            commands::knowledge_base::kb_import_folder,
            commands::knowledge_base::kb_move_note,
            commands::knowledge_base::kb_import_note,
            commands::knowledge_base::kb_move_folder,
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
            let database = db::init(app.handle()).map_err(|e| format!("init db: {e}"))?;
            app.manage(database);

            // spec 003: 初始化 vault-meta.db（含 v2 FTS5 schema） + 启动时全 reindex
            // 仅在 vault 已配置 + 路径存在时初始化（dogfood 简化：watcher 留 spec 004，
            // 用户外部编辑后下次启动 reindex 保一致；mewmo 内部写入由 commands 层显式调 search::index_one）
            if let Ok(Some(vault_config)) = vault::init::read_config() {
                let vault_path = std::path::PathBuf::from(&vault_config.vault_path);
                if vault_path.exists() {
                    match vault::meta_db::init(&vault_path) {
                        Ok(meta_db) => {
                            // 启动时全 reindex（dogfood 阶段 1k 篇规模约 1s，可接受）
                            let vp = vault_path.clone();
                            let conn_ref = &meta_db.conn;
                            if let Err(e) = tauri::async_runtime::block_on(async {
                                vault::search::build_index(&vp, conn_ref).await
                            }) {
                                log::warn!(
                                    "vault::search::build_index 启动重建失败（非致命）: {e}"
                                );
                            }
                            app.manage(meta_db);

                            // spec 004：启动 vault 文件 watcher——外部（skill / Obsidian）写入
                            // wiki/notes 或 raw/clips 后，增量更新 FTS + emit vault-changed 通知前端
                            // 刷新列表，免重启。失败非致命（退化为「重启才更新」的旧行为）。
                            if let Err(e) =
                                vault::watcher::start(app.handle().clone(), vault_path.clone())
                            {
                                log::warn!("vault watcher 启动失败（非致命，回退到重启更新）: {e}");
                            }
                        }
                        Err(e) => {
                            log::warn!("vault-meta.db init 失败（非致命，搜索将不可用）: {e}");
                        }
                    }
                }
            }

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
