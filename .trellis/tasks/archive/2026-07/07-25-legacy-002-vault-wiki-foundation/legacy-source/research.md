# Phase 0 Research: 技术选型与未知项消解

> **本文是 [docs/02-architecture.md v1.0 §2 / §6](../../docs/02-architecture.md) 的提炼**——按 spec kit 模板的「Decision / Rationale / Alternatives considered」三段格式重组，让 plan / tasks / implement 阶段直接引用。原始调研 subagent 报告路径见架构文档附录 B。

**NEEDS CLARIFICATION 解决状态**：spec.md 与本 plan **0 个 NEEDS CLARIFICATION 标记**——所有可能模糊点（vault 路径 / 5 persona 设计 / vibe.db 边界 / 旧 spec 处理 / LLM provider / 测试覆盖 / 平台支持等）都在 PRD v1.1 + 架构文档 v1.0 + 宪法 v2.0.0 已敲定，spec.md Assumptions 段全部引用说明。**本 research.md 不开新调研，仅汇总已有结论**。

---

## 1. 文件系统 watcher

**Decision**: 使用 `notify-debouncer-full = "0.7"`

**Rationale**: 用户在 Obsidian / vim 等外部工具编辑 vault 内 .md 文件时，编辑器普遍走「写 swap → atomic rename」模式。`debouncer-full` 做 rename 配对，能识别这是一次"修改"事件而非"删 + 创"双事件。这对 FR-004「尊重用户外部编辑」是关键——错把 atomic save 识别成两个独立事件会让 mewmo 重复触发 ingest。

**Alternatives considered**:
- 直接 `notify` crate（不带 debounce）：要自己 throttle + 自己配对 rename，多 100 行代码且边界 case 容易漏
- `notify-debouncer-mini`：不做 rename 配对，会误报双事件——直接被否决
- 自己 polling（每 N 秒扫一次 vault）：CPU 开销大，且对大 vault（10k 文件）扫描时间 > 几秒，体验差

---

## 2. 进程内 Mutex

**Decision**: 使用 `tokio::sync::Mutex`（项目已有依赖，零新增）

**Rationale**: FR-008 要求全局聚合页（`wiki/index.md` / `log.md` 等）并发写串行化。Tauri 已经在用 tokio runtime，`tokio::sync::Mutex` 是异步友好的进程内 mutex 标配，无需新增依赖。

**Alternatives considered**:
- `std::sync::Mutex`：会阻塞 tokio worker thread，不适合 async 上下文
- `parking_lot::Mutex`：比 std 快但同样阻塞 worker；项目场景下性能差异在 LLM 调用前可忽略
- `dashmap`（细粒度锁）：mewmo 的全局聚合页是少量热点（4-5 个），不需要细粒度

---

## 3. 跨进程 Mutex

**Decision**: 使用 mkdir-as-mutex（POSIX 原子语义，POC-7 实证 100% 解 lost update），P1 备选 `fs4 = "1.1"` advisory lock

**Rationale**: FR-010 要求 mewmo 主 app + 外部 Claude Code Skill 跨进程并发写同一 vault 时不丢数据。mkdir 在 POSIX 系统是原子的（成功一个 / 失败一个），且**跨语言友好**——Rust 主进程和 Python Skill 脚本都能用 `mkdir` 系统调用，不需要私有协议。每次写敏感文件前 `mkdir <vault>/.mewmo/.locks/<resource>` 拿锁，写完后 `rmdir` 释放。

**注意 PRD §10.4 勘误**：原 PRD 说"macOS 默认无 flock"略不准——BSD flock 在 macOS 实际可用。但 mkdir-mutex 仍首选，**真正好处是跨语言友好**而非 macOS 兼容。

**Alternatives considered**:
- `flock` BSD（macOS 可用）：只在 Rust 端方便，Python `fcntl` 在 macOS 行为略异，跨语言协调不如 mkdir 干净
- `fs4` advisory lock：作为 mkdir-mutex 的 P1 备选（启动时检测 stale `.locks/` 目录失败时降级到 fs4），但 v1 不主推
- 主进程 IPC（Tauri command 序列化所有写）：违反 FR-025（Skill 命令必须能在 mewmo 主 app 不运行时跑通）

---

## 4. Atomic file write

**Decision**: 使用 `atomicwrites = "0.4"`

