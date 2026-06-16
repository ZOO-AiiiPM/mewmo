//! Vault 初始化（首次启动建三层文件夹结构）
//!
//! Phase 0 US1：FR-001~006（vault 文件夹可见 + Obsidian 兼容）
//!
//! 边界：
//! - persona 内容是 Phase 0 占位（5 个 + voice-template 默认占位）—— Phase 5 US3 会重写实际差异化内容
//! - supertag 示例 1-2 个（book.md / ai.md）作为格式参考
//! - 不写 LLM 调用相关代码（等 LLM 架构讨论后再加）

use std::fs;
use std::path::{Path, PathBuf};

use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};

const DEFAULT_VAULT_DIR: &str = "mewmo-vault";
const DEFAULT_PERSONA: &str = "curious";
const SCHEMA_VERSION: u32 = 1;

/// 用户级 vault 配置（写到 `~/.mewmo/config.json`）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultConfig {
    pub vault_path: String,
    pub schema_version: u32,
    pub initialized_at: String,
    pub active_persona: String,
}

#[derive(Debug, Clone, Copy)]
pub enum ConflictResolution {
    /// 已有 mewmo vault（带 marker）→ 加载 config 而不是重建
    UseExisting,
    /// 路径非空 → 拒绝初始化
    Abort,
}

#[derive(Debug)]
pub enum InitError {
    PathConflict(String),
    AbortedByUser,
    InvalidPath(String),
    ConfigParse(String),
    Io(std::io::Error),
}

impl std::fmt::Display for InitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            InitError::PathConflict(p) => write!(f, "VAULT_PATH_CONFLICT: {}", p),
            InitError::AbortedByUser => write!(f, "ABORTED_BY_USER"),
            InitError::InvalidPath(p) => write!(f, "VAULT_PATH_INVALID: {}", p),
            InitError::ConfigParse(e) => write!(f, "CONFIG_PARSE: {}", e),
            InitError::Io(e) => write!(f, "FILE_IO: {}", e),
        }
    }
}

impl std::error::Error for InitError {}

impl From<std::io::Error> for InitError {
    fn from(e: std::io::Error) -> Self {
        InitError::Io(e)
    }
}

/// 默认 vault 路径 `~/Documents/mewmo-vault/`
pub fn default_vault_path() -> PathBuf {
    if let Some(home) = std::env::var_os("HOME") {
        PathBuf::from(home)
            .join("Documents")
            .join(DEFAULT_VAULT_DIR)
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(DEFAULT_VAULT_DIR)
    }
}

/// 用户配置文件路径，默认 `~/.mewmo/config.json`。
/// dev 模式（debug build）使用 `~/.mewmo-dev/config.json`，与打包版隔离。
/// 设置环境变量 `MEWMO_CONFIG_DIR` 可手动覆盖。
pub fn config_file_path() -> Option<PathBuf> {
    let dir = match std::env::var_os("MEWMO_CONFIG_DIR") {
        Some(d) => PathBuf::from(d),
        None => {
            let home = std::env::var_os("HOME")?;
            let folder = if cfg!(debug_assertions) { ".mewmo-dev" } else { ".mewmo" };
            PathBuf::from(home).join(folder)
        }
    };
    Some(dir.join("config.json"))
}

fn vault_marker_path(vault_path: &Path) -> PathBuf {
    vault_path.join(".mewmo").join("config-marker.json")
}

fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn is_empty_dir(p: &Path) -> std::io::Result<bool> {
    Ok(fs::read_dir(p)?.next().is_none())
}

/// 初始化 vault：创建三层文件夹 + 写默认占位 + 写 config（FR-001~006）
pub fn initialize(
    vault_path: &Path,
    conflict: ConflictResolution,
) -> Result<VaultConfig, InitError> {
    if !vault_path.is_absolute() {
        return Err(InitError::InvalidPath(format!(
            "must be absolute path: {}",
            vault_path.display()
        )));
    }

    if vault_path.exists() {
        let is_empty = is_empty_dir(vault_path).unwrap_or(false);
        let has_marker = vault_marker_path(vault_path).exists();

        if !is_empty {
            match conflict {
                ConflictResolution::UseExisting => {
                    if !has_marker {
                        // 路径已有内容但**不是** mewmo vault → 拒绝（防误覆盖第三方目录）
                        return Err(InitError::PathConflict(format!(
                            "{}: 路径非空且无 mewmo marker，拒绝 use-existing 防误覆盖",
                            vault_path.display()
                        )));
                    }
                    return load_or_rebuild_existing_config(vault_path);
                }
                ConflictResolution::Abort => {
                    return Err(InitError::AbortedByUser);
                }
            }
        }
    }

    create_skeleton(vault_path)?;
    write_persona_placeholders(vault_path)?;
    write_supertag_examples(vault_path)?;
    write_aggregate_placeholders(vault_path)?;
    write_marker(vault_path)?;

    let config = VaultConfig {
        vault_path: vault_path.to_string_lossy().to_string(),
        schema_version: SCHEMA_VERSION,
        initialized_at: now_iso(),
        active_persona: DEFAULT_PERSONA.to_string(),
    };
    write_user_config(&config)?;

    log::info!("vault initialized at {}", vault_path.display());
    Ok(config)
}

