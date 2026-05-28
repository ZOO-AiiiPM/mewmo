/**
 * Vault Tauri command wrapper（前端调后端）
 *
 * Phase 0 收缩范围：3 个 commands（vault_initialize / vault_get_config / vault_default_path）。
 * 其他 vault_* / ingest_* / cat_* / skill_* / tag_* / llm_* commands 等后续 batch 实施。
 *
 * 见 contracts/tauri-commands.md §1（Vault 初始化与配置）+ §2（Vault 文件 IO）
 */

import { invoke } from '@tauri-apps/api/core';

/** ~/.mewmo/config.json 内容（与 Rust 端 vault::init::VaultConfig 对齐） */
export type VaultConfig = {
  vault_path: string;
  schema_version: number;
  initialized_at: string;
  active_persona: string;
};

/** vault_initialize 入参 */
export type InitializeArgs = {
  /** 选填 vault 路径（绝对路径）；不填用 ~/Documents/mewmo-vault/ */
  vault_path?: string;
  /** 路径冲突时如何处理：use-existing（默认）/ abort */
  conflict_resolution?: 'use-existing' | 'abort';
};

/**
 * 创建 vault 三层结构 + 写默认占位 + 写 ~/.mewmo/config.json
 *
 * 已存在 mewmo vault（带 marker）→ 加载现有 config
 * 已存在非空目录但**不是** mewmo vault → 抛 VAULT_PATH_CONFLICT
 */
export async function initializeVault(args: InitializeArgs = {}): Promise<VaultConfig> {
  return await invoke<VaultConfig>('vault_initialize', { args });
}

/** 读 ~/.mewmo/config.json（应用启动 / 设置页用） */
export async function getVaultConfig(): Promise<VaultConfig | null> {
  return await invoke<VaultConfig | null>('vault_get_config');
}

/** 取默认 vault 路径建议（首次启动 dialog 默认值） */
export async function getDefaultVaultPath(): Promise<string> {
  return await invoke<string>('vault_default_path');
}
