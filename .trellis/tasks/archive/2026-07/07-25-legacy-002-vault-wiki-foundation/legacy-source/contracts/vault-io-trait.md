# Contract: Vault IO Trait

> **目的**：定义 Layer 1 唯一 IO 接口的语义契约。Rust（vault/io.rs）和 Python（_shared/vault.py）**都必须遵守同一接口语义**——这是 FR-028「内部猫和外部 Claude Code 共享同一份实现」的物理保障。

## Trait（语义层，不是字面 syntax）

下面用 Rust 风格 trait 描述语义，Python 端给等价方法签名。

```rust
#[async_trait]
pub trait VaultIO {
    /// 读 .md 文件，返回 frontmatter + 正文 + mtime
    /// 解析失败返回 (None frontmatter, 原文, mtime) — 不报错（让上层降级）
    async fn read(&self, relative_path: &str) -> Result<ReadResult, IoError>;

    /// 原子写文件（FR-007）。expected_mtime 提供时校验未被外部改（FR-004）
    /// 走 atomic rename: tmp + rename
    async fn write_atomic(
        &self,
        relative_path: &str,
        content: &str,
        frontmatter: Option<&FrontMatter>,
        expected_mtime: Option<u64>,
    ) -> Result<u64, IoError>;

    /// 增量 append 到全局聚合页（FR-009）。仅追加不重写历史
    /// 内部走 mutex（FR-008）+ 跨进程 mkdir-mutex（FR-010）
    async fn append_to_aggregate(
        &self,
        aggregate: AggregateName,
        entry: &str,
    ) -> Result<u64, IoError>;

    /// list dir，返回摘要（list-summary-loading 模式，正文按需 lazy load）
    async fn list(
        &self,
        relative_path: &str,
        recursive: bool,
        filter_type: Option<&str>,
    ) -> Result<Vec<EntrySummary>, IoError>;

    /// 取互斥锁（mkdir-as-mutex），返回 RAII guard 自动释放
    async fn lock(&self, resource: &str) -> Result<LockGuard, IoError>;

    /// 检查 vault 完整性（启动时 + lint 时调）
    async fn integrity_check(&self) -> IntegrityReport;
}
```

**Python 等价**（_shared/vault.py）:
```python
class VaultIO:
    async def read(self, relative_path: str) -> ReadResult: ...
    async def write_atomic(
        self,
        relative_path: str,
        content: str,
        frontmatter: dict | None = None,
        expected_mtime: int | None = None,
    ) -> int: ...
    async def append_to_aggregate(self, aggregate: str, entry: str) -> int: ...
    async def list(
        self, relative_path: str, recursive: bool = False, filter_type: str | None = None
    ) -> list[EntrySummary]: ...
    @contextmanager
    def lock(self, resource: str): ...  # context manager 等价 RAII guard
    async def integrity_check(self) -> IntegrityReport: ...
```

---

## 数据结构

```rust
pub struct ReadResult {
    pub content: String,
    pub frontmatter: Option<FrontMatter>,
    pub mtime: u64,  // unix epoch seconds
}

pub struct FrontMatter {
    /// 必填字段
    pub r#type: String,        // user-note / wiki-summary / entity / topic / ...
    pub created: DateTime<Utc>,
    pub updated: DateTime<Utc>,
    pub author: Author,        // user / cat
    pub tags: Vec<String>,

    /// 可选字段
    pub source: Option<String>,
    pub related: Vec<String>,
    pub status: Option<TodoStatus>,
    pub due: Option<NaiveDate>,
    pub slug: Option<String>,

    /// 未识别字段保留（用户自定义）
    pub extra: serde_json::Map<String, serde_json::Value>,
}

pub enum AggregateName {
    Index,         // wiki/index.md
    Log,           // wiki/log.md
    RecentFocus,   // .mewmo/cat/memory/recent-focus.md
    AboutUser,     // .mewmo/cat/memory/about-user.md
    TagsIndex,     // .mewmo/tags/_index.md
}

pub struct EntrySummary {
    pub relative_path: String,
    pub r#type: String,
    pub title: String,         // frontmatter.title 或 first-h1 推导
    pub tags: Vec<String>,
    pub mtime: u64,
    pub size: u64,
}

pub struct LockGuard {
    /// drop 时自动 rmdir 释放锁（RAII）
    /// stale lock：drop 时记 ts，启动时扫 .locks/ 看 mtime
}

pub struct IntegrityReport {
    pub vault_exists: bool,
    pub config_valid: bool,
    pub critical_dirs_present: Vec<String>,    // raw / wiki / .mewmo 是否齐
    pub stale_locks: Vec<String>,               // 启动时清理
    pub broken_supertags: Vec<(String, String)>, // (path, reason)
    pub orphan_locks: Vec<String>,
}
```

