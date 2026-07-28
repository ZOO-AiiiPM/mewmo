# Tasks: Vault + Wiki 架构骨架（Phase 0 Foundation）

**Input**: Design documents from `/specs/002-vault-wiki-foundation/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: 部分 task 含测试——**本 spec 显式要求 vault.ts/vault.py IO 层单元测试 100% 覆盖**（spec SC-013 + contracts/vault-io-trait.md 测试矩阵）。其他层（UI / agent 编排 / Skill 业务逻辑）按 mewmo 现有惯例手工验证 + 截图，不强制单元测试（plan.md Testing 段已申明）。

**Organization**: 按 spec.md 5 个 user stories（P1-P5）分 phase，每个 phase 独立可测可交付。

## 路径约定

- Tauri 后端 Rust：`app/src-tauri/src/` 下
- React 前端 TS：`app/src/` 下
- Skill 实现源：`app/src-tauri/skills/`（部署到 `~/.claude/skills/mewmo/`）
- e2e 测试脚本：`tmp/`（gitignore 内，不进 app bundle）
- 项目宪法：[`.specify/memory/constitution.md`](../../.specify/memory/constitution.md)

> **mewmo 是 Tauri 2 桌面 App，不是 Next.js**——任何 Vercel / Next.js plugin 触发的 hook 提醒（`use client` / RSC / Server Components）全部忽略（项目硬规则 [.claude/rules/ignore-vercel-hooks.md](../../.claude/rules/ignore-vercel-hooks.md)）

---

## Phase 1: Setup（Shared Infrastructure）

**Purpose**: 装依赖 + 建模块目录骨架。

- [ ] T001 在 `app/src-tauri/Cargo.toml` 的 `[dependencies]` 段加 6 个新 crate：`notify-debouncer-full = "0.7"` / `atomicwrites = "0.4"` / `sanitize-filename = "0.6"` / `gray_matter = "0.3"` / `pulldown-cmark = "0.13"` / `handlebars = "6.4"`，跑 `PATH="$HOME/.cargo/bin:$PATH" cargo build --manifest-path app/src-tauri/Cargo.toml` 验证编译通过

- [ ] T002 [P] 在 `app/package.json` 加 `@ai-sdk/anthropic@^3.0.79` 生产依赖 + `vitest` 和 `@vitest/ui` 开发依赖，跑 `pnpm install`

- [ ] T003 [P] 创建 `app/vitest.config.ts` 配置 vitest 运行环境（jsdom + alias 与 Vite 一致）

- [ ] T004 [P] 创建 Rust 模块目录骨架：`app/src-tauri/src/vault/{mod.rs,io.rs,frontmatter.rs,slug.rs,locks.rs,ingest.rs,query.rs,meta_db.rs}` + `app/src-tauri/src/llm/{mod.rs,anthropic.rs,log.rs}` + `app/src-tauri/src/cat/{mod.rs,persona.rs,voice.rs}` + `app/src-tauri/src/skill_runner.rs`，每个文件先放 `// TODO Phase 0` 占位 + 在 `app/src-tauri/src/lib.rs` 用 `mod vault; mod llm; mod cat; mod skill_runner;` 引入

- [ ] T005 [P] 创建 Skill 实现源目录：`app/src-tauri/skills/{capture,search,query,lint,_shared}/` + 顶层 `SKILL.md` + `version.txt`（值 `0.2.0`）+ 每个 sub-skill 下 `SKILL.md` 占位

- [ ] T006 [P] 创建前端 TS lib 骨架：`app/src/lib/vault.ts`、`app/src/lib/frontmatter.ts`、`app/src/components/vault/` 目录占位

---

## Phase 2: Foundational（Blocking Prerequisites）

**Purpose**: Layer 1 IO（vault.ts / vault.py）+ LLM provider + 日志 + meta_db schema——**所有 user story 的基础**。

**⚠️ CRITICAL**: 本 phase 完成前任何 user story 不能开始。

### Vault IO 层（Rust，对应 contracts/vault-io-trait.md 不变式 I1-I8）

- [ ] T007 实现 `app/src-tauri/src/vault/frontmatter.rs`：`gray_matter` 包装，含 `parse(content) -> Result<(FrontMatter, body), Error>` + 损坏时降级返回 `(None, 原文)` 不报错（不变式 I5）+ 跨语言 frontmatter 兼容（用 `serde_yaml` + `IndexMap` 保序，不变式 I6）

