//! Vault Layer 1 IO: 唯一 IO 接口（spec contracts/vault-io-trait.md 8 个不变式）
//!
//! ## 不变式实现位置
//! - I1 原子写不出现半截：`write_atomic` 用 `atomicwrites`（research.md §4）
//! - I2 全局聚合页不丢更新：`append_to_aggregate` 进程内 `tokio::sync::Mutex` + 跨进程 mkdir-mutex
//! - I3 `expected_mtime` 防外部覆盖：`write_atomic` 入口校验
//! - I4 mkdir-mutex stale lock 自愈：`vault::locks` 实现
//! - I5 frontmatter 损坏不致命：`vault::frontmatter::parse` 降级返回
//! - I6 跨语言 frontmatter 兼容：`vault::frontmatter`（serde_json::Map flatten 保序）
//! - I7 相对路径 only：`validate_relative_path` 入口拦截 absolute / `..` / RootDir
//! - I8 写入触发 watcher 事件：依赖 notify-debouncer-full（Phase 0 后续接入，本模块仅保证写完整即可被外部监听）

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use atomicwrites::{AtomicFile, OverwriteBehavior};
use once_cell::sync::Lazy;
use serde::Serialize;
use tokio::sync::Mutex as TokioMutex;

use super::frontmatter::{self, FrontmatterData};
use super::locks::{self, LockError};

// ============================================================================
// Public types
// ============================================================================

/// 读结果（含 frontmatter typed view + 正文 + mtime）
#[derive(Debug, Serialize)]
pub struct ReadResult {
    pub frontmatter: Option<FrontmatterData>,
    pub body: String,
    pub mtime: u64,
}

/// list-summary-loading 模式：摘要不含完整 body（按需 read 加载）
#[derive(Debug, Serialize)]
pub struct EntrySummary {
    pub relative_path: String,
    pub kind: Option<String>,
    pub title: Option<String>,
    pub tags: Vec<String>,
    pub mtime: u64,
    pub size: u64,
}

/// 全局聚合页：mutex 保护的 5 个高频热点文件
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AggregateName {
    Index,
    Log,
    RecentFocus,
    AboutUser,
    TagsIndex,
}

impl AggregateName {
    /// 该聚合页相对 vault root 的路径
    pub fn relative_path(&self) -> &'static str {
        match self {
            AggregateName::Index => "wiki/index.md",
            AggregateName::Log => "wiki/log.md",
            AggregateName::RecentFocus => ".mewmo/cat/memory/recent-focus.md",
            AggregateName::AboutUser => ".mewmo/cat/memory/about-user.md",
            AggregateName::TagsIndex => ".mewmo/tags/_index.md",
        }
    }

    fn process_lock(&self) -> &'static TokioMutex<()> {
        match self {
            AggregateName::Index => &INDEX_MUTEX,
            AggregateName::Log => &LOG_MUTEX,
            AggregateName::RecentFocus => &RECENT_FOCUS_MUTEX,
            AggregateName::AboutUser => &ABOUT_USER_MUTEX,
            AggregateName::TagsIndex => &TAGS_INDEX_MUTEX,
        }
    }
}

static INDEX_MUTEX: Lazy<TokioMutex<()>> = Lazy::new(|| TokioMutex::new(()));
static LOG_MUTEX: Lazy<TokioMutex<()>> = Lazy::new(|| TokioMutex::new(()));
static RECENT_FOCUS_MUTEX: Lazy<TokioMutex<()>> = Lazy::new(|| TokioMutex::new(()));
static ABOUT_USER_MUTEX: Lazy<TokioMutex<()>> = Lazy::new(|| TokioMutex::new(()));
static TAGS_INDEX_MUTEX: Lazy<TokioMutex<()>> = Lazy::new(|| TokioMutex::new(()));

/// vault 完整性检查报告（启动时调用 + lint 时调用）
#[derive(Debug, Serialize)]
pub struct IntegrityReport {
    pub vault_exists: bool,
    pub critical_dirs_present: Vec<String>,
    pub stale_locks_cleaned: usize,
    pub broken_supertags: Vec<(String, String)>,
}

// ============================================================================
// Error type
// ============================================================================

#[derive(Debug)]
pub enum IoError {
    VaultPathMissing(String),
    Locked(String),
    FileNotFound(String),
    InvalidPath(String),
    InvalidFrontmatter {
        file: String,
        reason: String,
    },
    MtimeConflict {
        path: String,
        expected: u64,
        actual: u64,
    },
    WriteFailed(String),
    Io(std::io::Error),
}

