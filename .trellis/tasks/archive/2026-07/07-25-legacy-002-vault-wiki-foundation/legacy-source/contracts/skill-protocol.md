# Contract: Skill Protocol

> **目的**：定义 mewmo 内置 Skill 包暴露给外部（Claude Code / Codex 等 agent）的接口契约。该契约同时被 mewmo 内部猫 agent 通过 `skill_invoke` Tauri command 调用——猫和外部 agent 用**同一份 Skill 实现**（FR-028）。

## 通用约定

- **协议**：兼容 Anthropic Skill 包标准格式（不自创格式，社区生态可共享）—— 详见 `~/.claude/skills/<skill-name>/SKILL.md` 入口
- **部署位置**：`~/.claude/skills/mewmo/`（FR-022）
- **传参**：命令行 `--json '<json string>'` 或 stdin JSON（取决于 Skill 自身定义）
- **返回**：stdout JSON（成功）/ stderr 描述 + exit code 非零（错误）
- **跨进程协作**：每个 Skill 脚本进程**独立运行**，不依赖 mewmo 主进程在线（FR-025），通过 `<vault>/.mewmo/.locks/` mkdir-mutex 协调（FR-010）
- **vault 定位**：Skill 启动时读 `~/.mewmo/config.json` 找 vault_path；config 不存在 → 报「mewmo 未初始化」错（FR-026）

---

## 1. `/mewmo:capture`

**SKILL.md 描述**：
```markdown
---
name: capture
description: 把一段文本或 URL 捕获到 mewmo vault，由猫摘要后写入 wiki/notes/
mewmo_version_required: ">=0.2.0"
---

## Usage

Single-arg form: `/mewmo:capture <text or url>`
Explicit form: `/mewmo:capture --text="..."` or `/mewmo:capture --url="..."`

## Behavior

1. 自动判断 input 是 URL 还是文本（URL 走 readability 提取后再 ingest）
2. 调 LLM（Anthropic Claude API，cache_control 启用）生成摘要
3. 写 `wiki/notes/<slug>.md`（含 frontmatter）
4. 增量 append `wiki/index.md` + `wiki/log.md`
5. 返回 JSON：路径 + 猫 voice 反馈

## Errors

- VAULT_NOT_INITIALIZED: ~/.mewmo/config.json 不存在
- LLM_API_ERROR: LLM 调用失败
- VAULT_LOCKED: mutex 等待超时
```

**FR 对应**: FR-024（capture 完整可用）/ FR-025（mewmo 主 app 不运行也跑通）

**Implementation**: `~/.claude/skills/mewmo/capture/scripts/main.py`

**Input schema**:
```json
{
  "text": "...",  // 二选一
  "url": "https://...",  // 二选一
  "hint": {
    "tags": ["..."],
    "source_type": "..."
  }
}
```

**Output schema (success)**:
```json
{
  "ok": true,
  "wiki_path": "wiki/notes/ai-and-knowledge-mgmt.md",
  "log_entry": "2026-05-27T15:30:45Z ingest wiki/notes/ai-and-knowledge-mgmt.md",
  "voice_message": "记下来啦，存在了 notes/ai-and-knowledge-mgmt.md ✨"
}
```

**Output schema (error)**:
```json
{
  "ok": false,
  "error_code": "VAULT_NOT_INITIALIZED",
  "error_message": "...",
  "remediation": "运行 mewmo app 完成首次初始化"
}
```

**Exit codes**: 0（success）/ 1（VAULT_NOT_INITIALIZED）/ 2（LLM_API_ERROR）/ 3（其他）

---

## 2. `/mewmo:search`（Phase 0 stub）

**SKILL.md 描述**：
```markdown
---
name: search
description: 在 mewmo vault 内全文搜索（含中文 jieba 切词 + BM25）
mewmo_version_required: ">=0.2.0"
---

## Usage

`/mewmo:search <query>`

## Behavior (Phase 0 stub)

返回固定提示「search 功能将在 Phase 1 完整实现，当前可手工 ripgrep <vault>」。

## Behavior (Phase 1 完整版)

走 SQLite FTS5 + jieba 切词 → 返回结果列表（路径 + 摘要 + 高亮）。
```

**Phase 0 实施**：scripts/main.py 直接返回 stub message + exit 0。

---

## 3. `/mewmo:query`（Phase 0 stub）

**SKILL.md 描述**：
```markdown
---
name: query
description: 用自然语言问 mewmo 你的 vault（猫读 index → drill → 回答）
mewmo_version_required: ">=0.2.0"
---

## Usage

`/mewmo:query <question>`

## Behavior (Phase 0 stub)

返回固定提示「query 功能将在 Phase 1 实现」。

## Behavior (Phase 1 完整版)

读 index.md → drill 走 parallel tool calls（5 页一次）→ 用猫 voice 回答 + 引用源。
```

**Phase 0 实施**：scripts/main.py 直接返回 stub message + exit 0。

---

## 4. `/mewmo:lint`（Phase 0 stub）