- [ ] T008 [P] 实现 `app/src-tauri/src/vault/slug.rs`：基于 `sanitize-filename` 的薄包装层，含 emoji 过滤 + 长度限制 80 字符 + 中文保留 + 碰撞 `-2` 后缀处理（FR-016 + research.md §5）

- [ ] T009 [P] 实现 `app/src-tauri/src/vault/locks.rs`：mkdir-as-mutex + 启动时 stale lock 自愈（mtime > 60s 强制 rmdir）+ RAII LockGuard（不变式 I4）

- [ ] T010 实现 `app/src-tauri/src/vault/io.rs` 的 `write_atomic`：用 `atomicwrites` crate `tmp + fsync + rename`，支持 `expected_mtime` 校验外部修改冲突（不变式 I1 + I3）+ 路径校验 `!is_absolute() && !contains("..")`（不变式 I7）

- [ ] T011 实现 `app/src-tauri/src/vault/io.rs` 的 `append_to_aggregate`：`tokio::sync::Mutex` 守护 5 个全局聚合页（`wiki/index.md` / `wiki/log.md` / `.mewmo/cat/memory/recent-focus.md` / `.mewmo/cat/memory/about-user.md` / `.mewmo/tags/_index.md`）+ 内部走 mkdir-as-mutex 跨进程协调（不变式 I2）

- [ ] T012 [P] 实现 `app/src-tauri/src/vault/io.rs` 的 `read` 和 `list`：read 返回 `(content, frontmatter, mtime)`，list 走 list-summary-loading 模式只返摘要（沿用 `app/src-tauri/src/db.rs` 列表惯例）

- [ ] T013 [P] 实现 `app/src-tauri/src/vault/io.rs` 的 `integrity_check`：启动时检查 vault_path 存在 + config 合法 + 三层目录齐全 + 清理 stale locks + 列出损坏 supertag

- [ ] T014 写 `app/src-tauri/src/vault/io.rs` 单元测试 `#[cfg(test)] mod tests`：`test_atomic_kill_safety`（kill -9 50 次验证不出现半截文件，不变式 I1）+ `test_concurrent_append`（双 writer 100 次 line_count=200，不变式 I2）+ `test_mtime_conflict`（不变式 I3）+ `test_stale_lock_cleanup`（不变式 I4）+ `test_corrupt_frontmatter_graceful`（不变式 I5）+ `test_path_traversal_rejection`（不变式 I7）—— 跑 `cargo test --manifest-path app/src-tauri/Cargo.toml vault::` 全过

### Vault IO 层（前端 TS wrapper）

- [ ] T015 [P] 实现 `app/src/lib/vault.ts`：基于现有 `tauriCall.ts` invoke wrapper 封装 `vault_*` Tauri commands（`read` / `writeAtomic` / `appendToAggregate` / `list` / `integrityCheck`）+ 错误码到中文 toast 映射

- [ ] T016 [P] 实现 `app/src/lib/frontmatter.ts`：用 `gray-matter` npm 包装 + 与后端 Rust `gray_matter` 双端一致解析行为（不变式 I6）

### LLM 集成

- [ ] T017 实现 `app/src-tauri/src/llm/mod.rs`：定义 `LLMProvider` trait（`generate / generate_stream / cache_status` 3 方法）+ 错误类型 `LLMError`（含子类 Timeout / RateLimit / AuthFail / NetworkError）

- [ ] T018 实现 `app/src-tauri/src/llm/anthropic.rs`：基于 `reqwest` 直连 `https://api.anthropic.com/v1/messages`，含 `cache_control` 透传（5m TTL）+ 流式输出走 `tauri::ipc::Channel<T>` + `tokio::CancellationToken` 取消（research.md §7-§10）

- [ ] T019 实现 `app/src-tauri/src/llm/log.rs`：每次 LLM 调用前后写 JSON line 到 `<vault>/.mewmo/logs/<YYYY-MM-DD>.jsonl`，必含字段：timestamp / type=llm_call / model / input_tokens / output_tokens / cache_read_input_tokens / cache_creation_input_tokens / latency_ms / cost_usd / step（FR-035 + data-model.md §9）

- [ ] T020 [P] 在 `app/src-tauri/src/main.rs` 启动逻辑里加：从 macOS Keychain 读 API key（默认）/ 失败时 fallback `ANTHROPIC_API_KEY` 环境变量（开发期）/ 都缺时报错可见（FR-037）

### Meta DB schema 占位