impl std::fmt::Display for IoError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            IoError::VaultPathMissing(p) => write!(f, "VAULT_PATH_MISSING: {}", p),
            IoError::Locked(r) => write!(f, "VAULT_LOCKED: {}", r),
            IoError::FileNotFound(p) => write!(f, "FILE_NOT_FOUND: {}", p),
            IoError::InvalidPath(p) => write!(f, "INVALID_PATH: {}", p),
            IoError::InvalidFrontmatter { file, reason } => {
                write!(f, "INVALID_FRONTMATTER: {} ({})", file, reason)
            }
            IoError::MtimeConflict {
                path,
                expected,
                actual,
            } => write!(
                f,
                "MTIME_CONFLICT: {} (expected={} actual={})",
                path, expected, actual
            ),
            IoError::WriteFailed(e) => write!(f, "WRITE_FAILED: {}", e),
            IoError::Io(e) => write!(f, "FILE_IO: {}", e),
        }
    }
}

impl std::error::Error for IoError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            IoError::Io(e) => Some(e),
            _ => None,
        }
    }
}

impl From<std::io::Error> for IoError {
    fn from(e: std::io::Error) -> Self {
        IoError::Io(e)
    }
}

impl From<LockError> for IoError {
    fn from(e: LockError) -> Self {
        match e {
            LockError::Timeout { resource } => IoError::Locked(resource),
            LockError::Io(io_err) => IoError::Io(io_err),
        }
    }
}

// ============================================================================
// Path validation (I7)
// ============================================================================

/// 不变式 I7：相对路径校验（拒绝绝对路径 / `..` 越级 / RootDir）
pub fn validate_relative_path(relative: &str) -> Result<(), IoError> {
    if relative.is_empty() {
        return Err(IoError::InvalidPath("empty path".to_string()));
    }
    let p = Path::new(relative);
    if p.is_absolute() {
        return Err(IoError::InvalidPath(format!(
            "absolute path forbidden: {}",
            relative
        )));
    }
    for component in p.components() {
        match component {
            std::path::Component::ParentDir => {
                return Err(IoError::InvalidPath(format!(
                    "'..' forbidden: {}",
                    relative
                )));
            }
            std::path::Component::Prefix(_) | std::path::Component::RootDir => {
                return Err(IoError::InvalidPath(format!(
                    "rooted path forbidden: {}",
                    relative
                )));
            }
            _ => {}
        }
    }
    Ok(())
}

fn full_path(vault_path: &Path, relative: &str) -> Result<PathBuf, IoError> {
    validate_relative_path(relative)?;
    Ok(vault_path.join(relative))
}

fn get_mtime(path: &Path) -> Result<u64, IoError> {
    let meta = fs::metadata(path)?;
    let mtime = meta.modified()?;
    let secs = mtime
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    Ok(secs)
}

// ============================================================================
// Read (I5 降级在 frontmatter::parse 内)
// ============================================================================

/// 读 vault 内文件 + 解析 frontmatter + 取 mtime
pub async fn read(vault_path: &Path, relative_path: &str) -> Result<ReadResult, IoError> {
    let path = full_path(vault_path, relative_path)?;
    if !path.exists() {
        return Err(IoError::FileNotFound(relative_path.to_string()));
    }
    let content = fs::read_to_string(&path)?;
    let parsed = frontmatter::parse(&content);
    let mtime = get_mtime(&path)?;
    Ok(ReadResult {
        frontmatter: parsed.frontmatter,
        body: parsed.body,
        mtime,
    })
}

// ============================================================================
// Write atomic (I1 + I3 + I7)
// ============================================================================

