//! Vault Tauri commands (T022 部分: vault_initialize / vault_get_config / vault_default_path)
//!
//! Phase 0 收缩范围：仅注册 vault_initialize 端到端必需的 3 个命令；
//! 其他 vault_*/ingest_*/skill_*/cat_*/tag_*/llm_* 命令等 LLM 架构讨论 + 后续 batch 再注册。

use serde::Deserialize;
use std::path::PathBuf;

use crate::vault::init::{self, ConflictResolution, VaultConfig};

#[derive(Debug, Deserialize)]
pub struct InitializeArgs {
    /// 选填：vault 路径绝对路径；不填用默认 `~/Documents/mewmo-vault/`
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
