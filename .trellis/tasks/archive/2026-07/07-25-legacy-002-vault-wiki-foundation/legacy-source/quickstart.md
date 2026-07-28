# Quickstart: Phase 0 开发者上手指南

> **目的**：开发者从零跑通 Phase 0 milestone（spec.md P2 hello-world ingest）的步骤。约 30-60 分钟可全部跑完，前提是 macOS + 已装 Rust / pnpm / Python 3.11+。

## 0. 先决条件

- macOS 13+
- Rust 1.75+（`PATH="$HOME/.cargo/bin:$PATH"` 已配，否则前缀加这个）
- pnpm 9+
- Python 3.11+（系统 python3 即可，外部 Skill 用）
- Anthropic API key（开发期可写入 `ANTHROPIC_API_KEY` 环境变量；生产从 macOS Keychain 读）
- 当前 branch = `feature/vault-wiki`

## 1. 装依赖

```bash
cd app

# Rust 端：6 个新 crate
# 编辑 src-tauri/Cargo.toml [dependencies] 段加：
#   notify-debouncer-full = "0.7"
#   atomicwrites = "0.4"
#   sanitize-filename = "0.6"
#   gray_matter = "0.3"
#   pulldown-cmark = "0.13"   # 仅 heading 用
#   handlebars = "6.4"

# TS 端：1 个新依赖 + 1 个开发依赖
pnpm add @ai-sdk/anthropic
pnpm add -D vitest @vitest/ui

# 拉取
pnpm install
PATH="$HOME/.cargo/bin:$PATH" cargo build --manifest-path src-tauri/Cargo.toml
```

## 2. Phase 0.1 — vault.ts IO 层骨架

按 `contracts/vault-io-trait.md` 实现 8 个不变式：

```bash
# 在 app/src-tauri/src/ 新建 vault/ 模块
mkdir -p src-tauri/src/vault
touch src-tauri/src/vault/{mod.rs,io.rs,frontmatter.rs,slug.rs,locks.rs}

# 在 app/src/lib/ 新建前端封装
touch src/lib/vault.ts src/lib/frontmatter.ts
```

**关键实现点**：
- `io.rs` 用 `atomicwrites` + `tokio::sync::Mutex` 守护全局聚合页（4 个 + tags _index.md = 5 个）
- `locks.rs` mkdir-as-mutex + stale lock 自愈（mtime > 60s 强制 rmdir）
- `frontmatter.rs` 用 `gray_matter` 包装，损坏时降级返回（不报错）
- `slug.rs` 用 `sanitize-filename` + 包装：emoji 过滤 + 长度 ≤ 80 字 + 中文保留 + 碰撞加 `-2`

**单元测试**（spec SC-013 IO 层 100% 覆盖）:
```bash
PATH="$HOME/.cargo/bin:$PATH" cargo test --manifest-path src-tauri/Cargo.toml vault::
# 应跑：test_atomic_kill_safety / test_concurrent_append / test_mtime_conflict /
#       test_stale_lock_cleanup / test_corrupt_frontmatter_graceful /
#       test_path_traversal_rejection
```

## 3. Phase 0.2 — vault 初始化命令

实现 `vault_initialize` Tauri command（`contracts/tauri-commands.md` §1）:

```rust
// src-tauri/src/lib.rs 在 generate_handler! 加：
//   vault::initialize, vault::get_config, vault::set_active_persona, ...
```

**验证**：
```bash
# 跑 dev
pnpm tauri dev

# 在 app 内任意触发 vault_initialize（开发期可用 dev tool 弹窗）
# → 检查 ~/Documents/mewmo-vault/ 出现：
ls ~/Documents/mewmo-vault/
# raw/  wiki/  .mewmo/

ls ~/Documents/mewmo-vault/.mewmo/cat/
# persona-curious.md persona-gentle.md persona-sharp.md persona-casual.md persona-steady.md
# voice-template.md  active.txt
```

**Acceptance**（spec P1）:
1. ✅ vault 三层结构齐全
2. ✅ Obsidian 打开 vault 文件夹能看到 raw / wiki（.mewmo 隐藏）
3. ✅ frontmatter 不被错误渲染为正文