/// 原子写文件
///
/// - I1：atomicwrites tmp + fsync + rename，断电 / kill 不出现半截
/// - I3：`expected_mtime` 提供时校验文件未被外部修改，冲突返回 `MtimeConflict`
/// - I7：路径校验在 `full_path` 内
pub async fn write_atomic(
    vault_path: &Path,
    relative_path: &str,
    content: &str,
    expected_mtime: Option<u64>,
) -> Result<u64, IoError> {
    let path = full_path(vault_path, relative_path)?;

    // I3: expected_mtime 校验（仅在文件已存在时检查）
    if let Some(expected) = expected_mtime {
        if path.exists() {
            let actual = get_mtime(&path)?;
            if actual != expected {
                return Err(IoError::MtimeConflict {
                    path: relative_path.to_string(),
                    expected,
                    actual,
                });
            }
        }
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    // I1: atomicwrites（tmp + fsync + rename）
    let af = AtomicFile::new(&path, OverwriteBehavior::AllowOverwrite);
    af.write(|f| f.write_all(content.as_bytes()))
        .map_err(|e| IoError::WriteFailed(format!("{}", e)))?;

    get_mtime(&path)
}

// ============================================================================
// Append to aggregate (I2)
// ============================================================================

/// 增量 append 到全局聚合页
///
/// - 进程内 tokio::sync::Mutex 串行化（5 个 aggregate 各一个静态 mutex）
/// - 跨进程 mkdir-as-mutex 协调（vault::locks）
/// - 写本身仍走 atomic rename（防 partial-read race）
///
/// 不变式 I2：双 writer 都能保留更新，禁 lost update
pub async fn append_to_aggregate(
    vault_path: &Path,
    aggregate: AggregateName,
    entry: &str,
) -> Result<u64, IoError> {
    // 1. 进程内 mutex 串行化
    let _proc_guard = aggregate.process_lock().lock().await;

    // 2. 跨进程 mkdir-mutex
    let resource = aggregate.relative_path();
    let _cross_guard = locks::lock(vault_path, resource).await?;

    // 3. read-append-write，写用 atomic rename
    let path = vault_path.join(resource);
    let existing = if path.exists() {
        fs::read_to_string(&path)?
    } else {
        String::new()
    };

    let mut new_content = existing;
    if !new_content.is_empty() && !new_content.ends_with('\n') {
        new_content.push('\n');
    }
    new_content.push_str(entry);
    if !new_content.ends_with('\n') {
        new_content.push('\n');
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let af = AtomicFile::new(&path, OverwriteBehavior::AllowOverwrite);
    af.write(|f| f.write_all(new_content.as_bytes()))
        .map_err(|e| IoError::WriteFailed(format!("{}", e)))?;

    get_mtime(&path)
    // _cross_guard / _proc_guard 在此 drop 释放锁
}

// ============================================================================
// List (list-summary-loading mode)
// ============================================================================

/// 列出指定路径下 .md 文件摘要（不含完整 body）
pub async fn list(
    vault_path: &Path,
    relative_path: &str,
    recursive: bool,
    filter_type: Option<&str>,
) -> Result<Vec<EntrySummary>, IoError> {
    let dir = full_path(vault_path, relative_path)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut summaries = Vec::new();
    list_dir_inner(&dir, vault_path, recursive, filter_type, &mut summaries)?;
    Ok(summaries)
}

fn list_dir_inner(
    dir: &Path,
    vault_root: &Path,
    recursive: bool,
    filter_type: Option<&str>,
    out: &mut Vec<EntrySummary>,
) -> Result<(), IoError> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            if recursive {
                list_dir_inner(&path, vault_root, recursive, filter_type, out)?;
            }
            continue;
        }
        let ext = path.extension().and_then(|s| s.to_str()).unwrap_or("");
        if ext != "md" {
            continue;
        }
        let content = match fs::read_to_string(&path) {
            Ok(c) => c,
            Err(_) => continue, // 损坏文件跳过，不让单个文件挂掉整个 list
        };
        let parsed = frontmatter::parse(&content);
        let kind = parsed.frontmatter.as_ref().and_then(|f| f.kind.clone());

        if let Some(want) = filter_type {
            match &kind {
                Some(k) if k == want => {}
                _ => continue,
            }
        }

        let title = parsed
            .frontmatter
            .as_ref()
            .and_then(|f| f.extra.get("title"))
            .and_then(|v| v.as_str())
            .map(String::from)
            .or_else(|| first_h1(&parsed.body));
        let tags = parsed
            .frontmatter
            .as_ref()
            .map(|f| f.tags.clone())
            .unwrap_or_default();
        let mtime = get_mtime(&path).unwrap_or(0);
        let size = entry.metadata().map(|m| m.len()).unwrap_or(0);

        let relative = path
            .strip_prefix(vault_root)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| path.to_string_lossy().to_string());

        out.push(EntrySummary {
            relative_path: relative,
            kind,
            title,
            tags,
            mtime,
            size,
        });
    }
    Ok(())
}

