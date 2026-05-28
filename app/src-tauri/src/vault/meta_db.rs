//! vault-meta.db 衍生 SQLite
//!
//! Phase 0 边界：仅 schema 占位 + migration 跑得起。表里**不写**任何数据。
//! 数据填充由 Phase 1+ 各模块负责（feed-stream / activity / notification / cat memory metadata）。
//!
//! 文件位置：`<vault>/.mewmo/vault-meta.db`
//! 与 vibe.db 并存——v1 阶段两 DB 不混用（架构文档 §7.2）。

use rusqlite::Connection;
use std::path::Path;
use std::sync::Mutex;

/// vault-meta.db schema migrations
///
/// 仿 db.rs `MIGRATIONS` 风格 + `pragma user_version` 跟踪。
/// 每条 migration 在事务内跑，失败回滚。
const MIGRATIONS: &[(u32, &str)] = &[
    (1, include_str!("../migrations/vault_meta_v1.sql")),
];

pub struct VaultMetaDb {
    pub conn: Mutex<Connection>,
}

/// 在 `<vault>/.mewmo/vault-meta.db` 初始化 schema + 跑 migrations
pub fn init(vault_path: &Path) -> Result<VaultMetaDb, String> {
    let mewmo_dir = vault_path.join(".mewmo");
    std::fs::create_dir_all(&mewmo_dir).map_err(|e| format!("create .mewmo dir: {e}"))?;

    let db_path = mewmo_dir.join("vault-meta.db");
    let mut conn = Connection::open(&db_path).map_err(|e| format!("open vault-meta.db: {e}"))?;

    conn.pragma_update(None, "foreign_keys", "ON")
        .map_err(|e| e.to_string())?;
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|e| e.to_string())?;

    run_migrations(&mut conn)?;

    Ok(VaultMetaDb {
        conn: Mutex::new(conn),
    })
}

fn run_migrations(conn: &mut Connection) -> Result<(), String> {
    let current: i64 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| e.to_string())?;

    for &(version, sql) in MIGRATIONS {
        if (version as i64) <= current {
            continue;
        }
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        tx.execute_batch(sql)
            .map_err(|e| format!("migration v{version}: {e}"))?;
        tx.pragma_update(None, "user_version", version as i64)
            .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        log::info!("vault-meta.db migrated to v{version}");
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_vault() -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let pid = std::process::id();
        let path = std::env::temp_dir().join(format!("mewmo-meta-test-{}-{}", pid, nanos));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn test_init_creates_db_and_runs_v1() {
        let vault = temp_vault();
        let db = init(&vault).unwrap();
        let conn = db.conn.lock().unwrap();
        let v: i64 = conn
            .pragma_query_value(None, "user_version", |r| r.get(0))
            .unwrap();
        assert_eq!(v, 1);

        // 验证 4 张表都存在
        for table in &["feed_stream", "activity_events", "notification_log", "cat_memory_metadata"] {
            let exists: bool = conn
                .query_row(
                    "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1",
                    [table],
                    |_| Ok(true),
                )
                .unwrap_or(false);
            assert!(exists, "表 {} 应存在", table);
        }

        std::fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn test_idempotent_init() {
        let vault = temp_vault();
        let _db1 = init(&vault).unwrap();
        let _db2 = init(&vault).unwrap();
        // 不应报错——migration 检查 user_version 跳过已应用的
        std::fs::remove_dir_all(&vault).ok();
    }
}