## 4. Phase 0.3 — Skill 包部署

把 `app/src-tauri/skills/` 同步到 `~/.claude/skills/mewmo/`:

```rust
// vault::initialize 末尾加 skill 部署逻辑
// 用 std::fs / fs_extra crate 复制目录
```

**验证**：
```bash
ls ~/.claude/skills/mewmo/
# SKILL.md  capture/  search/  query/  lint/  _shared/  version.txt

cat ~/.claude/skills/mewmo/SKILL.md  # 看顶层 SKILL.md
```

## 5. Phase 0.4 — LLM 集成 + prompt cache

按 `contracts/tauri-commands.md` §3-§4 实现 ingest_text + cat_say:

```rust
// src-tauri/src/llm/anthropic.rs
//   - reqwest 直连 https://api.anthropic.com/v1/messages
//   - cache_control 透传（5m TTL）
//   - 流式输出走 tauri::ipc::Channel
//   - 调用前后打 JSON line 日志（cache_read_input_tokens 字段）
```

**验证 prompt cache 命中**:
```bash
# 触发同一前缀的 ingest 至少 2 次
# 检查日志
cat ~/Documents/mewmo-vault/.mewmo/logs/$(date -u +%Y-%m-%d).jsonl | \
  jq 'select(.type=="llm_call") | {step, cache_read_input_tokens, input_tokens}'

# 第一次应该是 cache_read_input_tokens=0
# 第二次开始应该 > 0（spec SC-004 ≥ 70% 命中率）
```

## 6. Phase 0.5 — Hello-world Ingest（P2 milestone）

```bash
# 启动 mewmo dev
pnpm tauri dev

# 在 app 内开 dev tool / 简易输入框
# 贴一段 200-2000 字文本（可以是这段 quickstart）
# 触发 invoke('ingest_text', { text: '...' })

# 应观察到：
# 1. wiki/notes/<slug>.md 出现，含合法 frontmatter
# 2. wiki/index.md 增量 append 一行
# 3. wiki/log.md 末尾 append 一条 ISO 时间戳记录
# 4. UI 弹一句猫 voice 反馈

ls -la ~/Documents/mewmo-vault/wiki/notes/
cat ~/Documents/mewmo-vault/wiki/index.md | tail -5
cat ~/Documents/mewmo-vault/wiki/log.md | tail -5
```

**Acceptance**（spec P2）:
1. ✅ ≤ 30s 完成（SC-003）
2. ✅ frontmatter 含 type / created / author / tags（FR-013）
3. ✅ index.md 仅 append 不重写（git diff 验证）
4. ✅ log.md ISO 8601 时间戳
5. ✅ cache 命中可观测

## 7. Phase 0.6 — 验证猫 persona 生效

```bash
# 在 mewmo 里触发 ingest，记录猫 voice 反馈
# 编辑 active persona
nano ~/Documents/mewmo-vault/.mewmo/cat/persona-curious.md
# 改"性格描述"段（如把"好奇"换成"挑剔"）

# 切换 active persona
echo "sharp" > ~/Documents/mewmo-vault/.mewmo/cat/active.txt
# 或调 vault_set_active_persona Tauri command

# 重新触发 ingest，对比 voice 输出
# 应该感受到风格差异
```

**Acceptance**（spec P3）:
1. ✅ 5 个 persona 文件齐全
2. ✅ 每次 LLM 调用前重读 persona.md（不缓存旧版）
3. ✅ 切换 persona 后下次 voice 反映新性格
4. ✅ 损坏 persona 降级到默认 + 警告

## 8. Phase 0.7 — Claude Code Skill 集成（P4）

```bash
# 退出 mewmo 主 app（确认进程不在）
ps aux | grep mewmo  # 应空

# 打开 Claude Code 终端
claude /mewmo:capture "测试外部捕获文本"

# 应该看到：
# - JSON 输出含 wiki_path / log_entry / voice_message
# - 检查 vault → 出现新 .md
# - log.md 末尾出现 captured_by=external-skill 记录
```

