use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

pub struct Db {
    pub conn: Mutex<Connection>,
}

const MIGRATIONS: &[(u32, &str)] = &[
    (3, include_str!("migrations/v1_v2_v3.sql")),
    // (4, include_str!("migrations/v4_search_tags.sql")) — 由 T011/T019 加
];

pub fn init(app: &AppHandle) -> Result<Db, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir: {e}"))?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("create dir: {e}"))?;

    let path = dir.join("vibe.db");
    let mut conn = Connection::open(&path).map_err(|e| e.to_string())?;

    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;

    run_migrations(&mut conn)?;

    Ok(Db {
        conn: Mutex::new(conn),
    })
}

fn run_migrations(conn: &mut Connection) -> Result<(), String> {
    // 兼容 sqlx-managed 旧 DB：schema 已到 v3 但 user_version 仍为 0
    let has_sqlx: bool = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='_sqlx_migrations'",
            [],
            |_| Ok(true),
        )
        .unwrap_or(false);

    let current: i64 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| e.to_string())?;

    let start = if has_sqlx && current == 0 {
        log::info!("从 sqlx-managed DB 迁移：标记 user_version=3 跳过 v1_v2_v3");
        conn.pragma_update(None, "user_version", 3i64)
            .map_err(|e| e.to_string())?;
        3
    } else {
        current
    };

    for &(version, sql) in MIGRATIONS {
        if (version as i64) <= start {
            continue;
        }
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch(sql)
            .map_err(|e| format!("migration v{version}: {e}"))?;
        tx.pragma_update(None, "user_version", version as i64)
            .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        log::info!("DB migrated to v{version}");
    }

    Ok(())
}