- [ ] T021 实现 `app/src-tauri/src/vault/meta_db.rs`：仿 `app/src-tauri/src/db.rs` 的 `MIGRATIONS` 数组（u32, &str），含 migration 1 = 4 张表占位（feed_stream / activity_events / notification_log / cat_memory_metadata，data-model.md §10）+ user_version 检查 + Phase 0 不写任何数据

### Tauri command 注册

- [ ] T022 在 `app/src-tauri/src/lib.rs` 的 `generate_handler!` 宏内注册所有新增 Tauri commands stubs（vault_* / ingest_* / cat_* / skill_* / tag_* / llm_* / log_*），每个 stub 函数返回 `Err("not yet implemented".into())` —— 让前端能 import 但调用会报错；后续 phase 逐个实现填实

**Checkpoint**: Foundation ready —— vault.ts IO 层单元测试 100% 通过、LLM 调用能跑通且日志可见、Meta DB schema 占位、所有 Tauri commands 注册（多数仍是 stub）。任何 user story 现在可以开始。

---

## Phase 3: User Story 1 - Vault 文件夹可见 + Obsidian 兼容（P1）🎯 MVP

**Goal**: 用户首次启动 mewmo，vault 三层文件夹结构落地，Obsidian / Finder 直接打开能用。

**Independent Test**: 装 mewmo → 首次启动 → 接受默认路径 → 退出 mewmo → Obsidian 打开 vault 文件夹 → 看到 raw / wiki 目录 + .md 文件 frontmatter 不被错误渲染。

- [ ] T023 [US1] 实现 `app/src-tauri/src/vault/init.rs` 的 `vault_initialize` 函数 + 在 `app/src-tauri/src/lib.rs` 注册 `vault_initialize` Tauri command（contracts/tauri-commands.md §1）：参数 `{ vault_path: string, conflict_resolution: "use-existing" | "abort" }`，创建三层目录结构（raw / wiki / .mewmo）+ 写 `~/.mewmo/config.json` + 调用 T031 部署 Skill 包

- [ ] T024 [P] [US1] 在 `app/src-tauri/src/vault/init.rs` 的 vault 初始化逻辑里，把 5 个 persona 占位文件复制到 `<vault>/.mewmo/cat/persona-{curious,gentle,sharp,casual,steady}.md` + `voice-template.md` + `active.txt`（默认值 `curious`）—— Phase 0 内容是骨架占位，T040 才填实际 persona 设计

- [ ] T025 [P] [US1] 在 `app/src-tauri/src/vault/init.rs` 创建 `<vault>/.mewmo/tags/` + `_index.md`（含 `<!-- mewmo:managed-start -->` `<!-- mewmo:managed-end -->` fence + 用户自由编辑区注释占位）+ 1-2 个示例 supertag 文件（如 book.md、ai.md）作为格式参考（FR-029）

- [ ] T026 [P] [US1] 在 `app/src-tauri/src/vault/init.rs` 创建 wiki / raw 全局聚合页占位：`raw/_index.md` + `wiki/_index.md` + `wiki/index.md` + `wiki/log.md`（log.md 可仅含 `# Mewmo Vault Activity Log\n` 头部）+ 创建子目录 `raw/{clips,feeds-archived,images,files}/` + `wiki/{notes,entities,topics,reports/{daily,weekly},cat-diary,todos/{active,done}}/`

- [ ] T027 [US1] 在 `app/src-tauri/src/vault/init.rs` 实现 vault 路径冲突处理（FR-005）：路径已存在非空目录 + 含 `.mewmo/config-marker.json` → "use-existing" 加载 / "abort" 报错；路径已存在但**无** marker → 拒绝 "use-existing" 防误覆盖第三方目录

- [ ] T028 [US1] 实现 `vault_change_path` Tauri command（contracts/tauri-commands.md §1）：`mode: "move"` 物理移动 vault（rsync + 校验 + 删除旧）/ `mode: "switch"` 仅切换 config 指向（用户已手工移过）

- [ ] T029 [US1] 实现 `vault_get_config` Tauri command 返回完整 `~/.mewmo/config.json` 内容

- [ ] T030 [US1] 在 `app/src/components/vault/` 新增 vault tab UI 骨架：左侧 sidebar 反映 raw / wiki 两层结构（折叠树）+ 右侧空状态提示（"vault 已初始化，往里贴点东西吧"，宪法原则 IV Empty State）—— 不要做完整 React UI（plan.md Empty State 部分豁免，落 Phase 1 walking skeleton）