**跨进程并发测试**（spec SC-005）:
```bash
# 终端 A：mewmo dev 跑着 + 触发 ingest
# 终端 B：同时跑 claude /mewmo:capture
# 重复 100 次，验证：
wc -l ~/Documents/mewmo-vault/wiki/log.md
# 应等于 100 + 之前的行数（不丢一条）
```

**Acceptance**（spec P4）:
1. ✅ ~/.claude/skills/mewmo/ 部署完整
2. ✅ mewmo 不运行也能跑
3. ✅ 跨进程 0 起 lost update（SC-005）

## 9. Phase 0.8 — Supertag 骨架（P5）

```bash
# 手写一个 supertag
cat > ~/Documents/mewmo-vault/.mewmo/tags/book.md <<'EOF'
---
name: book
description: 读书笔记的 supertag
created: 2026-05-27T10:00:00Z
keywords: [读书, 阅读, 书评]
template_fields:
  - {name: author, type: string, required: true}
  - {name: title, type: string, required: true}
---

读书笔记用此 tag。
EOF

# 触发 tag_rescan（重启 mewmo / 调命令）
# 检查
cat ~/Documents/mewmo-vault/.mewmo/tags/_index.md
# 应看到 book 条目在 mewmo:managed-start/end fence 内
```

**Acceptance**（spec P5）:
1. ✅ supertag 文件被识别 + 进 _index.md
2. ✅ 损坏 supertag 跳过 + log 警告
3. ✅ fence 区分 mewmo 维护 / 用户编辑

## 10. e2e 集成测试

```bash
# Phase 0 完成时跑一次完整 e2e
bash tmp/e2e-test.sh
# 内容应覆盖：
#   - vault 初始化
#   - 5 个 P 各自 acceptance scenario
#   - 跨进程并发（A + B 100 次）
#   - kill -9 50 次原子性
#   - cache 命中率统计
#   - LLM 调用日志格式校验
```

## 排错

### `cargo build` 失败 / 找不到 cargo

```bash
source ~/.cargo/env
# 或永久加进 ~/.zshrc
echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> ~/.zshrc
```

### prompt cache 不命中（cache_read_input_tokens 一直 0）

- 检查 system prompt 是否含 `cache_control: {type: "ephemeral"}` 标记
- 检查 prompt 长度是否过 1024 token（Sonnet 4.6）/ 4096 token（Haiku 4.5 / Opus 4.7）阈值
- 5m TTL 内连续两次同前缀才命中（间隔太久会 expire）

### 跨进程 lost update

- 检查 `.mewmo/.locks/` 目录是否存在（应有）
- 检查 mkdir-mutex stale 检测逻辑（mtime > 60s 清）
- 用 strace（Linux）/ DTrace（macOS）追踪两边的 mkdir / rmdir 调用顺序

### Skill 子进程报 `python3 not found`

- 验证 `which python3` 返回路径
- mewmo bundle 用绝对路径 `/usr/bin/python3` 或让用户配置 `MEWMO_PYTHON_PATH` 环境变量

### vault 路径含中文 / 空格

- 命令行测试时用单引号包路径：`mewmo --vault '~/Documents/mewmo-vault'`
- atomicwrites + sanitize-filename 都已经测过中文路径

### Obsidian 打开 vault 时把 frontmatter 当正文

- 确保每个 .md 文件以 `---\n` 起始（之前是空白行会让 Obsidian 不识别）
- 启用 Obsidian "Strict line breaks" + "Properties in document" 设置

---

## 完成 Phase 0 的判定

参考 [spec.md SC](../spec.md#measurable-outcomes) 全部 15 项达标 = Phase 0 完成 = 可启动 [Phase 1 walking skeleton spec](../../specs/) 规划。

journal 同步 append `2026-XX-XX Phase 0 完成` entry，包含：
- 各 P acceptance 实测结果
- 5 项部分豁免在 Phase 0 实施过程中的实际影响
- POC 推出工程必做项（cache hit / parallel drill / 串行 ingest 等）的实测数据
- 暴露出来的 Phase 1 需要解决的新问题（用户 dogfood 反馈）

然后跑 `/speckit-tasks` 把上述 step 1-10 转成可执行的 tasks.md（约 30-50 个 task，按 5 个 user story 分组）。