/// 从 markdown body 提取第一个 H1 作为 title（缺省 None）
fn first_h1(body: &str) -> Option<String> {
    for line in body.lines() {
        let trimmed = line.trim_start();
        if let Some(rest) = trimmed.strip_prefix("# ") {
            return Some(rest.trim().to_string());
        }
    }
    None
}

// ============================================================================
// Integrity check (启动时 + lint 时)
// ============================================================================

/// vault 完整性检查（启动时 / lint 时）
///
/// - vault_path 是否存在
/// - 三层 critical dirs 是否齐
/// - 启动时清 stale locks（I4）
/// - 列损坏 supertag（FR-031）
pub async fn integrity_check(vault_path: &Path) -> Result<IntegrityReport, IoError> {
    let mut report = IntegrityReport {
        vault_exists: vault_path.exists(),
        critical_dirs_present: Vec::new(),
        stale_locks_cleaned: 0,
        broken_supertags: Vec::new(),
    };

    if !report.vault_exists {
        return Ok(report);
    }

    for d in &["raw", "wiki", ".mewmo"] {
        if vault_path.join(d).is_dir() {
            report.critical_dirs_present.push((*d).to_string());
        }
    }

    report.stale_locks_cleaned = locks::cleanup_stale_locks(vault_path).unwrap_or(0);

    let tags_dir = vault_path.join(".mewmo").join("tags");
    if tags_dir.is_dir() {
        for entry in fs::read_dir(&tags_dir)? {
            let entry = entry?;
            let path = entry.path();
            let name = path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            if !name.ends_with(".md") || name == "_index.md" {
                continue;
            }
            let content = match fs::read_to_string(&path) {
                Ok(c) => c,
                Err(e) => {
                    report
                        .broken_supertags
                        .push((name, format!("read fail: {}", e)));
                    continue;
                }
            };
            let parsed = frontmatter::parse(&content);
            if parsed.frontmatter.is_none() {
                report
                    .broken_supertags
                    .push((name, "missing or invalid frontmatter".to_string()));
            }
        }
    }

    Ok(report)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_vault() -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let pid = std::process::id();
        let path = std::env::temp_dir().join(format!("mewmo-io-test-{}-{}", pid, nanos));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn test_validate_relative_path_rejects_absolute() {
        assert!(validate_relative_path("/etc/passwd").is_err());
        assert!(validate_relative_path("/foo").is_err());
    }

    #[test]
    fn test_validate_relative_path_rejects_parent_dir() {
        assert!(validate_relative_path("../etc/passwd").is_err());
        assert!(validate_relative_path("foo/../../bar").is_err());
        assert!(validate_relative_path("..").is_err());
    }

    #[test]
    fn test_validate_relative_path_accepts_normal() {
        assert!(validate_relative_path("wiki/notes/foo.md").is_ok());
        assert!(validate_relative_path("foo.md").is_ok());
        assert!(validate_relative_path("a/b/c.md").is_ok());
    }

    #[test]
    fn test_validate_relative_path_rejects_empty() {
        assert!(validate_relative_path("").is_err());
    }

    #[tokio::test]
    async fn test_write_atomic_creates_file_and_parents() {
        let vault = temp_vault();
        let mtime = write_atomic(&vault, "wiki/notes/test.md", "# Hello\n\nbody", None)
            .await
            .unwrap();
        assert!(vault.join("wiki/notes/test.md").exists());
        assert!(mtime > 0);
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_write_atomic_path_traversal_rejected() {
        let vault = temp_vault();
        let result = write_atomic(&vault, "../../etc/passwd", "x", None).await;
        assert!(matches!(result.unwrap_err(), IoError::InvalidPath(_)));
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_write_atomic_mtime_conflict() {
        let vault = temp_vault();
        write_atomic(&vault, "wiki/notes/x.md", "v1", None)
            .await
            .unwrap();
        // 用错误的 expected_mtime（0）
        let result = write_atomic(&vault, "wiki/notes/x.md", "v2", Some(0)).await;
        assert!(matches!(result.unwrap_err(), IoError::MtimeConflict { .. }));
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_write_atomic_mtime_match_succeeds() {
        let vault = temp_vault();
        let mtime1 = write_atomic(&vault, "wiki/notes/y.md", "v1", None)
            .await
            .unwrap();
        // 提供正确 mtime 应该成功
        let mtime2 = write_atomic(&vault, "wiki/notes/y.md", "v2", Some(mtime1))
            .await
            .unwrap();
        assert!(mtime2 >= mtime1);
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_read_basic() {
        let vault = temp_vault();
        write_atomic(
            &vault,
            "wiki/notes/x.md",
            "---\ntype: user-note\ntags: [a, b]\n---\n\n# Hello\n\nbody",
            None,
        )
        .await
        .unwrap();
        let result = read(&vault, "wiki/notes/x.md").await.unwrap();
        let fm = result.frontmatter.unwrap();
        assert_eq!(fm.kind, Some("user-note".to_string()));
        assert_eq!(fm.tags, vec!["a", "b"]);
        assert!(result.body.contains("Hello"));
        assert!(result.mtime > 0);
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_read_file_not_found() {
        let vault = temp_vault();
        let result = read(&vault, "wiki/notes/nope.md").await;
        assert!(matches!(result.unwrap_err(), IoError::FileNotFound(_)));
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_append_to_aggregate_basic() {
        // I2 基础场景：两次串行 append 都保留
        let vault = temp_vault();
        let log_path = vault.join("wiki/log.md");
        append_to_aggregate(&vault, AggregateName::Log, "entry-1")
            .await
            .unwrap();
        append_to_aggregate(&vault, AggregateName::Log, "entry-2")
            .await
            .unwrap();
        let content = std::fs::read_to_string(&log_path).unwrap();
        assert!(content.contains("entry-1"));
        assert!(content.contains("entry-2"));
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_concurrent_append_no_lost_update() {
        // I2 真正并发场景：100 次 spawn 后等所有完成，验证都保留
        let vault = temp_vault();
        let mut handles = Vec::new();
        for i in 0..100 {
            let v = vault.clone();
            let h = tokio::spawn(async move {
                append_to_aggregate(&v, AggregateName::Log, &format!("entry-{}", i)).await
            });
            handles.push(h);
        }
        for h in handles {
            h.await.unwrap().unwrap();
        }
        let content = std::fs::read_to_string(vault.join("wiki/log.md")).unwrap();
        let line_count = content.lines().filter(|l| l.starts_with("entry-")).count();
        assert_eq!(line_count, 100, "应保留 100 条 entry, 实际 {}", line_count);
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_list_filter_type() {
        let vault = temp_vault();
        write_atomic(
            &vault,
            "wiki/notes/a.md",
            "---\ntype: user-note\n---\n# A",
            None,
        )
        .await
        .unwrap();
        write_atomic(
            &vault,
            "wiki/notes/b.md",
            "---\ntype: wiki-summary\n---\n# B",
            None,
        )
        .await
        .unwrap();
        let user_notes = list(&vault, "wiki/notes", false, Some("user-note"))
            .await
            .unwrap();
        assert_eq!(user_notes.len(), 1);
        assert_eq!(user_notes[0].title, Some("A".to_string()));
        let all = list(&vault, "wiki/notes", false, None).await.unwrap();
        assert_eq!(all.len(), 2);
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_list_recursive() {
        let vault = temp_vault();
        write_atomic(&vault, "wiki/notes/a.md", "# A", None)
            .await
            .unwrap();
        write_atomic(&vault, "wiki/notes/sub/b.md", "# B", None)
            .await
            .unwrap();
        let flat = list(&vault, "wiki/notes", false, None).await.unwrap();
        assert_eq!(flat.len(), 1);
        let recursive = list(&vault, "wiki/notes", true, None).await.unwrap();
        assert_eq!(recursive.len(), 2);
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_integrity_check_with_dirs() {
        let vault = temp_vault();
        std::fs::create_dir_all(vault.join("raw")).unwrap();
        std::fs::create_dir_all(vault.join("wiki")).unwrap();
        std::fs::create_dir_all(vault.join(".mewmo")).unwrap();
        let report = integrity_check(&vault).await.unwrap();
        assert!(report.vault_exists);
        assert_eq!(report.critical_dirs_present.len(), 3);
        std::fs::remove_dir_all(&vault).ok();
    }

    #[tokio::test]
    async fn test_integrity_check_missing_vault() {
        let nonexistent = std::path::PathBuf::from("/tmp/mewmo-nonexistent-xyz");
        let report = integrity_check(&nonexistent).await.unwrap();
        assert!(!report.vault_exists);
    }
}