- [ ] T031 [US1] 验证 Obsidian / Finder 兼容性：手动测试在 mewmo 不运行时 Obsidian 打开 vault 文件夹，5 个 acceptance scenarios（spec.md P1）全过；用 Obsidian 改一个 .md 文件保存后重启 mewmo 验证不被覆盖（FR-004）

**Checkpoint**: User Story 1 完整可独立测试，5 个 acceptance scenarios 全过，SC-001 + SC-002 满足。

---

## Phase 4: User Story 2 - Hello-world Ingest（P2，Phase 0 milestone）

**Goal**: 用户贴一段文本 → 猫摘要 → 写 wiki/notes/ + 增量更新 index/log + 一句猫 voice 反馈，cache 命中可观测。

**Independent Test**: 给 mewmo 一段 200-2000 字文本（mock LLM 或真实调用） → 30s 内看到 wiki/notes/ 新 .md（含 frontmatter）+ index/log 增量更新 + 猫 voice 反馈 + 日志 cache_read_input_tokens 字段从第二次起非零。

- [ ] T032 [US2] 实现 `app/src-tauri/src/cat/persona.rs`：`load_active_persona()` 函数**每次调用都重读** `<vault>/.mewmo/cat/active.txt` + 对应 persona-*.md（**不缓存**，FR-018 + POC-3 长 session 跳戏教训）+ 损坏 / 缺失时降级到内置默认 + log 警告（FR-020）

- [ ] T033 [US2] 实现 `app/src-tauri/src/cat/voice.rs`：`load_voice_template()` 读 voice-template.md + handlebars 渲染场景化模板（ingest-feedback / query-opening / error / proactive 四类）+ 强制 inject「输出长度上限」约束到 prompt（默认 400 字，POC-6 推出）

- [ ] T034 [US2] 实现 `app/src-tauri/src/cat/mod.rs` 的 `ingest_pipeline(text)`：step 1（Sonnet）调 LLM 生成结构化摘要（标题 + 正文 + tags 建议）；step 2（Haiku）决定影响哪些 entity / topic 页（Phase 0 仅 logging 不实写，避免 Phase 1 才完整；POC-6 parallel drill 留 Phase 1）；step 3（Sonnet 并行）重写被影响的 wiki 页（Phase 0 不实施，stub 留空函数）—— Haiku/Sonnet 混合定价（research.md §17 / POC-2）

- [ ] T035 [US2] 实现 `app/src-tauri/src/vault/ingest.rs` 的 `ingest_text` Tauri command（contracts/tauri-commands.md §3）：串行队列（同时只一条 ingest 链，FR-012）+ 调 cat::ingest_pipeline + 写 `wiki/notes/<slug>.md`（用 T008 slug 生成）+ append `wiki/index.md` + `wiki/log.md` + 返回 `{ wiki_path, log_entry, voice_message }`

- [ ] T036 [US2] 实现 ingest 链 fail-loud 错误处理（FR-015）：LLM 失败 → 用猫 voice 提示「我没 key 没法干活」「网断了」等具体场景 + 重试或人工干预选项；写文件失败 → 错误 toast + log 路径；中途失败时 log.md append 失败标记（架构文档 §3.3）

- [ ] T037 [P] [US2] 实现 `llm_get_today_usage` Tauri command + 前端 dev tool 简易看板：今日 LLM 调用次数 / cache 命中率 / 总 input/output tokens / 预计成本（FR-014 + spec SC-004 ≥ 70% 命中率验证）

- [ ] T038 [US2] 在 `app/src/components/vault/` 新增简易 ingest 输入框（dev tool 性质，不是产品级 UI）：textarea + "记一下" 按钮 → 调 `invoke('ingest_text', { text })` + 展示猫 voice 反馈 toast

- [ ] T039 [US2] 集成测试：跑 dogfood ingest 5 次（同一前缀），验证 spec SC-003 P95 ≤ 30s + SC-004 cache 命中率 ≥ 70% + spec P2 全部 7 个 acceptance scenarios

**Checkpoint**: Phase 0 milestone 达成 —— PRD §12 钦定的「猫读到一段文本 → 写 .md → 增量更新 index/log，prompt cache 命中可观测」端到端跑通。User Story 2 独立可测。

---

## Phase 5: User Story 3 - Cat Persona 用户可改 + voice 即变（P3）

**Goal**: 用户编辑 `.mewmo/cat/persona-*.md` → 下次 LLM 输出 voice 立即反映；切换 active persona 看到风格差异。

