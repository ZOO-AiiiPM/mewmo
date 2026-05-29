//! Vault Tauri commands
//!
//! Phase 0 收缩范围：
//! - 初始化：vault_initialize / vault_get_config / vault_default_path
//! - IO（cat agent 批 1 加）：vault_read / vault_write_atomic / vault_list
//!
//! 其他 ingest_*/skill_*/cat_*/tag_*/llm_* 命令等后续 batch 实施。

use serde::Deserialize;
use std::path::{Path, PathBuf};

use crate::vault::init::{self, ConflictResolution, VaultConfig};
use crate::vault::io::{self, EntrySummary, ReadResult};

#[derive(Debug, Deserialize)]
pub struct InitializeArgs {
    /// 选填：vault 路径（绝对路径）；不填用默认 `~/Documents/mewmo-vault/`
    pub vault_path: Option<String>,
    /// 选填：路径冲突时如何处理；"use-existing"（默认）/ "abort"
    pub conflict_resolution: Option<String>,
}

/// FR-001~006: 创建 vault 三层结构 + 写默认占位 + 写 ~/.mewmo/config.json
#[tauri::command]
pub fn vault_initialize(args: InitializeArgs) -> Result<VaultConfig, String> {
    let path = args
        .vault_path
        .map(PathBuf::from)
        .unwrap_or_else(init::default_vault_path);

    let conflict = match args.conflict_resolution.as_deref() {
        Some("abort") => ConflictResolution::Abort,
        _ => ConflictResolution::UseExisting,
    };

    init::initialize(&path, conflict).map_err(|e| e.to_string())
}

/// 读 ~/.mewmo/config.json（应用启动 / 设置页用）
#[tauri::command]
pub fn vault_get_config() -> Result<Option<VaultConfig>, String> {
    init::read_config().map_err(|e| e.to_string())
}

/// 取默认 vault 路径建议（首次启动 dialog 默认值）
#[tauri::command]
pub fn vault_default_path() -> String {
    init::default_vault_path().to_string_lossy().to_string()
}

// ============================================================================
// vault IO commands（cat agent 批 1）
// ============================================================================

/// 拿 vault root 路径——从 ~/.mewmo/config.json 读出来；缺则报 VAULT_NOT_INITIALIZED
fn require_vault_path() -> Result<PathBuf, String> {
    let config = init::read_config()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "VAULT_NOT_INITIALIZED".to_string())?;
    Ok(PathBuf::from(&config.vault_path))
}

/// 读 vault 内文件 + 解析 frontmatter
#[tauri::command]
pub async fn vault_read(relative_path: String) -> Result<ReadResult, String> {
    let vault_path = require_vault_path()?;
    io::read(&vault_path, &relative_path)
        .await
        .map_err(|e| e.to_string())
}

/// 原子写 vault 内文件
#[tauri::command]
pub async fn vault_write_atomic(
    relative_path: String,
    content: String,
    expected_mtime: Option<u64>,
) -> Result<u64, String> {
    let vault_path = require_vault_path()?;
    io::write_atomic(&vault_path, &relative_path, &content, expected_mtime)
        .await
        .map_err(|e| e.to_string())
}

/// list-summary-loading：列 vault 内 .md 文件摘要
#[tauri::command]
pub async fn vault_list(
    relative_path: String,
    recursive: Option<bool>,
    filter_type: Option<String>,
) -> Result<Vec<EntrySummary>, String> {
    let vault_path = require_vault_path()?;
    io::list(
        &vault_path,
        &relative_path,
        recursive.unwrap_or(false),
        filter_type.as_deref(),
    )
    .await
    .map_err(|e| e.to_string())
}

#[allow(dead_code)]
fn _unused_path_typecheck(_p: &Path) {}
