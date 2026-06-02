//! Vault: mewmo 的 Layer 1 数据真理层
//!
//! - vault/raw/* 和 vault/wiki/* 是 source of truth（用户可见 .md 文件）
//! - .mewmo/* 是程序内部衍生数据
//! - 所有 IO 操作经此模块（spec 002-vault-wiki-foundation contracts/vault-io-trait.md 8 个不变式）
//!
//! ## 当前实现状态
//! spec 002 已实现：frontmatter / init / io / locks / meta_db / slug
//! spec 003 实施中：ingest / query / search（笔记/剪藏切到 vault markdown）

pub mod frontmatter;
pub mod init;
pub mod io;
pub mod locks;
pub mod meta_db;
pub mod slug;

// spec 003-notes-clips-to-vault 新增模块
pub mod ingest;
pub mod query;
pub mod search;

// spec 004：vault 文件 watcher（外部写入后自动刷新，免重启）
pub mod watcher;
