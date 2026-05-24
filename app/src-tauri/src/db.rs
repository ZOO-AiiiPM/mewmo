use std::sync::Mutex;

use jieba_rs::Jieba;
use once_cell::sync::Lazy;
use rusqlite::Connection;
use tauri::{AppHandle, Manager};

pub struct Db {
    pub conn: Mutex<Connection>,
}

static JIEBA: Lazy<Jieba> = Lazy::new(Jieba::new);

/// 把任意文本用 jieba 切词 + 空格 join，存进 content_tokens 派生字段。
/// FTS5 用 unicode61 按空格切回各 jieba token —— 等效 jieba tokenizer，无 unsafe Rust。
pub fn tokenize(text: &str) -> String {
    JIEBA
        .cut(text, true)
        .into_iter()
        .filter(|t| !t.trim().is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

const MIGRATIONS: &[(u32, &str)] = &[
    (3, include_str!("migrations/v1_v2_v3.sql")),
    (4, include_str!("migrations/v4_search.sql")),
    (6, include_str!("migrations/v6_subscription.sql")),
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
    backfill_tokens(&mut conn)?;

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

        // v4 special: idempotent ALTER —— content_tokens 列可能因为之前 v4 跑了一半已存在
        if version == 4 {
            ensure_column(&tx, "notes", "content_tokens")?;
            ensure_column(&tx, "clips", "content_tokens")?;
        }

        tx.execute_batch(sql)
            .map_err(|e| format!("migration v{version}: {e}"))?;
        tx.pragma_update(None, "user_version", version as i64)
            .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        log::info!("DB migrated to v{version}");
    }

    Ok(())
}

/// 给 table 加 content_tokens 列，列已存在时静默跳过（不让 v4 重跑时 fail）
fn ensure_column(tx: &rusqlite::Transaction, table: &str, col: &str) -> Result<(), String> {
    let sql = format!("PRAGMA table_info({})", table);
    let mut stmt = tx.prepare(&sql).map_err(|e| e.to_string())?;
    let exists: bool = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .filter_map(Result::ok)
        .any(|name| name == col);
    drop(stmt);
    if !exists {
        let alter = format!(
            "ALTER TABLE {} ADD COLUMN {} TEXT NOT NULL DEFAULT ''",
            table, col
        );
        tx.execute(&alter, []).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 给 v4 之前已经存在的 notes / clips 内容跑 jieba 切词 backfill。
/// 检测条件：content_tokens 为空但 content_md 非空 —— 也就是 v4 migration 刚加的列还没填。
/// 跑过一次（所有非空 notes/clips 都 backfill）后续启动时 pending=0 直接 skip。
fn backfill_tokens(conn: &mut Connection) -> Result<(), String> {
    let pending_notes: i64 = conn
        .query_row(
            "SELECT count(*) FROM notes WHERE content_tokens = '' AND content_md != ''",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let pending_clips: i64 = conn
        .query_row(
            "SELECT count(*) FROM clips WHERE content_tokens = '' AND content_md != ''",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    if pending_notes == 0 && pending_clips == 0 {
        return Ok(());
    }

    log::info!(
        "jieba backfill: {} notes + {} clips",
        pending_notes,
        pending_clips
    );

    backfill_table(conn, "notes")?;
    backfill_table(conn, "clips")?;

    Ok(())
}

fn backfill_table(conn: &mut Connection, table: &str) -> Result<(), String> {
    let select_sql = format!(
        "SELECT id, content_md FROM {} WHERE content_tokens = '' AND content_md != ''",
        table
    );
    let update_sql = format!("UPDATE {} SET content_tokens = ?1 WHERE id = ?2", table);

    let rows: Vec<(i64, String)> = {
        let mut stmt = conn.prepare(&select_sql).map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?;
        iter.collect::<Result<_, _>>().map_err(|e| e.to_string())?
    };

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for (id, content) in rows {
        let tokens = tokenize(&content);
        tx.execute(&update_sql, rusqlite::params![tokens, id])
            .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}
