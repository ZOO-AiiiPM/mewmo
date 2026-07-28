# Contract: Tauri Commands

> **目的**：定义 React 前端调用 Rust 后端的 Tauri command 接口。所有 vault 操作必须经此处入口（FR-036 唯一 IO 接口约束）。

## 通用约定

- **命名**：`<namespace>_<verb>` 全小写蛇形（沿用 `db.rs` 现有风格）
- **传参**：JSON 序列化（Tauri 自动）
- **返回**：`Result<T, String>`（错误转字符串给前端 toast）
- **日志**：每次 invoke 必须打 JSON line 到 `.mewmo/logs/`（FR-035）
- **mutex**：写敏感文件的 command 必须经 `vault::io::*`，**不得**绕过直接 `fs::write`
- **错误码**（在错误字符串前缀）：
  - `VAULT_NOT_INITIALIZED` —— vault_path 不存在 / config.json 损坏
  - `VAULT_LOCKED` —— mkdir-mutex 被其他进程持有 + 等待超时
  - `INVALID_FRONTMATTER` —— frontmatter 解析失败
  - `LLM_API_ERROR` —— LLM 调用失败（含子类 LLMTimeout / LLMRateLimit / LLMAuthFail）
  - `SKILL_SPAWN_ERROR` —— Skill 子进程启动失败

---

## 1. Vault 初始化与配置

### `vault_initialize`

**输入**: `{ vault_path: string, conflict_resolution: "use-existing" | "abort" }`

**输出**: `{ vault_path: string, schema_version: number, initialized_at: string }`

**FR 对应**: FR-001 / FR-005 / FR-006

**Behavior**:
1. 检查 vault_path 是否存在
2. 路径为空目录或不存在 → 创建三层结构（raw / wiki / .mewmo）+ 5 个 persona 占位 + 1-2 个示例 supertag + voice-template.md + active.txt + `_index.md` 系列
3. 路径已存在非空目录：
   - `conflict_resolution: "use-existing"` → 验证是 mewmo vault（含 `.mewmo/config-marker.json` 之类的 marker）→ 是则正常加载，否则报错
   - `conflict_resolution: "abort"` → 直接 ERROR 返回，不写任何文件
4. 写 `~/.mewmo/config.json`
5. 同步部署内置 Skill 包到 `~/.claude/skills/mewmo/`（FR-022）

**Errors**:
- `VAULT_PATH_INVALID`：路径包含非法字符 / 不是绝对路径
- `VAULT_PATH_CONFLICT`：路径已存在非空目录但 conflict_resolution=abort
- `SKILL_DEPLOY_ERROR`：复制 Skill 到 ~/.claude/skills/mewmo/ 失败

### `vault_get_config`

**输入**: `{}`

**输出**: 完整 config.json 内容

### `vault_set_active_persona`

**输入**: `{ persona_id: "curious" | "gentle" | "sharp" | "casual" | "steady" }`

**输出**: `{ active_persona: string }`

**FR 对应**: FR-019

**Behavior**: 写 `<vault>/.mewmo/cat/active.txt` + 更新 `~/.mewmo/config.json` 的 `active_persona` 字段。

### `vault_change_path`

**输入**: `{ new_vault_path: string, mode: "move" | "switch" }`

**输出**: `{ vault_path: string }`

**FR 对应**: FR-006

**Behavior**:
- `mode: "move"` → 物理移动 vault 文件夹到新路径（rsync + 校验 + 删除旧）
- `mode: "switch"` → 仅切换 config 指向新路径（用户已经手工移过）

---

## 2. Vault 文件 IO（读 / 写 / 列）

### `vault_read_file`

**输入**: `{ relative_path: string }`（如 `wiki/notes/foo.md`）

**输出**: `{ content: string, frontmatter: object | null, mtime: number }`

**Behavior**: 读文件，如是 .md 则解析 frontmatter 单独返回。

**Errors**:
- `FILE_NOT_FOUND`
- `INVALID_FRONTMATTER`：解析失败但仍返回原文（前端可降级渲染）

### `vault_write_file`

**输入**: `{ relative_path: string, content: string, frontmatter?: object, expected_mtime?: number }`

**输出**: `{ relative_path: string, mtime: number }`

**FR 对应**: FR-007（atomic write）/ FR-008（mutex if 全局聚合页）

**Behavior**:
1. 经 mutex（全局聚合页）/ 直接（普通笔记）调 `vault::io::write_atomic`
2. expected_mtime 提供 → 校验文件未被外部修改（防外部编辑被覆盖，FR-004）；冲突返回错误
3. atomicwrites 写 `.tmp` → fsync → rename
4. 如属于全局聚合页（index.md / log.md / recent-focus / about-user）走串行队列

**Errors**:
- `MTIME_CONFLICT`：expected_mtime 不匹配
- `VAULT_LOCKED`：mutex 等待超时
- `WRITE_FAILED`：磁盘错误

### `vault_append_to_aggregate`

**输入**: `{ aggregate: "index" | "log", entry: string }`

**输出**: `{ mtime: number, line_count: number }`