**Independent Test**: 触发 ingest 记录 voice → 编辑当前 active persona 文件 → 切换到另一个 persona → 重触发 → 对比两次输出能感受到风格差异。

- [ ] T040 [US3] 设计 5 个 persona 内容（`app/src-tauri/skills/_persona-templates/persona-{curious,gentle,sharp,casual,steady}.md`）：每个含 frontmatter（id / name / created / version）+ 性格描述 + 说话习惯 + 关键词触发偏好 + 长度偏好（data-model.md §5）—— 这是设计动作不是工程，需要小聚焦写好 5 段差异化文本

- [ ] T041 [US3] 设计 `voice-template.md` 8 场景模板（data-model.md §5）：ingest-feedback（3-5 变体让 cat 不重复）/ query-opening / error（API key 缺失 / 网络断 / 文件冲突等子类）/ proactive（主动行为开头）—— 模板用 handlebars 占位符（`{{path}}` `{{title}}` 等）

- [ ] T042 [US3] 实现 `cat_set_active_persona` Tauri command（contracts/tauri-commands.md §4）：参数 `{ persona_id: "curious" | ... }`，写 `<vault>/.mewmo/cat/active.txt` + 更新 `~/.mewmo/config.json` 的 `active_persona` 字段

- [ ] T043 [US3] 实现 `cat_get_active_persona` Tauri command：每次都重读不缓存，返回 `{ id, name, content, voice_template_content }`

- [ ] T044 [US3] 在 `app/src/components/vault/` 新增 persona 切换 UI：5 个 persona 卡片（含名字 + 简短描述）+ 当前 active 高亮 + 点击切换调 `cat_set_active_persona`

- [ ] T045 [US3] 集成测试：5 个 persona 盲测区分度（让第三方读三段同主题输出猜哪只猫，spec SC-007 ≥ 80%）+ 长会话一致性测试（连续 ≥10 次 LLM 调用 voice 不漂移，spec SC-008 ≥ 9/10，POC-3 标准）

**Checkpoint**: User Story 3 独立可测，spec P3 全部 5 个 acceptance scenarios 过。

---

## Phase 6: User Story 4 - Claude Code Skill 集成（P4）

**Goal**: 用户在 Claude Code 终端 `/mewmo:capture <text>` 跑通 hello-world，mewmo 主 app 不运行也能用，跨进程并发不丢数据。

**Independent Test**: 装好 mewmo 完成 vault 初始化 → 退出 mewmo → 在 Claude Code 输入 `/mewmo:capture 测试文本` → vault 出现新 .md + index/log 更新。

- [ ] T046 [US4] 实现 `app/src-tauri/skills/_shared/vault.py`：Python 端 IO 层，含 `read / write_atomic / append_to_aggregate / list / lock / integrity_check`，必须满足 contracts/vault-io-trait.md 8 个不变式 + 跨语言 frontmatter 兼容（I6 用 PyYAML safe_load + collections.OrderedDict 保序）+ mkdir-as-mutex 与 Rust 端同协议

- [ ] T047 [US4] 实现 `app/src-tauri/skills/_shared/anthropic_client.py`：Python 端 LLM 调用 + cache_control 透传 + JSON line 日志（与 Rust 端 log 格式一致，FR-035）

- [ ] T048 [US4] 实现 `app/src-tauri/skills/capture/scripts/main.py`：参数 `--json '{...}'` 或 stdin JSON，自动判断 input 是 URL（走 readability，Phase 0 stub fallback 到 text）还是 text，调 anthropic_client 生成摘要，调 vault.py 写 wiki/notes/ + 增量更新 index/log，stdout 返回 JSON `{ ok, wiki_path, log_entry, voice_message }`（contracts/skill-protocol.md §1）

- [ ] T049 [P] [US4] 写 `app/src-tauri/skills/SKILL.md`（顶层入口，contracts/skill-protocol.md §5）+ `capture/SKILL.md`（含完整 Behavior 描述）

- [ ] T050 [P] [US4] 写 `app/src-tauri/skills/{search,query,lint}/SKILL.md` 三个 stub + 对应 `scripts/main.py` 仅返回固定 stub message + exit 0（FR-023）

- [ ] T051 [US4] 实现 `app/src-tauri/src/skill_runner.rs` 的 `skill_invoke` Tauri command：用 `tokio::process::Command` spawn `python3 ~/.claude/skills/mewmo/<skill>/scripts/main.py --json '<args>'` + 60s 超时（capture）/ 30s（其他）+ stdout JSON 解析（contracts/tauri-commands.md §5）