fn load_or_rebuild_existing_config(vault_path: &Path) -> Result<VaultConfig, InitError> {
    if let Some(config_path) = config_file_path() {
        if config_path.exists() {
            let raw = fs::read_to_string(&config_path)?;
            if let Ok(c) = serde_json::from_str::<VaultConfig>(&raw) {
                return Ok(c);
            }
        }
    }
    // marker 存在但 config 缺失 / 损坏 → 用最简默认重建 config
    let config = VaultConfig {
        vault_path: vault_path.to_string_lossy().to_string(),
        schema_version: SCHEMA_VERSION,
        initialized_at: now_iso(),
        active_persona: DEFAULT_PERSONA.to_string(),
    };
    write_user_config(&config)?;
    Ok(config)
}

fn create_skeleton(vault_path: &Path) -> Result<(), InitError> {
    let dirs = [
        // raw 层
        "raw",
        "raw/clips",
        "raw/feeds-archived",
        "raw/files",
        "raw/images",
        // wiki 层
        "wiki",
        "wiki/notes",
        "wiki/entities",
        "wiki/topics",
        "wiki/reports",
        "wiki/reports/daily",
        "wiki/reports/weekly",
        "wiki/cat-diary",
        "wiki/todos",
        "wiki/todos/active",
        "wiki/todos/done",
        // library 层（知识库）
        "library",
        // .mewmo 程序内部
        ".mewmo",
        ".mewmo/cat",
        ".mewmo/cat/memory",
        ".mewmo/cat/memory/threads",
        ".mewmo/tags",
        ".mewmo/logs",
        ".mewmo/.locks",
    ];
    for d in &dirs {
        fs::create_dir_all(vault_path.join(d))?;
    }
    Ok(())
}

fn write_persona_placeholders(vault_path: &Path) -> Result<(), InitError> {
    let personas = [
        (
            "curious",
            "好奇",
            "对世界充满好奇，喜欢追问 why。说话偏短句，经常反问。",
        ),
        (
            "gentle",
            "温柔",
            "温和体贴，关心你的感受。说话偏柔，不催促。",
        ),
        (
            "sharp",
            "锐利",
            "直接犀利，看重效率。说话偏短，会指出问题。",
        ),
        ("casual", "散漫", "随意松弛，不端着。说话偏口语，会跑题。"),
        ("steady", "沉稳", "成熟克制，有耐心。说话偏中长句，不浮夸。"),
    ];

    let ts = now_iso();
    for (id, name, desc) in &personas {
        let path = vault_path
            .join(".mewmo")
            .join("cat")
            .join(format!("persona-{}.md", id));
        let content = format!(
            "---\nid: {id}\nname: {name}\ncreated: {ts}\nversion: 1\n---\n\n## 性格描述\n\n{desc}\n\n## 说话习惯\n\n（Phase 5 US3 待重写：句长 / 用词倾向 / 提问倾向 / emoji 使用频率）\n\n## 关键词触发偏好\n\n（Phase 5 US3 待重写）\n\n## 长度偏好\n\n- 默认输出长度：≤ 400 字\n- 详细输出长度：≤ 800 字\n",
            id = id,
            name = name,
            ts = ts,
            desc = desc
        );
        fs::write(&path, content)?;
    }

    let voice_path = vault_path
        .join(".mewmo")
        .join("cat")
        .join("voice-template.md");
    fs::write(
        &voice_path,
        format!(
            "---\ntype: voice-template\ncreated: {ts}\nversion: 1\n---\n\n## ingest 完成反馈\n\n（Phase 5 US3 待重写：3-5 个变体让 cat 不重复）\n\n## query 回答开头\n\n（Phase 5 US3 待重写）\n\n## 错误反馈\n\n（Phase 5 US3 待重写：API key 缺 / 网络断 / 文件冲突等子类）\n\n## 主动行为开头\n\n（Phase 5 US3 待重写）\n",
            ts = ts
        ),
    )?;

    let active_path = vault_path.join(".mewmo").join("cat").join("active.txt");
    fs::write(&active_path, format!("{}\n", DEFAULT_PERSONA))?;

    let about_user = vault_path
        .join(".mewmo")
        .join("cat")
        .join("memory")
        .join("about-user.md");
    fs::write(
        &about_user,
        format!(
            "---\ntype: cat-memory\nsubtype: about-user\nlast_synced: {ts}\nupdate_cadence: quarterly\n---\n\n<!-- mewmo:managed-start -->\n\n（Phase 4 自我进化阶段待自动维护）\n\n<!-- mewmo:managed-end -->\n\n## 备注\n\n（用户自由编辑区，mewmo 不动）\n",
            ts = ts
        ),
    )?;
    let recent_focus = vault_path
        .join(".mewmo")
        .join("cat")
        .join("memory")
        .join("recent-focus.md");
    fs::write(
        &recent_focus,
        format!(
            "---\ntype: cat-memory\nsubtype: recent-focus\nlast_synced: {ts}\nupdate_cadence: weekly\n---\n\n<!-- mewmo:managed-start -->\n\n（Phase 4 自我进化阶段待自动维护）\n\n<!-- mewmo:managed-end -->\n\n## 备注\n\n（用户自由编辑区，mewmo 不动）\n",
            ts = ts
        ),
    )?;

    Ok(())
}