**Rationale**: FR-007 要求所有 vault 写必须原子（断电 / force-quit 不出现半截文件）。POC-7 实证直接 `>` 覆写在并发读时偶发 frontmatter 半截损坏（199 次读捕到 3 次）。`atomicwrites` 的 `tmp + mv` API 与 PRD §10.4 规则 1:1 对应，且错误时自动清理 tmp 文件（不留垃圾）。

**Alternatives considered**:
- 自己写 `std::fs::rename` + `tempfile`：多 50 行无收益
- `tokio::fs::rename`：异步友好但跨平台 rename 语义差异处理较 atomicwrites 弱
- 直接 `fs::write`：FR-007 直接禁止（POC-7 已证明会损坏）

---

## 5. Slug 生成

**Decision**: 使用 `sanitize-filename = "0.6"` + 薄包装层（emoji 过滤 + 长度限制 + 碰撞 `-2` 后缀处理 + 中文保留）

**Rationale**: FR-016 要求 slug 必须**支持中文保留**（不强制转拼音），过滤 emoji / 特殊字符 / 空格，碰撞自动加序号。`sanitize-filename` 处理跨平台不安全字符（`<>:"/\|?*` + 控制字符），中文字符默认保留。

**Alternatives considered**:
- ❌ `slug` crate：依赖 `deunicode` 把"AI 与知识管理"转成 `ai-yu-zhi-shi-guan-li`——**直接破坏 PRD §9.4 #8 的「中文保留」要求**。Rust 生态强先验推 `slug`，但本场景错。这是依赖选型必须看实际场景的典型例子（架构文档 §2.1.4 反先验段已警告）
- 自己手写 sanitize：跨平台不安全字符列表 + Unicode 控制字符列表自己维护成本高，sanitize-filename 已经维护好了

---

## 6. Tauri Skill runner（v1）

**Decision**: v1 用子进程 spawn（`tokio::process::Command`，零新增依赖）

**Rationale**: 30-200ms 子进程启动开销在 LLM 调用 1-3s 前几乎不可见。**真正收益**是 FR-028「内部猫和外部 Claude Code 调用同一份 Skill 实现」——猫调用通过 Tauri 内 spawn `python skills/capture.py`，外部 Claude Code 也是 spawn 同一个脚本，两者**字节级等价**。这是产品保证（PRD §6.3）。

**注意 PRD §6.3 勘误**：原 PRD 说「不走子进程性能更好」是优化预期不是硬约束——v1 子进程足够。

**Alternatives considered**:
- 嵌入 PyO3：性能略好（启动开销几乎零）但依赖大 + 跨平台 build 复杂；v2 升级路径，v1 不做
- Skill 用 Rust 重写：和外部 Claude Code 生态（Python / TypeScript Skill 脚本）不互通，违反 FR-028
- 预热 Skill 子进程池：v0 优化过早，v2 视性能数据再决

---

## 7. LLM provider 抽象（前端）

**Decision**: 前端用 `@ai-sdk/anthropic@^3.0.79`（Vercel AI SDK 内 Anthropic provider）

**Rationale**: Vercel AI SDK 主仓 24.5k stars，Anthropic provider 子包 mature。`cache_control` 通过 `providerOptions` 透传到 API（已实证）。前端流式 / 工具调用 / 思考链都封装好。

**Alternatives considered**:
- 直接 `@anthropic-ai/sdk`（官方）：能用但要自己包装 cache_control 参数；作为 P1 fallback（Vercel AI SDK 大改版时退回）
- LiteLLM Python：Python 依赖不划算，前端集成成本高
- OpenRouter：cache_control 透传未实证（其 docs URL 当前 404），仅作兜底

---

## 8. LLM provider 抽象（Rust 后端）

**Decision**: Rust 后端用 `reqwest` 自拼 JSON + 一个 trait + 3 方法（`generate / generate_stream / cache_status`）

**Rationale**: Rust 端 LLM SDK 生态不成熟（`anthropic-ai-sdk@0.2.27` / `async-anthropic@0.6.0` 都是个人或小团队 0.x 维护，质量不行；官方 `anthropics/anthropic-sdk-rust` 不存在 / GitHub 404）。`reqwest` 是 Tauri 已有依赖，自拼 50-80 行换来不被劣质 SDK 锁死的灵活性。

**Alternatives considered**:
- ❌ 第三方 0.x SDK：维护质量不行，被锁死后切换成本高
- ❌ 等官方 Rust SDK：截至 2026-05 不存在
- LangChain Rust：依赖大且 mewmo 不需要 chain / agent 抽象（猫的编排在 cat/ 模块自己写）

