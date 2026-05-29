/**
 * Vault Tauri command wrapper（前端调后端）
 *
 * Phase 0 收缩范围：
 * - 初始化：vault_initialize / vault_get_config / vault_default_path
 * - IO（cat agent 批 1）：vault_read / vault_write_atomic / vault_list
 *
 * 其他 vault_* / ingest_* / cat_* / skill_* / tag_* / llm_* commands 等后续 batch 实施。
 *
 * 见 contracts/tauri-commands.md §1（Vault 初始化与配置）+ §2（Vault 文件 IO）
 */

import { invoke } from '@tauri-apps/api/core';
import type { FrontmatterData } from './frontmatter';

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

/** 读结果（与 Rust 端 vault::io::ReadResult 对齐） */
export type ReadResult = {
  frontmatter: FrontmatterData | null;
  body: string;
  mtime: number;
};

/** 列表项摘要（list-summary-loading mode，与 Rust 端 EntrySummary 对齐） */
export type EntrySummary = {
  relative_path: string;
  kind: string | null;
  title: string | null;
  tags: string[];
  mtime: number;
  size: number;
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

/** 读 vault 内 .md 文件 + 解析 frontmatter */
export async function readVault(relativePath: string): Promise<ReadResult> {
  return await invoke<ReadResult>('vault_read', { relativePath });
}

/** 原子写 vault 内文件（IO 不变式 I1：atomic rename）。expectedMtime 提供时校验外部未改（I3） */
export async function writeVault(
  relativePath: string,
  content: string,
  expectedMtime?: number,
): Promise<number> {
  return await invoke<number>('vault_write_atomic', {
    relativePath,
    content,
    expectedMtime,
  });
}

/** list-summary-loading：列 vault 内 .md 文件摘要（不返完整 body） */
export async function listVault(
  relativePath: string,
  recursive: boolean = false,
  filterType?: string,
): Promise<EntrySummary[]> {
  return await invoke<EntrySummary[]>('vault_list', {
    relativePath,
    recursive,
    filterType,
  });
}