fn write_supertag_examples(vault_path: &Path) -> Result<(), InitError> {
    let ts = now_iso();

    let book = vault_path.join(".mewmo").join("tags").join("book.md");
    fs::write(
        &book,
        format!(
            "---\nname: book\ndescription: 读书笔记的 supertag\ncreated: {ts}\nkeywords:\n  - 读书\n  - 阅读\n  - 书评\ntemplate_fields:\n  - name: author\n    type: string\n    required: true\n  - name: title\n    type: string\n    required: true\n  - name: status\n    type: enum\n    options: [reading, finished, abandoned]\n  - name: rating\n    type: number\n    range: [1, 5]\n---\n\n读书笔记用此 tag。\n",
            ts = ts
        ),
    )?;

    let ai = vault_path.join(".mewmo").join("tags").join("ai.md");
    fs::write(
        &ai,
        format!(
            "---\nname: ai\ndescription: AI / LLM / agent 相关\ncreated: {ts}\nkeywords:\n  - AI\n  - LLM\n  - agent\n  - 人工智能\n---\n\nAI 相关笔记用此 tag。\n",
            ts = ts
        ),
    )?;

    let index = vault_path.join(".mewmo").join("tags").join("_index.md");
    fs::write(
        &index,
        "# Tags Index\n\n<!-- mewmo:managed-start -->\n\n| name | description | usage_count |\n|------|-------------|-------------|\n| book | 读书笔记的 supertag | 0 |\n| ai | AI / LLM / agent 相关 | 0 |\n\n<!-- mewmo:managed-end -->\n\n## 备注\n\n（用户自由编辑区，mewmo 不动）\n",
    )?;
    Ok(())
}

fn write_aggregate_placeholders(vault_path: &Path) -> Result<(), InitError> {
    let raw_index = vault_path.join("raw").join("_index.md");
    fs::write(
        &raw_index,
        "# Raw Index\n\n（原始素材索引，mewmo 自动维护）\n",
    )?;

    let wiki_index = vault_path.join("wiki").join("_index.md");
    fs::write(&wiki_index, "# Wiki Index\n\n（合成层导航）\n")?;

    let main_index = vault_path.join("wiki").join("index.md");
    fs::write(
        &main_index,
        "# Mewmo Vault Index\n\n（全 vault 主索引，按 type 分组，mewmo 增量 append）\n",
    )?;

    let log = vault_path.join("wiki").join("log.md");
    fs::write(
        &log,
        format!("# Mewmo Vault Activity Log\n\n{} vault 初始化\n", now_iso()),
    )?;
    Ok(())
}

fn write_marker(vault_path: &Path) -> Result<(), InitError> {
    let path = vault_marker_path(vault_path);
    let body = serde_json::json!({
        "marker": "mewmo-vault",
        "schema_version": SCHEMA_VERSION,
        "initialized_at": now_iso(),
    });
    let pretty =
        serde_json::to_string_pretty(&body).map_err(|e| InitError::ConfigParse(e.to_string()))?;
    fs::write(&path, pretty)?;
    Ok(())
}

fn write_user_config(config: &VaultConfig) -> Result<(), InitError> {
    let path =
        config_file_path().ok_or_else(|| InitError::InvalidPath("HOME env not set".to_string()))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let raw =
        serde_json::to_string_pretty(config).map_err(|e| InitError::ConfigParse(e.to_string()))?;
    fs::write(&path, raw)?;
    Ok(())
}