**FR 对应**: FR-009（增量 append）

**Behavior**: 走 mutex + 仅 append 到末尾（**不重写历史**）。

### `vault_list_dir`

**输入**: `{ relative_path: string, recursive?: boolean, filter_type?: string }`

**输出**: `[{ relative_path, type, frontmatter_summary, mtime, size }]`

**Behavior**: list-summary-loading 模式（沿用 `db.rs` 列表惯例）—— 只返摘要 + frontmatter，正文按需 lazy load。

---

## 3. Ingest 链

### `ingest_text`

**输入**: `{ text: string, hint?: { source_url?, source_type?, suggested_tags? } }`

**输出**: `{ wiki_path: string, log_entry: string, voice_message: string }`

**FR 对应**: FR-011 ~ FR-016

**Behavior**:
1. 串行队列（FR-012）—— 已有 ingest 在跑则排队
2. 走 cat agent（cat/mod.rs 编排）：
   - step 1（Sonnet）：写 `wiki/notes/<slug>.md` 摘要
   - step 2（Haiku）：决定影响哪些 entity / topic 页（Phase 0 仅 logging，不实写）
   - step 3（Sonnet，并行）：重写被影响的 wiki 页（Phase 0 不实施）
3. 增量 append `wiki/index.md` + `wiki/log.md`
4. 用猫 voice 生成一句反馈

**Errors**:
- `LLM_API_ERROR`（subclass timeout / rate limit / auth fail）
- `INGEST_QUEUE_FULL`（极端高并发）

### `ingest_url`（Phase 0 仅 stub，Phase 1 完整实现）

**输入**: `{ url: string }`

**输出**: 同 ingest_text

**Behavior**: 走 readability（复用 clip_parser.rs）→ raw/clips/ → ingest_text。

### `ingest_get_queue_status`

**输入**: `{}`

**输出**: `{ active: bool, queue_length: number }`

---

## 4. Cat Agent（persona / voice）

### `cat_get_active_persona`

**输入**: `{}`

**输出**: `{ id, name, content, voice_template_content }`

**Behavior**: **每次调用都重读** active.txt + persona-*.md + voice-template.md（FR-018），**不缓存**。

### `cat_say`

**输入**: `{ scenario: "ingest-feedback" | "query-opening" | "error" | "proactive", context?: object }`

**输出**: `{ message: string }`

**Behavior**: 用当前 active persona + voice template 让 LLM 生成符合 scenario 的一句话。Phase 0 主要给 ingest_text 用，未来 query / 主动行为复用。

---

## 5. Skill Runner（猫调内置 Skill）

### `skill_invoke`

**输入**: `{ skill: "capture" | "search" | "query" | "lint", args: any }`

**输出**: skill 自身定义的 JSON

**FR 对应**: FR-028（猫和外部用同一份 Skill 实现）

**Behavior**: spawn `python3 ~/.claude/skills/mewmo/<skill>/scripts/main.py --json '<args>'`，等结果。

**Errors**:
- `SKILL_NOT_FOUND`：~/.claude/skills/mewmo/<skill>/ 不存在或 SKILL.md 缺失
- `SKILL_SPAWN_ERROR`：python3 不存在 / 子进程失败
- `SKILL_TIMEOUT`：超过 60s 默认超时（capture）/ 30s（其他）

### `skill_list_available`

**输入**: `{}`

**输出**: `[{ name, description, version, deployed_path, enabled }]`

---

## 6. Tag 管理

### `tag_list`

**输入**: `{}`

**输出**: `[{ name, description, usage_count, file_path }]`

**FR 对应**: FR-029 / FR-030

### `tag_rescan`

**输入**: `{}`

**输出**: `{ added: number, updated: number, removed: number, errors: [{ file, reason }] }`

**FR 对应**: FR-030 / FR-031 / FR-033

**Behavior**: 扫 `.mewmo/tags/*.md`，更新 `_index.md` 的 mewmo 维护区段。损坏的 supertag 文件 skip + 进 errors。

### `tag_get_template`

**输入**: `{ tag_name: string }`

**输出**: `{ frontmatter_template: object, description: string }`

---

## 7. LLM / 日志可观测

### `llm_get_today_usage`

**输入**: `{}`

**输出**: `{ total_calls, cache_hit_rate, total_input_tokens, total_output_tokens, total_cost_usd, by_model: {...} }`

**FR 对应**: FR-014 / FR-035

### `log_tail`

**输入**: `{ lines?: number, filter_type?: string }`

**输出**: `[{ ...log entry }]`

---

## 错误处理 + 日志契约

每个 command 在 lib.rs 用统一 wrapper:
```rust
async fn cmd_wrapper<T>(cmd_name: &str, fut: impl Future<Output = Result<T, Error>>) -> Result<T, String> {
    let start = Instant::now();
    let result = fut.await;
    log_command_call(cmd_name, start.elapsed(), &result).await;
    result.map_err(|e| format!("{}: {}", e.code(), e.message()))
}
```

所有 command 必须打 JSON line 日志（FR-035），失败时含 stack trace（FR-015）。
