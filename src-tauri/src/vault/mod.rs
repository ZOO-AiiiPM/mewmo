//! Vault: mewmo 的 Layer 1 数据真理层
//!
//! - vault/raw/* 和 vault/wiki/* 是 source of truth（用户可见 .md 文件）
//! - .mewmo/* 是程序内部衍生数据
//! - 所有 IO 操作经此模块（spec 002-vault-wiki-foundation contracts/vault-io-trait.md 8 个不变式）
//!
//! ## 当前实现状态
//! 第一批已实现：frontmatter / slug / locks / meta_db
//! T010-T013 待实现：io.rs 主体（write_atomic / append_to_aggregate / read / list / integrity_check）
//! T032-T036 待 LLM 架构讨论后实现：ingest.rs
//! Phase 1 实现：query.rs

pub mod frontmatter;
pub mod init;
pub mod io;
pub mod locks;
pub mod meta_db;
pub mod slug;