- [ ] T052 [US4] 在 `app/src-tauri/src/vault/init.rs` 加 Skill 部署逻辑：vault_initialize 末尾对比 `app/src-tauri/skills/version.txt` 与 `~/.claude/skills/mewmo/version.txt` → 不一致则 rsync 整目录（含删除已废弃 sub-skill）+ 写新 version.txt + log 一条同步记录（FR-022 + FR-027）

- [ ] T053 [US4] 跨进程并发集成测试 `tmp/cross-process-test.sh`：起 mewmo dev + 同时跑 Claude Code `/mewmo:capture` 100 次（脚本化），验证 `wc -l wiki/log.md` = 200 + 之前的行数（spec SC-005 = 100 次 0 lost update，POC-7 通过标准）

- [ ] T054 [US4] 实现 vault 未初始化时 Skill 报错（FR-026）：vault.py 启动检查 `~/.mewmo/config.json` 存在 + `vault_path` 真实存在 → 不然报 `VAULT_NOT_INITIALIZED` + 提示「先启动 mewmo 完成初始化」（contracts/skill-protocol.md 错误码段）

**Checkpoint**: User Story 4 独立可测，spec P4 全部 5 个 acceptance scenarios 过 + SC-009 (≤30s) + SC-010 (≥95% 主 app 不运行成功率)。

---

## Phase 7: User Story 5 - 用户预设 supertag 模板（P5）

**Goal**: 用户在 `.mewmo/tags/<name>.md` 自定义 supertag → mewmo 扫描并维护 `_index.md` 的 mewmo 维护区段，不动用户自由编辑区。

**Independent Test**: 手写一个 supertag 文件 → 重启 mewmo → 检查 `_index.md` 自动出现该 tag 条目。

- [ ] T055 [US5] 实现 `app/src-tauri/src/vault/tags.rs`（新文件）的 supertag 解析：读 `.mewmo/tags/*.md` 的 frontmatter（name / description / keywords / template_fields，data-model.md §7）+ 校验必填字段 + 损坏时跳过 + log 警告（FR-031）

- [ ] T056 [US5] 实现 `tag_rescan` Tauri command（contracts/tauri-commands.md §6）：扫 `.mewmo/tags/*.md` → 更新 `_index.md` 的 mewmo 维护区段（用 fence `<!-- mewmo:managed-start -->` `<!-- mewmo:managed-end -->`，FR-032）+ 不动 fence 外的用户自由编辑区 + 返回 `{ added, updated, removed, errors: [{file, reason}] }`

- [ ] T057 [P] [US5] 实现 `tag_list` 和 `tag_get_template` Tauri commands（contracts/tauri-commands.md §6）

- [ ] T058 [US5] 实现 supertag 删除处理（FR-033）：用户从 vault 删除一个 supertag 文件 → 下次扫描 `_index.md` 移除条目 + **不连带删笔记里已用的该 tag**（笔记数据是真理）

- [ ] T059 [US5] 集成测试 spec P5 全部 5 个 acceptance scenarios + SC-011 / SC-012：手写 supertag → 重启验证 + 损坏 supertag 隔离 + `_index.md` mewmo 维护区与用户区分隔正确

**Checkpoint**: User Story 5 独立可测；Tag 系统骨架就绪，但 LLM 自动打 tag / 周更 lint 演化逻辑**留 Phase 1+**（FR-034 显式申明）。

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: 跨 user story 改进 + Phase 0 验收准备。

- [ ] T060 [P] 在 `app/src/components/vault/` 新增 LLM 用量看板：调 `llm_get_today_usage` 显示今日 cache hit rate / cost / 调用次数图表（手工验证 spec SC-014 100% 留日志）

- [ ] T061 [P] 写 e2e 集成测试 `tmp/e2e-test.sh`：覆盖 5 个 P 各自 acceptance + 跨进程并发场景（A + B 100 次） + kill -9 50 次原子性 + cache 命中率统计 + LLM 调用日志格式校验（quickstart.md §10）

- [ ] T062 [P] 真实 LLM 推理速度第一周校准：跑 5 个不同长度文本（200/500/1000/1500/2000 字）的 ingest，记录实际 latency + cache 命中率，在 journal append 一条「Phase 0 P0 速度实测校准」entry（POC-6 是估算 ±30%，第一周必跑）