/// 读用户配置（启动时调用）
///
/// **Self-healing**：如果 config.json 存在但其中的 vault_path 实际已不存在
/// （比如曾被单元测试 / 用户手动删 / 外部移动）→ 返回 None 让上层走「未初始化」流程，
/// 不报错让 vault 卡死。
pub fn read_config() -> Result<Option<VaultConfig>, InitError> {
    let path = match config_file_path() {
        Some(p) => p,
        None => return Ok(None),
    };
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path)?;
    let config = serde_json::from_str::<VaultConfig>(&raw)
        .map_err(|e| InitError::ConfigParse(e.to_string()))?;

    // self-healing: vault_path 不存在 → 当作未初始化（不返回 stale config）
    let vault_path = Path::new(&config.vault_path);
    if !vault_path.exists() {
        log::warn!(
            "config.json 指向的 vault_path 不存在（{}），降级为未初始化",
            config.vault_path
        );
        return Ok(None);
    }

    Ok(Some(config))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_vault() -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let pid = std::process::id();
        let path = std::env::temp_dir().join(format!("mewmo-init-test-{}-{}", pid, nanos));
        path
    }

    #[test]
    fn test_create_skeleton_full() {
        // 注意：本测试**不调 initialize() 顶层**——避免触发 write_user_config
        // 污染真实用户的 ~/.mewmo/config.json（cargo test 不该写真实用户配置）
        let vault = temp_vault();

        create_skeleton(&vault).unwrap();
        write_persona_placeholders(&vault).unwrap();
        write_supertag_examples(&vault).unwrap();
        write_aggregate_placeholders(&vault).unwrap();
        write_marker(&vault).unwrap();

        // 三层目录齐
        assert!(vault.join("raw").is_dir());
        assert!(vault.join("wiki").is_dir());
        assert!(vault.join(".mewmo").is_dir());

        // 5 persona 文件齐
        for id in &["curious", "gentle", "sharp", "casual", "steady"] {
            assert!(vault
                .join(".mewmo")
                .join("cat")
                .join(format!("persona-{}.md", id))
                .exists());
        }
        assert!(vault
            .join(".mewmo")
            .join("cat")
            .join("voice-template.md")
            .exists());
        assert!(vault.join(".mewmo").join("cat").join("active.txt").exists());

        // supertag 示例 + _index.md
        assert!(vault.join(".mewmo").join("tags").join("book.md").exists());
        assert!(vault.join(".mewmo").join("tags").join("ai.md").exists());
        assert!(vault.join(".mewmo").join("tags").join("_index.md").exists());

        // marker
        assert!(vault_marker_path(&vault).exists());

        std::fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn test_initialize_rejects_relative_path() {
        let result = initialize(Path::new("relative/path"), ConflictResolution::UseExisting);
        assert!(matches!(result.unwrap_err(), InitError::InvalidPath(_)));
    }

    #[test]
    fn test_initialize_path_conflict_no_marker() {
        let vault = temp_vault();
        std::fs::create_dir_all(&vault).unwrap();
        // 写一个非 mewmo 文件让它非空
        std::fs::write(vault.join("third-party.txt"), "not a mewmo vault").unwrap();

        let result = initialize(&vault, ConflictResolution::UseExisting);
        assert!(matches!(result.unwrap_err(), InitError::PathConflict(_)));

        std::fs::remove_dir_all(&vault).ok();
    }

    #[test]
    fn test_initialize_abort_on_existing() {
        let vault = temp_vault();
        std::fs::create_dir_all(&vault).unwrap();
        std::fs::write(vault.join("foo.txt"), "x").unwrap();

        let result = initialize(&vault, ConflictResolution::Abort);
        assert!(matches!(result.unwrap_err(), InitError::AbortedByUser));

        std::fs::remove_dir_all(&vault).ok();
    }

    #[test]
    #[ignore = "writes real ~/Documents/mewmo-vault/ + ~/.mewmo/config.json. Run via: cargo test -- --ignored vault::init::test_initialize_at_real_documents"]
    fn test_initialize_at_real_documents() {
        // 真实场景验证 init.rs 端到端：调 default_vault_path()（读 HOME env）+ initialize 顶层
        // 写真实 ~/.mewmo/config.json + ~/Documents/mewmo-vault/。
        // 默认不跑（#[ignore]）—— 避免污染 cargo test 默认运行；用户 / 我手动跑用来验证。
        let path = default_vault_path();
        println!("[real-init] default vault path: {}", path.display());

        let config = initialize(&path, ConflictResolution::UseExisting).expect("init failed");

        assert_eq!(config.active_persona, DEFAULT_PERSONA);
        assert_eq!(config.schema_version, SCHEMA_VERSION);
        assert!(path.exists(), "vault dir should exist after initialize");
        assert!(path.join("raw").is_dir());
        assert!(path.join("wiki").is_dir());
        assert!(path.join(".mewmo").is_dir());
        assert!(vault_marker_path(&path).exists());

        println!("[real-init] success: {:?}", config);
    }
}