---

## 9. Prompt cache

**Decision**: **必启**（POC-2/6 双源验证），全链路用 Anthropic 原生 `cache_control`

**Rationale**: API 实测：4 个 cache breakpoint 上限，5m TTL 写入 1.25× / 1h TTL 写入 2× / 读 0.1×。**Break-even ≈ 1.28 次复用**——mewmo 同一会话内 system prompt + persona + voice template + index.md 重复读必然 ≥2 次，数学稳赚。Sonnet 4.6 最低 1024 token / Haiku 4.5 / Opus 4.7 最低 4096 token 才 cache，mewmo 的 prompt 长度都过线。命中状态用 `response.usage.cache_read_input_tokens` 字段直接打点（FR-014 / FR-035）。

**Alternatives considered**:
- 不启 cache：每次完整重发，POC-2 实测 ¥0.4964 → ¥0.7244 单次成本（基线 → 上界），日 50 次 ≈ ¥25-36/天；启 cache 后预计降到 ¥5-8/天
- 自实现 cache（Redis / 文件）：和 LLM provider 端 cache 不一样（provider 内置的是 KV 提示前缀缓存，自实现是回答级缓存——前者命中率高得多）；不互斥，未来 v2 可叠加

---

## 10. LLM 流式输出

**Decision**: 使用 `tauri::ipc::Channel<T>`（Tauri 官方 docs 明确推荐 streaming 用 Channel 而非 `emit`）

**Rationale**: `Channel` 是 Tauri 2 为流式场景设计的 IPC 抽象，反压 / 取消 / 序列化都比 `emit + listen` 干净。`tokio::CancellationToken` 配合 Channel 处理用户中途取消。

**Alternatives considered**:
- `app.emit("stream", chunk)` + 前端 listen：可用但反压 / 取消不易做对
- WebSocket 内嵌：mewmo 单进程桌面 app 不需要这么重

**错误处理**：终态不自动重连，向用户暴露重试选项（fail-loud 原则，FR-015）。

---

## 11. HTML 模板引擎

**Decision**: 使用 `handlebars = "6.4"`（Rust）

**Rationale**: 与 npm `handlebars@4.7.9` **同语法** → Rust 端渲染（猫产出导出报告）+ TypeScript 端预览**用同一份模板**，self-contained CSS / 图片 inline 友好。

**Alternatives considered**:
- `tera = "1.20"`：功能强但 2.0 alpha 不稳
- `minijinja = "2.20"`：最轻但 TS 端没等价语法
- ❌ React component 当模板：锁死分享场景，无法导出 self-contained HTML 文件给用户外部用

---

## 12. Markdown parser / renderer

**Decision**: 前端**保持现状** `marked@18.0.4`（已装，[ClipReader.tsx](../../app/src/components/ClipReader.tsx) 用，已踩坑融入 inline HTML 透传逻辑）；Rust 端**仅**在需要提 heading 时加 `pulldown-cmark = "0.13"`

**Rationale**: 现有代码已踩过 inline HTML 透传 bug（journal 2026-05-27 reader 闪两下），换 parser 等于重新踩坑。Phase 0 不强行统一前后端 parser；分工：前端渲染用 marked，Rust 端只在结构化解析（提 heading 给 TOC / parseHeadings.ts 等）时用 pulldown-cmark。

**Alternatives considered**:
- 全栈换 unified.js / remark：迁移成本高，对 Phase 0 milestone 无帮助
- 前后端用不同 parser 但要求字符级一致：mewmo 不做严格 round-trip，能渲染 + 能解析 heading 即可

---

## 13. YAML Frontmatter（**唯一明确新增依赖**）

**Decision**: 使用 `gray_matter = "0.3"`（Rust）；前端可选 `gray-matter` npm 包（双端一致）

**Rationale**: 54k 月下载，2025-07 发布，是 Rust 真空地带的成熟方案。FR-002 / FR-013 要求所有 wiki 页含 YAML frontmatter，必须有可靠解析器。

**Alternatives considered**:
- 自己 `serde_yaml` + 字符串切分 `---`：边界 case 多（开头 BOM / 多余空行 / `---` 在正文出现），自己处理坑多
- 不用 frontmatter（用文件名编码元数据）：违反 FR-002 + 不兼容 Obsidian DataView 等插件生态

---

## 14. HTML readability