- [ ] T063 [P] 收紧 `app/src-tauri/tauri.conf.json` 的 CSP（当前 null）：`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://api.anthropic.com`（架构文档 §7.3）

- [ ] T064 [P] 在 `app/src-tauri/capabilities/default.json` 加 vault 相关权限：`fs:scope` 限定只能读写 vault 路径 + `dialog:open` 用户改 vault 路径时弹文件夹选择器 + `shell:execute` 子进程 spawn Skill runner（架构文档 §7.3）

- [ ] T065 [P] API key 静态扫描验证：跑 `rg -i 'sk-ant-' app/src/` `rg -i 'sk-ant-' app/src-tauri/src/`（前端代码 + 网络请求体 + 日志）— 0 命中（spec SC-015 + 宪法 Vibe coding 安全底线）

- [ ] T066 [P] 写 `docs/03-poc-report.md`：整合 `tmp/poc/group-{A,B,C}/REPORT.md` 三组 POC 原始报告 + 提炼「7 项工程必做项」段对照本 spec FR 清单（PRD §12 Phase -1 待办 + plan.md research.md §17）

- [ ] T067 跑完整 quickstart.md 10 步验证 → spec.md 全部 15 个 SC 实测达标 → 在 journal.md 顶部 append 「Phase 0 完成」 entry（含各 P acceptance 实测结果 / 5 项部分豁免在实施过程中的实际影响 / POC 推出工程必做项实测数据 / 暴露的 Phase 1 新问题），完成 Phase 0 整体验收

---

## Dependencies & Execution Order

### Phase 依赖

- **Phase 1 Setup**：无依赖，可立即开始
- **Phase 2 Foundational**：依赖 Setup 完成；BLOCKS 所有 user stories（vault.ts IO 层 + LLM provider + 日志框架是所有 phase 共享基础）
- **Phase 3-7 User Stories**：都依赖 Foundational 完成；五个 phase 可**并行**或按 P1→P2→P3→P4→P5 顺序进行
- **Phase 8 Polish**：依赖所有 user stories 完成

### User Story 间依赖

- **US1 vault 文件夹可见（P1）🎯 MVP**：依赖 Phase 2 完成，无其他 story 依赖；**这是 MVP**——做完它即使后续不做产品也立得住
- **US2 hello-world ingest（P2）**：依赖 Phase 2 完成 + Phase 3 US1（要有 vault 文件夹才能写）；**这是 Phase 0 钦定 milestone**
- **US3 cat persona（P3）**：依赖 Phase 2 + US1（persona 文件在 vault 内）+ US2（要有 LLM 调用才能验证 voice）
- **US4 Claude Code Skill（P4）**：依赖 Phase 2 + US1（vault 已初始化）+ US2（capture 业务逻辑等价于 ingest_text）
- **US5 supertag（P5）**：依赖 Phase 2 + US1（tags 目录在 vault 内），**与 US2/US3/US4 完全独立**——可与它们并行

### Phase 内依赖

- T007 frontmatter → T010 write_atomic（atomic write 需要 frontmatter 序列化）
- T009 locks + T010 write_atomic → T011 append_to_aggregate（append 需要锁 + 原子写）
- T007/T008/T009/T010/T011/T012/T013 全部 → T014 单元测试
- T017 LLM trait → T018 anthropic 实现 → T019 log 集成
- T023 vault_initialize → T024/T025/T026/T027（这些是 init 内部分逻辑）
- T032 persona load → T033 voice load → T034 cat::ingest_pipeline → T035 ingest_text command
- T046 vault.py + T047 anthropic_client.py → T048 capture/main.py
- T049/T050 SKILL.md → T052 部署逻辑 → T051 skill_runner

### 单 user story 内并行机会

**Phase 1 Setup** 全部 [P] 可并行（除 T001 Cargo 改动后 T004 才能 build 验证）

**Phase 2 Foundational**：
- T007 / T008 / T009 / T012 / T013 / T015 / T016 / T020 互不冲突文件，可并行（T010 / T011 / T014 串行依赖）

**Phase 3 US1**：T024 / T025 / T026 互不冲突（T023 完成 init 框架后并行）

**Phase 4 US2**：T032 / T037 不冲突可并行

**Phase 5 US3**：T040 / T041 设计动作可并行（不同文件）

**Phase 6 US4**：T049 / T050 SKILL.md 写文档可并行

**Phase 7 US5**：T057 与 T056 不同 command 可并行