**SKILL.md 描述**：
```markdown
---
name: lint
description: 扫 vault 找矛盾 / 孤立页 / 缺 cross-ref / supertag 损坏等
mewmo_version_required: ">=0.2.0"
---

## Usage

`/mewmo:lint [--fix]`

## Behavior (Phase 0 stub)

返回固定提示「lint 功能将在 Phase 4 自我进化阶段实现」。

## Behavior (Phase 4 完整版)

[详细规则待 Phase 4 spec 定义]
```

**Phase 0 实施**：scripts/main.py 直接返回 stub message + exit 0。

---

## 5. SKILL.md 入口（顶层）

`~/.claude/skills/mewmo/SKILL.md`:

```markdown
---
name: mewmo
description: 一只住在你本地知识库里的 AI 猫——把文本 / URL 捕获到 vault，让猫帮你 bookkeeping
version: 0.2.0
sub_skills: [capture, search, query, lint]
---

## What is mewmo?

mewmo 是一个 vault-first 的 AI 信息管家。本地 markdown 是真理，猫做 bookkeeping。

## Usage

- `/mewmo:capture <text|url>` —— 捕获到 vault，由猫摘要 + 索引（已实现）
- `/mewmo:search <query>` —— 全文搜索 vault（Phase 1）
- `/mewmo:query <question>` —— 自然语言问 vault，猫回答（Phase 1）
- `/mewmo:lint` —— 扫 vault 健康度（Phase 4）

## Requirements

1. 安装 mewmo app（macOS）
2. 首次启动初始化 vault（~/Documents/mewmo-vault/）
3. 配置 LLM API key（macOS Keychain 或 ANTHROPIC_API_KEY 环境变量）

## More

详见 mewmo 仓库 README.md / docs/00-prd.md
```

---

## 跨进程并发协议

**关键约束**：mewmo 主 app 通过 `vault::io::*` 写 vault，外部 Claude Code 通过 `_shared/vault.py` 写**同一份 vault 文件夹**。两者必须协调。

**协议**：
1. 写敏感文件（全局聚合页 + 同一笔记）前，**两边都**走 mkdir-as-mutex：
   ```python
   # vault.py 端
   import os
   lock_dir = vault_path / ".mewmo" / ".locks" / resource_name
   while True:
       try:
           os.mkdir(lock_dir)
           break
       except FileExistsError:
           time.sleep(0.05)
           # 启动时检测 stale lock：lock_dir 存在但 mtime > 60s → 强制 rmdir
   ```
   ```rust
   // vault::io.rs 端
   loop {
       match std::fs::create_dir(&lock_dir) {
           Ok(_) => break,
           Err(e) if e.kind() == ErrorKind::AlreadyExists => {
               tokio::time::sleep(Duration::from_millis(50)).await;
               // 同样的 stale lock 检测
           }
           Err(e) => return Err(e.into()),
       }
   }
   ```

2. **每次只锁单一 resource**，不锁整个 vault：
   - resource = `wiki/index.md` / `wiki/log.md` / `<vault>/.mewmo/cat/memory/recent-focus.md` 等
   - 互不相关的 resource（如 `wiki/notes/foo.md` 和 `wiki/notes/bar.md`）可并行写

3. **stale lock 处理**：
   - 启动时（mewmo app 启动 / Skill 脚本启动）扫 `.mewmo/.locks/` 看是否有 mtime > 60s 的 dir → 强制 `rmdir`
   - 既能解死锁又不会冲掉短时间的真锁

4. **超时**：等锁 ≥ 30s 报 `VAULT_LOCKED` 错误

5. **释放**：写完 atomic rename 后立刻 `rmdir lock_dir`

6. **与 atomic rename 配合**：
   - mutex 防 lost update
   - atomic rename 防 partial-read race
   - 两者都需要（POC-7 实证）

---

## Skill 升级 / 同步

**FR-027 要求**：mewmo 升级时 `~/.claude/skills/mewmo/` 必须同步更新（不残留旧版）。

**协议**：
1. mewmo 启动时读 `~/.claude/skills/mewmo/version.txt`
2. 与 app bundle 内 `app/src-tauri/skills/version.txt` 比较
3. 不一致 → rsync 整个 skills 目录覆盖（包括删除已废弃的 sub-skill）
4. 写新 version.txt + log 一条同步记录

---

## 错误码（跨语言一致）

| code | 说明 | 双方都可触发 |
|------|------|-------------|
| `VAULT_NOT_INITIALIZED` | ~/.mewmo/config.json 不存在 | ✓ |
| `VAULT_PATH_MISSING` | config 指向的 vault_path 不存在 | ✓ |
| `VAULT_LOCKED` | mutex 等待超时 | ✓ |
| `INVALID_FRONTMATTER` | 解析失败 | ✓ |
| `LLM_API_ERROR` | LLM 调用失败 | ✓ |
| `LLM_API_KEY_MISSING` | Keychain / env 都没找到 key | ✓ |
| `SKILL_NOT_FOUND` | 内部猫调外部 Skill 时找不到 | 仅 mewmo 主 app |
| `SKILL_SPAWN_ERROR` | python3 不可用 | 同上 |
| `SKILL_TIMEOUT` | 60s/30s 超时 | 同上 |
| `MTIME_CONFLICT` | 写时检测外部已修改 | ✓ |
| `INGEST_QUEUE_FULL` | 极端高并发 | 仅 mewmo 主 app |
