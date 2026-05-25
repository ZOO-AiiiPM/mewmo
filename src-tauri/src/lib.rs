mod attachments;
mod clip_fetch;
mod clip_parser;
mod commands;
mod db;
mod subscription;

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
            commands::clips::list_clips,
            commands::clips::get_clip,
            commands::clips::save_clip,
            commands::clips::update_clip,
            commands::clips::delete_clip,
            commands::search::search_all,
            commands::subscriptions::add_subscription,
            commands::subscriptions::list_sources_with_unread,
            commands::subscriptions::list_entries_for_source,
            commands::subscriptions::mark_entry_read,
            commands::subscriptions::delete_source,
            commands::subscriptions::refresh_all_subscriptions,
            commands::subscriptions::should_auto_refresh_on_startup,
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