**Phase 8 Polish**：T060 / T061 / T062 / T063 / T064 / T065 / T066 全部互不冲突，可并行；T067 必须最后

---

## Parallel Example: User Story 2 启动时

```bash
# Phase 4 启动时可并行的几条线：
# 1. cat persona 加载（T032）
Task: "Implement app/src-tauri/src/cat/persona.rs - load_active_persona 每次重读不缓存"

# 2. LLM 用量看板（T037）
Task: "Implement llm_get_today_usage Tauri command + 前端 dev tool 看板"

# 这两个不冲突文件，能同时做。
# T033 voice 依赖 T032，T034 编排依赖 T033，T035 command 依赖 T034 → 必须串行
```

```bash
# Phase 6 US4 启动时可并行的几条线：
# 1. 写顶层 + capture SKILL.md（T049）
Task: "Write app/src-tauri/skills/SKILL.md and capture/SKILL.md per contracts/skill-protocol.md §5"

# 2. 写 search/query/lint stub SKILL.md + scripts（T050）
Task: "Write app/src-tauri/skills/{search,query,lint}/SKILL.md stubs and scripts/main.py returning固定 stub message"
```

---

## Implementation Strategy

### MVP First（仅 User Story 1）

1. 完成 Phase 1 Setup（T001-T006）—— ½ 天
2. 完成 Phase 2 Foundational（T007-T022）—— **2-3 天**（最重，IO 层不变式 8 个 + LLM 集成 + 日志，这是所有 user story 的共享基础，必须扎实）
3. 完成 Phase 3 US1（T023-T031）—— 1-1.5 天
4. **STOP and VALIDATE**：测试 US1 acceptance 5 个 scenarios 独立通过；vault 文件夹齐全、Obsidian 兼容、外部编辑被尊重、路径冲突有处理
5. **不打 release**（plan.md 部分豁免：Phase 0 P1 完成不打 .dmg，留 Phase 1 P1 完成 + 用户主用功能在线时再打）

**累计**：~4-5 天 = 1 周左右拿到 MVP

### Incremental Delivery（继续推进 Phase 0 完整）

5. 完成 Setup + Foundational + US1 → MVP 内部 demo
6. 加 US2 hello-world ingest（T032-T039）—— **2 天**（这是 Phase 0 钦定 milestone，cache 命中可观测 + ≤30s + fail-loud 错误处理）
7. 加 US3 cat persona（T040-T045）—— 1.5 天（persona 设计是关键创意工作 + 工程化集成）
8. 加 US4 Claude Code Skill（T046-T054）—— 2-2.5 天（Python IO 端 + capture + 部署机制 + 跨进程测试）
9. 加 US5 supertag 骨架（T055-T059）—— 1 天
10. Phase 8 Polish（T060-T067）—— 1-1.5 天（含真实 LLM 速度校准 + e2e + journal）

**累计**：~10-12 天 = **1.5-2 周**（与 PRD §12 Phase 0 估时一致，验证 plan.md 单 feature 1 周内 部分豁免的"实际每个 user story 1 周内"判断）

### Parallel Team Strategy（如果有多人）

仅在 mewmo 个人项目语境下不适用——单人 + Claude Code 协作。

如果有 2 人:
1. 共同完成 Setup + Foundational
2. 一旦 Foundational done：
   - 开发者 A：US2 + US4（ingest 链 + Skill 集成，技术栈相关）
   - 开发者 B：US1 + US3 + US5（vault 初始化 + persona 设计 + tag 骨架，相对独立）
3. 各自完成后集成

---

## Notes

- **[P] 标记**：不同文件 + 无依赖（既不被前序 task 改写、也不修改后续 task 改的文件）
- **[Story] 标签**：US1-US5 对应 spec.md 的 P1-P5；Setup/Foundational/Polish 不带 Story 标签
- **每个 user story** 独立可完成、独立可测试；Phase 内一个 user story 失败不影响其他 user stories 实施
- **测试策略**：vault.ts/vault.py IO 层强制单元测试 100%（T014 + 跨语言集成测试 T053）；其他层手工 + dev tool 验证；e2e 在 T061
- **每个 task 完成后** journal append 一条记录（PRD 宪法 journal 节奏要求）
- **避免**：模糊任务、同文件冲突、跨 story 隐式依赖破坏独立性
- **每个 Checkpoint** 是停下验证 user story 独立性的天然节点；Phase 0 完成 = T067 + journal entry