---

## 不变式（Invariants，所有实现必须保证）

### I1. 原子写不出现半截文件

**契约**：`write_atomic` 返回 `Ok` 后磁盘上的文件**要么**是完整新内容**要么**是完整旧内容（如已存在）。绝不出现「frontmatter 写到一半」或「正文截断」状态。

**实现要求**：
- 写到 `<target>.tmp.<uuid>` → fsync → rename 到目标
- rename 在 POSIX 是原子的
- atomicwrites crate 满足；Python 端用 `os.fsync` + `os.rename`

**测试**（spec SC-006 = 0 起半截 .md）：
- 写过程中 `kill -9` 进程 50 次，验证目标文件每次都是完整旧版或完整新版

### I2. 全局聚合页不丢更新

**契约**：两个 writer 都基于聚合页旧版本 V0 同时调 `append_to_aggregate`，最终内容必须保留两次更新（V0 + delta1 + delta2），**不允许**只保留一次（lost update）。

**实现要求**：
- `append_to_aggregate` 内部串行（mutex 队列 + atomic rename）
- 跨进程靠 mkdir-as-mutex 协调
- POC-7 实证场景

**测试**（spec SC-005 = 100 次 0 lost update）:
- 两条 ingest 链同时 append 100 次，验证 line_count 等于 200

### I3. expected_mtime 防外部覆盖

**契约**：传 `expected_mtime` 时，写前必须校验文件 mtime 一致；不一致 → 返回 `MTIME_CONFLICT` 错误，**不**覆盖外部修改。

**实现要求**：
- 加锁 → 读 mtime → 比较 → 一致才走 atomic rename → 释放锁
- 不一致时让上层决定（重新加载并 merge / 提示用户）

### I4. mkdir-mutex stale lock 自愈

**契约**：进程 crash 留下 `.locks/<resource>/` 死锁不能让 vault 永久卡住。

**实现要求**：
- 启动时扫 `.locks/` 看每个 lock dir 的 mtime
- mtime > 60s 视为 stale → 强制 rmdir + log 一条 「stale lock cleared」
- mtime ≤ 60s 留（可能是真锁）

### I5. frontmatter 损坏不致命

**契约**：frontmatter YAML 解析失败时 `read` **不报错**——返回 `(None, 原文, mtime)`，让上层降级处理（FR-020）。

**实现要求**：
- 用 gray_matter 严格 parse 失败时降级返回原文
- 同时打 log 一条警告（FR-035）

### I6. 跨语言 frontmatter 兼容

**契约**：Rust 写的 frontmatter Python 必须能读，反之亦然。`extra` 字段保留所有未识别字段，serializer 必须保持原顺序（按用户输入）。

**实现要求**：
- Rust 端用 serde_yaml + IndexMap（保序）
- Python 端用 PyYAML safe_load + collections.OrderedDict（Python 3.7+ 默认 dict 已保序）

### I7. 相对路径 only

**契约**：所有 `relative_path` 参数必须是相对 vault root 的相对路径，**绝不接受绝对路径或 `..` 越级**。

**实现要求**：
- 入口校验：`!path.is_absolute() && !path.contains("..")`
- 不通过返回 `INVALID_PATH` 错误
- 防 path traversal 攻击

### I8. 写入触发 watcher 事件

**契约**：`write_atomic` 完成后必须触发 file watcher 通知前端 / 其他 listener（重新加载视图）。