**Decision**: **保持现状**——手写 `clip_parser.rs`（693 行 `scraper@0.22`，针对中文站点精调：公众号 `#js_content` / `cdn_url_1_1` / IP 属地 / 知乎 `.RichText`）。末尾 fallback 加 readabilityrs 处理奇葩网页。

**Rationale**: 中文站点 readability 是 mewmo 的差异化壁垒之一。`readabilityrs@0.1.3` 用 Mozilla 通用算法，会丢中文优化字段（`wx_publish_ts` / `cdn_url_1_1` 等）。换它 = 用户已经习惯的剪藏体验退化。

**Alternatives considered**:
- ❌ 全部换 readabilityrs：丢中文优化字段
- 全部 LLM-based readability：每次剪藏多调一次 LLM，成本上升 + 速度慢
- 维持现状但定期跑 OWASP test cases：纳入 plan（架构文档 §6 风险段）

---

## 15. HTML sandbox

**Decision**: **保持现状**——手写 `sanitizeHtml.ts`（128 行 DOM-walk + rich/highlight 双模式）+ 补 `tauri.conf.json` CSP 第二层防护

**Rationale**: 现有 sanitize 已踩过暗色模式适配 bug（journal 中关于颜色 inline HTML 处理），换 DOMPurify 等通用库会再踩一遍。CSP 当前为 `null`，Phase 0.2 加 vault tab 时收紧成 `default-src 'self'; script-src 'self'; ...; connect-src 'self' https://api.anthropic.com`（架构文档 §7.3 已规划）。

**Alternatives considered**:
- DOMPurify：通用但和现有暗色 / inline 逻辑不兼容
- 不补 CSP（继续 null）：第二层防护缺失，FR-037 风险更高

---

## 16. 全文检索

**Decision**: **完全不动**——`v4_search.sql` 已建 contentless FTS5 + jieba 应用层切词 + BM25 + 时间衰减 + LIKE fallback，全套就绪

**Rationale**: mewmo 当前规模 SQLite FTS5 足够（POC-1 实测 1000 页 LLM 直读 90% 准确）。架构文档 §3.8「不预先优化」原则——embedding / 向量库 / 复杂 RAG 都是 v2+。

**Alternatives considered**:
- ❌ 上 tantivy / qmd / meilisearch / Faiss：架构文档 §5.2 明确不上
- LLM 直读 + ripgrep 兜底：已是当前路径

---

## 17. POC 推出的工程必做项（不是依赖选型，是行为约束）

这些不是单一技术选型，是 POC -1 阶段（2026-05-27）实证的工程必做约束。**Phase 0 plan 必须把它们落进 implementation**：

- **Decision**: Anthropic prompt cache 全链路启用（system + persona + voice + index 全标 cache_control）—— POC-2/6 共同推出
- **Decision**: Drill 走 parallel tool calls（5 页一次发，禁串行）—— POC-6 推出，对应 Phase 0 query.rs stub 设计
- **Decision**: Haiku/Sonnet 混合定价（step 2 决定影响范围用 Haiku，step 3 重写用 Sonnet）—— POC-2 推出，cat/mod.rs 编排时分流
- **Decision**: Ingest 链串行调度（任务队列，禁并发跑两条）—— POC-7 推出 / FR-012
- **Decision**: LLM 输出长度上限（默认 400 字 / 详细 800 字）—— POC-6 推出，cat/voice.rs 强制 inject
- **Decision**: persona 每次重 inject（长 session 防跳戏）—— POC-3 推出 / FR-018
- **Decision**: 真实 LLM 推理速度实测校准（POC-6 是估算，第一周必跑 5 query 校准 ±30%）—— Phase 0 第一周加 dev tool

**Rationale**: 每条都对应 spec 中的 FR + SC，且 POC 已实证如不做会发生什么——成本失控（POC-2）/ 性能 13s 超阈（POC-6）/ lost update（POC-7）/ voice 退回中立 AI（POC-3）。

**Alternatives considered**: POC 已穷举，不做这些约束的代价 spec FR 已硬性要求覆盖。

---

## 18. mewmo 现有代码复用（不是新调研，是不引入新依赖的决策）