**实现要求**：
- mewmo 主进程内通过 Tauri event 通知前端
- 跨进程：依赖 file watcher（notify-debouncer-full）从文件系统观测
- atomic rename 在某些 watcher 实现下会触发 `(remove + create)` 事件 → debouncer-full 配对成 `modify`（FR-004 重要）

---

## 错误模型

```rust
#[derive(Debug, thiserror::Error)]
pub enum IoError {
    #[error("VAULT_NOT_INITIALIZED")]
    VaultNotInitialized,

    #[error("VAULT_PATH_MISSING: {0}")]
    VaultPathMissing(String),

    #[error("VAULT_LOCKED: {0}")]
    Locked(String),

    #[error("FILE_NOT_FOUND: {0}")]
    FileNotFound(String),

    #[error("INVALID_PATH: {0}")]
    InvalidPath(String),

    #[error("INVALID_FRONTMATTER: {file} {reason}")]
    InvalidFrontmatter { file: String, reason: String },

    #[error("MTIME_CONFLICT: {0}")]
    MtimeConflict(String),

    #[error("WRITE_FAILED: {0}")]
    WriteFailed(String),

    #[error("FILE_IO: {0}")]
    Io(#[from] std::io::Error),
}
```

Python 等价：
```python
class IoError(Exception):
    code: str  # 同上 enum 名

class VaultNotInitialized(IoError): ...
class Locked(IoError): ...
# ...
```

跨语言同一 code 让 Skill 的错误能被 mewmo 主进程识别。

---

## 测试矩阵（spec SC-013 IO 层 100% 覆盖）

| 不变式 | 测试场景 | 工具 |
|-------|---------|------|
| I1 | kill -9 写过程 50 次，文件完整性 | `cargo test test_atomic_kill_safety` + 手脚本 |
| I2 | 双 writer 100 次 append，line_count = 200 | `cargo test test_concurrent_append` |
| I2 跨进程 | Rust + Python 同时 append，验证总行数 | bash + python 测试 harness |
| I3 | 外部改完 mtime 后 write_atomic 必须返 MTIME_CONFLICT | `cargo test test_mtime_conflict` |
| I4 | 模拟 stale lock（旧 mtime），启动后被清理 | `cargo test test_stale_lock_cleanup` |
| I5 | 输入损坏 frontmatter（缺 `---` 闭合 / YAML 不合法），read 不 panic | `cargo test test_corrupt_frontmatter_graceful` |
| I6 | Rust 写 → Python 读，Python 写 → Rust 读 | bash 集成测试 |
| I7 | 各种 path traversal 输入（`../../etc/passwd` / 绝对路径）→ INVALID_PATH | `cargo test test_path_traversal_rejection` |
| I8 | 写后 file watcher 收到事件 | 集成测试 + 手工验证 |

**测试位置**：
- Rust：`app/src-tauri/src/vault/io.rs` 的 `#[cfg(test)] mod tests`
- Python：`app/src-tauri/skills/_shared/tests/test_vault_io.py`
- 集成：`tmp/e2e-test.sh`（mock LLM + 跨进程并发场景）

---

## 关于「同一份实现」的语义

PRD §6.3 + FR-028 要求「内部猫和外部 Claude Code 调用同一份 Skill 实现」。**这里的"同一份"是语义级，不是字面级**：

- Rust 的 `vault/io.rs` 和 Python 的 `_shared/vault.py` 是**两份代码**
- 它们必须满足上述 8 条不变式 + 跨语言能读对方写的内容（I6）
- Skill 脚本（capture / search / query / lint）的**业务逻辑**用 Python 写一份——这部分是字面同一份，被 mewmo 内部猫和外部 Claude Code 都调用

**为什么 IO 层不能字面同一份**：
- Rust 是 Tauri 后端语言，性能 / 类型系统 / async 生态都更适合主进程
- Python 是 Anthropic Skill 标准语言，生态成熟
- 强行用同一种语言会让两边都难受

**保证**：通过本契约的不变式 + 跨语言集成测试（I6）做兜底。