| 决策 | 复用对象 | 不复用 / 新建的 |
|------|---------|----------------|
| sanitize HTML | `sanitizeHtml.ts` 128 行 | 不引入 DOMPurify |
| 提 markdown headings | `parseHeadings.ts` | 不重写 |
| 日期分组（cat-diary 时间线 / 日报 / 周报）| `dateBuckets.ts` WEEKDAY / formatWeek | 不引入 dayjs / luxon |
| 附件管理 | `attachments.ts` save / cleanup_orphans | 不重写 vault/raw/files/ 引用追踪 |
| 浏览历史栈 | `historyStack.ts` Undo/Redo | 不重写 |
| Tauri invoke wrapper（含 retry）| `tauriCall.ts` | 不重写新 vault.* command 调用 |
| Tauri command 注册 | `app/src-tauri/src/lib.rs` 的 `generate_handler!` 宏 | 同模式扩 vault commands |
| Mutex<rusqlite::Connection> 锁 scope | 项目 code-quality rule #2（必须在 `.await` 前 drop）| 同模式 |
| Migration | `db.rs` MIGRATIONS 数组（u32, &str） + user_version 检查 | `vault-meta.db` 走同样模式 |
| list-summary-loading | 列表只返摘要 + content_loaded=false | vault 列表同样模式 |
| VITE_PORT env | 多 worktree 并行开发 | 不变 |

**Rationale**: 架构文档 §3.7 依赖最小化原则 + §4 现有代码可复用清单。Phase 0 引入 7 个新依赖是已经压缩到底线的数字，**不再因 Phase 0 需要而二次新增**。

**不复用（隔离开）**：
- `db.ts`（硬 invoke 'list_notes' / 'list_clips'）→ 新建 `vault.ts`，不和现有 `db.ts` 混
- `subscription.ts`（订阅源 SQLite 操作）→ 和 vault wiki 模式无交集
- vibe-coding 时代旧 4 tab 数据继续在 vibe.db，本 spec 不迁移

---

## 风险回退路径汇总

| 选型 | 失败模式 | 第二选择 | 切换成本 |
|------|---------|---------|---------|
| notify-debouncer-full | 误报双事件 / 漏 rename 配对 | 调 debounce 配置；极端情况降到 polling | 低 |
| mkdir-as-mutex | 进程 crash 留下 stale 死锁 | 启动时检测 `.locks/` + 强制清理；P1 启用 fs4 advisory lock 兜底 | 低 |
| atomicwrites | 跨平台 rename 语义差异 | 自己 `std::fs::rename + tempfile`（多 50 行）| 中 |
| sanitize-filename + 包装 | 中文 corner case 漏过 | 包装层加规则 + 单元测试覆盖 | 低 |
| 子进程 Skill runner | 启动开销 > 500ms（病态情况）| v2 升级 PyO3 嵌入或预热子进程池 | 中-高 |
| @ai-sdk/anthropic | Vercel AI SDK 大改版 / 依赖冲突 | 退回 `@anthropic-ai/sdk` 官方 | 低 |
| Rust reqwest 自拼 | API 格式变 | 抽象 trait 已有，只换实现 | 低 |
| prompt cache 涨价 / 不命中 | 成本超预算 | 退回完整重发 + 报警 | 低 |
| handlebars 双端语法漂移 | 模板两端渲染不一致 | 限用两端共有 helper + lint 脚本检测 | 低 |
| gray_matter 0.x 不稳 | API breaking change | 接抽象层换底层 crate | 低 |
| 手写 readability 漏中文 corner case | 公众号变种解析失败 | 末尾加 readabilityrs fallback + log 让用户人工 retrigger | 低 |
| 手写 sanitizeHtml 漏 XSS | 用户上传恶意 HTML 触发 script | tauri.conf.json CSP 第二层兜底 + 定期跑 OWASP test cases | 低 |
| SQLite FTS5 在 100k+ 文件后慢 | 查询 > 5s | 升级 tantivy 或 qmd | 中 |

---

## 总计新增依赖

**P0 立刻**（Phase 0.1 / 0.2 必装）：
- Rust：`notify-debouncer-full = "0.7"`、`atomicwrites = "0.4"`、`sanitize-filename = "0.6"`、`gray_matter = "0.3"`、`pulldown-cmark = "0.13"`（仅 heading 用）、`handlebars = "6.4"`
- TS：`@ai-sdk/anthropic@^3.0.79`、`vitest`（开发依赖）

**P1 备选**（视情况启用）：
- Rust：`fs4 = "1.1"`（mkdir-mutex 的 advisory lock fallback）

**Skill runner**：用 `tokio::process::Command`，零新增依赖。

**汇总**：Rust 6 个 + TS 1 个 +（P1 备选 1 个）= 7-8 个依赖。对比避免造的轮子（watcher / atomic write / readability / FTS / mutex / Skill 协议 / 模板引擎自实现）—— 收益远大于成本。
