# Feature Specification: Vault + Wiki 架构骨架（Phase 0 Foundation）

**Feature Branch**: `feature/vault-wiki`
**Created**: 2026-05-27
**Status**: Draft
**Input**: User description: "基于 docs/00-prd.md v1.1（mewmo PRD）+ docs/02-architecture.md v1.0（技术架构），做 Phase 0 底层骨架的 spec 开发——vault-first + wiki 模式 + 猫 agent 三合一架构的最小可见证据"

> **Scope 边界**：本 spec 仅涵盖 PRD §12 **Phase 0「底层骨架」** 范围（约 1.5-2 周开发量），目标是让架构成立且产品的核心承诺（vault-first / 猫有灵魂 / agent-native）有最小可见证据。**不包括** Phase 1「Walking Skeleton 完整剪藏 → 摘要 → 问答闭环」（留下次 spec）、Phase 2-6 各类内容资产 / 主动行为 / 自我进化 / 数据源扩展（PRD 路线图后续阶段）、以及 vibe-coding 时代旧 4 tab（笔记 / 剪藏 / 订阅 / 沉淀）的迁移或重构（独立任务）。

## User Scenarios & Testing *(mandatory)*

<!--
  User stories 按 P1 / P2 / P3 / P4 / P5 组织，每条独立可测、独立交付价值。
  P1 = vault-first 心智的最小可见证据（即使其他 P 全没做也立得住）；
  P2 = Phase 0 milestone（PRD 钦定："猫读到一段文本 → 写 .md → 增量更新 index/log"）；
  P3-P5 = 各自承担 PRD 一个核心差异化承诺的最小骨架（猫的灵魂 / agent-native / Tag 自演化）。
-->

### User Story 1 - 用户拥有可见的 vault，Obsidian 直接打开（Priority: P1）

用户首次启动 mewmo，系统在用户选定的位置（默认 `~/Documents/mewmo-vault/`）建立 vault 文件夹结构，包含三个分层：`raw/`（原始素材层）/ `wiki/`（合成层）/ `.mewmo/`（程序内部，隐藏目录）。所有 vault 内文件都是标准 markdown（含 YAML frontmatter）或常见格式（HTML / 图片 / PDF），无任何 mewmo 私有二进制格式。用户可随时用 Finder、Obsidian、VS Code 等任意工具直接打开浏览，**即使卸载 mewmo 数据仍完整可用**。

**Why this priority**: 这是 mewmo 与 Notion / Apple Notes 等闭源产品的本质差异化承诺——「数据永远属于你」。没有它整个 vault-first 心智模型不成立，后续所有 user story 都建立在这之上。即使 P2-P5 全部没做，仅凭 P1 用户也已经获得「可携带的本地知识库底座」这一独立价值。

**Independent Test**: 装 mewmo → 首次启动 → 选择或接受默认 vault 路径 → 退出 mewmo → 用 Obsidian 把 vault 文件夹打开为 Vault → 看到 `raw/` `wiki/` 两个目录（`.mewmo/` 因隐藏不显示但实际存在）+ 任何模板示例 .md 文件能正常渲染（标题 / frontmatter / 链接）。

**Acceptance Scenarios**:

1. **Given** 用户首次启动 mewmo，**When** 接受默认 vault 路径并完成初始化，**Then** 文件系统出现 `~/Documents/mewmo-vault/` 含 `raw/`（带 `_index.md` 占位）、`wiki/`（带 `_index.md` / `index.md` / `log.md` 三个全局聚合页占位）、`.mewmo/`（带 `cat/` `tags/` 子目录骨架）三层结构
2. **Given** vault 已建好但 mewmo 进程不在运行，**When** 用户用 Obsidian 打开 vault 文件夹，**Then** 所有 .md 文件正常显示，frontmatter 不被当作正文渲染（DataView 等插件友好），文件夹结构清晰
3. **Given** 用户在 Obsidian 里手工编辑了一个 .md 文件并保存，**When** 重新打开 mewmo，**Then** mewmo 能识别该改动（不报错、不覆盖、外部改动被尊重）
4. **Given** 用户希望把 vault 放在非默认位置（如 iCloud Drive 内或 git 仓库内），**When** 在初始化或设置中改 vault 路径，**Then** vault 在新位置正确建立，原位置（如有）不被清除
5. **Given** vault 路径冲突（已存在同名非空文件夹），**When** 初始化检测到，**Then** 提示用户选「使用现有 vault」/「换位置」/「取消」，**绝不静默覆盖现有数据**

---

### User Story 2 - Hello-world Ingest：贴一段文本，猫写 .md 并更新索引（Priority: P2）

用户提供一段文本（贴文 / 文章片段 / 一句话），mewmo 触发 ingest 链：调用 LLM 生成结构化摘要、写入 `wiki/notes/<slug>.md`（含合规 frontmatter）、增量 append 到全局 `wiki/index.md` 和时间线 `wiki/log.md`，最后用「猫的口吻」给一句简短反馈（如「记下来啦，存在了 notes/AI-and-knowledge.md」）。整个过程串行调度（同时只允许一条 ingest 链跑），写文件用原子方式（不出现半截写入），LLM 调用启用 prompt cache 且 cache 命中状态可观测。

**Why this priority**: 这是 PRD 钦定的 Phase 0 milestone 原话——「能 hello-world 跑通'猫读到一段文本 → 写一个 .md 文件 → 增量更新 index.md / log.md'，且 prompt cache 命中可观测」。它验证三件事同时成立：vault.ts IO 层（mutex + atomic rename）正确、LLM 集成跑通、ingest 链调度无 lost update。**这是 Phase 0「架构成立」的最强证据**——比 P1 的「文件夹建好」更进一步，证明数据流真的能闭合。

**Independent Test**: 给 mewmo 一段任意文本（mock LLM 响应或真实调用都行）→ 几秒内 vault 出现新的 `wiki/notes/<slug>.md`（含 type / created / source / tags 等 frontmatter）+ `wiki/index.md` 多了一行索引 + `wiki/log.md` append 一条时间戳记录 + UI 看到一句猫 voice 反馈 + 日志能看到 cache_read_input_tokens 字段（首次 miss / 第二次开始 hit）。

**Acceptance Scenarios**:

1. **Given** vault 已就绪、LLM API 可达，**When** 用户提交一段 200-2000 字的文本，**Then** ≤30 秒内 `wiki/notes/<slug>.md` 出现，含合法 frontmatter（type=user-note / created / author=cat / 自动建议的 tags）
2. **Given** 一次 ingest 完成，**When** 检查 `wiki/index.md`，**Then** 新页有一行索引（含相对路径 + 标题 + 创建时间），且**仅** append（不重写历史行，可由 git diff 验证）
3. **Given** 一次 ingest 完成，**When** 检查 `wiki/log.md`，**Then** 末尾 append 一条时间线记录（ISO8601 时间戳 + 事件类型 + 影响的页路径）
4. **Given** 同一文件被两条 ingest 链同时尝试更新（比如全局聚合页 `index.md` 是热点），**When** 调度器拦截，**Then** 实际**串行**执行，最终内容保留两次更新（**不允许 lost update**——POC-7 实证场景）
5. **Given** 写入过程中进程被强制 kill（断电 / 用户 force-quit），**When** 重启 mewmo，**Then** 不出现半截损坏的 .md（frontmatter 截断 / 内容只有前半）；文件要么是旧版要么是完整新版（atomic rename 语义）
6. **Given** LLM 调用，**When** 检查日志，**Then** 能看到 `cache_read_input_tokens` 字段；从第二次相同前缀的调用开始有非零命中
7. **Given** LLM 调用失败（网络断 / API key 错），**When** 错误发生，**Then** 用户**用猫 voice 看到**具体哪步失败 + 重试或人工干预选项（**不静默 swallow**——fail-loud 原则）

---

### User Story 3 - 用户改 cat persona，下次 LLM 输出 voice 立即变化（Priority: P3）

用户打开 `<vault>/.mewmo/cat/persona.md`（或选其中一个预设：好奇 / 温柔 / 锐利 / 散漫 / 沉稳），用任意编辑器修改性格描述、说话习惯、语气倾向，保存。**下一次** mewmo 触发 LLM 调用（不论是 ingest / query / 主动行为）输出的猫 voice 应能感知到这个改动（每次调用前 mewmo 重新读取当前 persona 文件 inject 到 prompt，不缓存旧版）。所有「猫的输出」都明确以猫的视角讲（「我看了你贴的文章...」/「我帮你存好了」），不出现「AI 摘要：」「已生成」等冷冰冰的工具语言。

**Why this priority**: PRD §5.3 把「猫是产品的灵魂」列为核心心智模型——「猫不是辅助功能，是产品本身」。如果用户没有「我能调教这只猫」的实证体验，mewmo 会退化成「带猫贴图的 ChatGPT 套壳」。POC-3 实证 5 个 persona 一致性 ≥9/10、盲测区分度 100%——技术上已通过，本 user story 是把 POC 成果工程化落地。

**Independent Test**: 触发任意有 voice 输出的动作（比如 P2 的 hello-world ingest 反馈）→ 记录 voice → 编辑 `<vault>/.mewmo/cat/persona.md`（比如从「好奇」切到「锐利」）→ 重新触发同样动作 → 对比两次输出，能感受到风格差异（用词 / 语气 / 长度倾向）；同一文本盲测给第三方读，能猜出是同一只猫但不同心情。

**Acceptance Scenarios**:

1. **Given** vault 初始化，**When** 检查 `.mewmo/cat/`，**Then** 包含 5 个预设 persona 文件 + `voice-template.md`（描述各场景下 voice 模板）+ 一个当前 active 标识（哪个 persona 当前生效）
2. **Given** 用户编辑当前 active persona 文件并保存，**When** 触发下一次 LLM 调用，**Then** 该次调用 prompt 中的 persona 内容 = 文件最新内容（**每次重 inject**，不依赖会话级缓存——POC-3 长 session 跳戏教训）
3. **Given** 用户切换 active persona（比如从「好奇」到「锐利」），**When** 触发同一个 ingest，**Then** 两次输出风格有可感知差异，盲测人能区分至少 4/5
4. **Given** persona.md 文件不存在或语法损坏（YAML frontmatter 不合法），**When** mewmo 尝试读取，**Then** **降级到内置默认 persona** + 用户可见警告（不是崩溃，也不是静默使用空 persona）
5. **Given** 长会话（同一 session 内连续 ≥10 次 LLM 调用），**When** 检查输出，**Then** voice 不漂移、不退回到「中立 AI 助手」语气（POC-3 实证场景）

---

### User Story 4 - Claude Code 终端用 `/mewmo:capture` 跑通 hello-world（Priority: P4）

mewmo 安装时把内置 Skill 包（capture / search / query / lint）部署到 Anthropic 标准位置（`~/.claude/skills/mewmo/`）。用户在任意终端打开 Claude Code，输入 `/mewmo:capture <一段文本或 URL>`，命令调起 mewmo 内同一份 Skill 实现，完成与 P2 等价的 ingest 动作（写 wiki/notes/ + 更新 index/log），返回新页路径 + 一句猫 voice 反馈。即使 mewmo 主 app **不在运行**，命令仍能跑通——这是「卸载 mewmo 数据仍可用，但 vault 上的 agent 能力同样不锁死」的实证。

**Why this priority**: PRD §6.1 把「Claude Code / Codex 等外部 LLM 工具是 vault 的二级用户」定为核心差异化承诺，PRD §6.3 把「内部猫和外部 Claude Code 共享同一份 Skill」定为产品保证。本 user story 是这个承诺最低成本的实证——只要 capture 跑通，「同一份 Skill」的架构基础就立住了，未来 search / query / lint 按同一模式扩。

**Independent Test**: 装好 mewmo → 启动一次完成 vault 初始化 → 退出 mewmo（确认进程不在）→ 在终端打开 Claude Code → 输入 `/mewmo:capture 这是测试文本` → 几秒后看到反馈 + 检查 vault → 看到新 .md 出现 + index/log 更新（与 P2 检查项相同）。

**Acceptance Scenarios**:

1. **Given** mewmo 首次启动完成，**When** 检查 `~/.claude/skills/mewmo/`，**Then** 包含 `SKILL.md`（入口说明）+ `capture/SKILL.md` + `scripts/`（实现）；其余三个 Skill（search / query / lint）至少有 stub（声明存在但 v0 可仅提示「未实现」）
2. **Given** Claude Code 运行 `/mewmo:capture <text>`，**When** 命令开始执行，**Then** 调用 mewmo Skill 实现 → 调 LLM → 写 vault → 返回路径
3. **Given** mewmo 主 app 同时也在运行（用户两边都开），**When** Claude Code 命令和 mewmo 主进程都尝试写同一全局聚合页，**Then** 跨进程协调正确（**不出现 lost update**——POC-7 跨进程场景，mkdir-mutex 等机制保证）
4. **Given** mewmo 没装或 vault 未初始化，**When** Claude Code 调 `/mewmo:capture`，**Then** 命令明确提示「未找到 vault，请先启动 mewmo 完成初始化」，不静默失败
5. **Given** Skill 实现未来更新（mewmo 升级），**When** 用户安装新版 mewmo，**Then** `~/.claude/skills/mewmo/` 内 Skill 同步更新（不残留旧版混用）

---

### User Story 5 - 用户预设 supertag 模板（Priority: P5）

用户在 `<vault>/.mewmo/tags/<tag-name>.md` 自定义一个 supertag（参考 Tana 概念：tag = 模板 + 描述 + 触发关键词）。每个 supertag 文件包含：tag 名称、人类描述、触发关键词列表、frontmatter 模板片段（如 `#book` 自动套 `{author, title, status, rating}`）。`.mewmo/tags/_index.md` 自动维护所有 tag 清单 + 描述 + 用过几次的统计。**本 spec 只做格式约定 + 数据骨架**——LLM 自动打 tag 时**复用现有 tag 列表**的逻辑、周更 lint 检测同义/死亡/涌现 tag 的逻辑都留 Phase 1+。

**Why this priority**: PRD §10.5 把 Tag 系统定为 P0 模块（不是 P3 的事后优化），但 Phase 0 milestone 只要求「`.mewmo/tags/_index.md` + supertag 模板格式」骨架。提前把数据结构定下来防 Phase 1 返工——一旦自动打 tag 上线再改格式 = vault 内已有标签全部要 migrate。优先级 P5 是因为没它产品也能跑（Phase 0 的核心证据是 P1-P4），但作为骨架它必须在 Phase 0 完成。

**Independent Test**: 在 vault 里手写一个 `.mewmo/tags/book.md`（按文档约定的格式）→ 重启 mewmo → 检查 `.mewmo/tags/_index.md` 是否自动更新出现这个 tag 条目 → 把它当 frontmatter 模板手工套到一个笔记 → 笔记的 frontmatter 字段符合 supertag 定义。

**Acceptance Scenarios**:

1. **Given** vault 初始化，**When** 检查 `<vault>/.mewmo/tags/`，**Then** 至少有 `_index.md`（全 tag 清单）和 1-2 个示例 supertag 文件作为格式参考
2. **Given** 用户手动创建一个 supertag 文件（按约定格式），**When** mewmo 下次扫描 tag 目录，**Then** `_index.md` 自动更新（含名称 + 描述 + 用过次数=0）
3. **Given** supertag 文件格式错误（YAML 不合法 / 缺必需字段），**When** 扫描时遇到，**Then** **跳过该 tag** + log 警告，不影响其他 tag 加载（fail-loud 但不致命）
4. **Given** `_index.md` 已存在用户手工编辑的内容（注释 / 备注），**When** mewmo 增量维护，**Then** 仅更新 mewmo 维护区段（用 fence 标记如 `<!-- mewmo:tags-managed-start -->` ... `<!-- mewmo:tags-managed-end -->`），不动用户自由编辑区
5. **Given** 用户从 vault 删除一个 supertag 文件，**When** 下次扫描，**Then** `_index.md` 中该 tag 条目相应移除（**不连带删笔记里已用的该 tag** —— 用户的笔记数据是真理）

---

### Edge Cases

- **vault 路径在外部被 rename 或移动**：mewmo 启动检测原路径不存在，提示用户重新指定，不创建新空 vault 覆盖旧引用
- **vault 在 git 仓库内且有 merge conflict**：mewmo 检测 .md 文件含 conflict marker（`<<<<<<<` 等），跳过该文件 + 用户可见提示，**不试图自动解决**
- **多 mewmo 进程同时启动**（用户在 dock 双击两次）：第二个进程检测 vault 锁文件 / pid，提示「mewmo 已在运行」并退出，不和第一个进程并行写入
- **`.mewmo/cat/persona.md` 含 frontmatter 但内容为空**：降级到内置默认 + 用户可见警告
- **LLM API key 缺失或过期**：所有需 LLM 的 user story（P2 ingest / P3 voice / P4 Skill）失败时用猫 voice 提示「我没 key 没法干活，去设置里加一下吧」，但 P1（vault 文件夹结构）+ P5（tag 静态格式）不依赖 LLM，仍正常工作
- **vault 文件夹被 iCloud / Dropbox 同步导致 .md 在本机被远端覆盖**：mewmo 用 file watcher 检测外部改动，重新加载，不报错
- **用户预设 supertag 模板里的 frontmatter schema 与现有笔记字段冲突**（Phase 0 不自动应用所以不会冲突；但要在文档里说清楚 Phase 1 设计时如何处理）
- **跨进程 mewmo 主 app + Claude Code Skill 同时写 `wiki/index.md`**：两边都过 mkdir-as-mutex 协调，最终内容保留两次 append（POC-7 实证场景）
- **vault 内被外部工具加了非 .md 的二进制文件**（如用户手工拖 .pdf 进 raw/files/）：mewmo 扫描时识别但不解析内容，仅作引用，不报错

---

## Requirements *(mandatory)*

### Functional Requirements

#### Vault 结构与可携带性（对应 P1）

- **FR-001**: 系统必须在用户选定路径（默认 `~/Documents/mewmo-vault/`）创建标准三层 vault 结构：`raw/`（原始素材）/ `wiki/`（合成层）/ `.mewmo/`（程序内部，隐藏）
- **FR-002**: vault 内所有用户可见数据必须以标准 markdown（含 YAML frontmatter）或常见格式（HTML / 图片 / PDF）存储，**不允许**任何 mewmo 私有二进制格式
- **FR-003**: 用户必须能用 Finder / Obsidian / VS Code 等任意工具直接打开浏览 vault，且 mewmo 卸载后数据完整可用
- **FR-004**: 系统必须尊重用户在 mewmo 之外对 vault 文件的手工编辑（不覆盖、不删除、不报错）
- **FR-005**: vault 路径冲突（已存在同名非空文件夹）时，必须提示用户选择「使用现有」/「换位置」/「取消」，**绝不静默覆盖**
- **FR-006**: 系统必须支持用户在初始化后改 vault 路径（不强制锁死默认位置）

#### Vault IO 层（对应 P2 / P4 共享基础）

- **FR-007**: 系统对 vault 内任何文件的写入必须是**原子的**——要么全部成功要么完全不写，不出现半截损坏（用户在写入过程中 force-quit / 断电时 .md 内容要么是完整旧版要么是完整新版）
- **FR-008**: 系统对全局聚合页（`wiki/index.md` / `wiki/log.md` / `.mewmo/cat/memory/recent-focus.md` / `.mewmo/cat/memory/about-user.md`）的并发写必须**串行化**，**不允许 lost update**（同一文件被两个 writer 同时基于旧版本修改时，最终内容必须保留两次修改）
- **FR-009**: 系统对 `wiki/index.md` 和 `wiki/log.md` 的更新必须是**增量 append**（不全量重写历史），可由 git diff 验证仅追加
- **FR-010**: 系统必须支持跨进程协作（mewmo 主 app + 外部 Claude Code Skill 同时写 vault），跨进程并发写同一全局聚合页时仍满足 FR-008 不丢数据要求

#### Ingest 链最小闭环（对应 P2）

- **FR-011**: 系统必须支持「贴一段文本」的最小 ingest 入口（开发期可以只是命令行 / 简易 dev tool 入口，不必有完整 React UI）
- **FR-012**: ingest 必须串行调度（同一时刻最多一条 ingest 链运行），后到的请求排队
- **FR-013**: ingest 完成后必须产生：`wiki/notes/<slug>.md`（含合法 frontmatter）+ `wiki/index.md` 增量更新 + `wiki/log.md` 增量更新 + 一句猫 voice 反馈
- **FR-014**: LLM 调用必须启用 prompt cache（用 LLM provider 原生缓存机制）；cache hit / miss 状态必须可观测（日志含 cache_read_input_tokens 等字段，用户可在「今日 LLM 用量」摘要看到命中率）
- **FR-015**: ingest 链中途任何步骤失败（LLM / 文件写）时，错误必须**用户可见**（猫 voice 描述具体哪步失败 + 重试或人工干预选项），**不静默吞错**
- **FR-016**: ingest 产出的 .md 文件名（slug）生成规则必须支持中文保留（不强制转拼音），过滤 emoji / 特殊字符 / 空格，碰撞时自动加序号

#### 猫 Persona / Voice（对应 P3）

- **FR-017**: vault 初始化时 `<vault>/.mewmo/cat/` 必须包含 5 个预设 persona 文件 + `voice-template.md`（场景化 voice 模板）+ 一个 active persona 标识
- **FR-018**: 用户必须能通过编辑 `.mewmo/cat/persona-*.md` 改变猫的性格 / 说话习惯，**下次** LLM 调用立即生效（每次调用前重读文件，不依赖会话级缓存）
- **FR-019**: 用户必须能在 active persona 之间切换（5 选 1），切换后下次 LLM 输出反映新 persona
- **FR-020**: persona 文件不存在或损坏时，系统必须**降级到内置默认** + 用户可见警告（不崩溃 / 不静默用空 persona）
- **FR-021**: 所有「猫的输出」必须以猫的视角讲（如「我看了...」「我帮你存好了」），不出现「AI 摘要：」「已生成报告」等中立工具语言

#### Skill 包对外接口（对应 P4）

- **FR-022**: mewmo 安装时必须把内置 Skill 包部署到 `~/.claude/skills/mewmo/`（Anthropic 标准位置）
- **FR-023**: Skill 包必须包含 `SKILL.md` 入口 + `capture/`（完整可用）+ `search/` `query/` `lint/`（至少 stub，声明存在）
- **FR-024**: 用户必须能在 Claude Code 终端运行 `/mewmo:capture <text|url>` 完成与 P2 等价的 ingest 动作
- **FR-025**: Skill 命令必须能在 mewmo 主 app **不运行**时仍跑通（vault 已初始化即可）
- **FR-026**: vault 未初始化时调用 Skill 命令必须明确提示「先启动 mewmo 初始化 vault」，不静默失败
- **FR-027**: mewmo 升级时 `~/.claude/skills/mewmo/` 必须同步更新（不残留旧版）
- **FR-028**: 内部猫 agent 和外部 Claude Code 必须**调用同一份 Skill 实现**——同一份代码，不同 runner（不允许两份分叉实现）

#### Tag 骨架（对应 P5）

- **FR-029**: vault 初始化时 `<vault>/.mewmo/tags/` 必须包含 `_index.md`（全 tag 清单 + 元信息）和 1-2 个示例 supertag 作为格式参考
- **FR-030**: 用户手写 supertag 文件后，系统必须能扫描并把它纳入 `_index.md`（条目含 名称 / 描述 / 用过次数）
- **FR-031**: supertag 格式错误时跳过该 tag + 日志警告，不影响其他 tag 加载
- **FR-032**: `_index.md` 必须区分「mewmo 维护区段」（用 fence 标记）和「用户自由编辑区」，更新时只动维护区
- **FR-033**: 用户删除 supertag 文件时 `_index.md` 移除相应条目，但**不连带删笔记里已用的该 tag**（笔记数据是真理）
- **FR-034**: 本 spec 范围内**不实现** LLM 自动打 tag、周更 lint 演化建议、tag 合并建议——仅做格式约定 + 静态数据骨架，自动化逻辑留 Phase 1+

#### 跨切面工程要求

- **FR-035**: 所有 LLM 调用、cache hit/miss、文件锁获取释放、Skill 调用必须留结构化 JSON 日志（按行）到 `<vault>/.mewmo/logs/<YYYY-MM-DD>.jsonl`
- **FR-036**: 所有 vault IO 必须经唯一 IO 接口（架构文档 §1.5 vault.ts / vault.py 双语言共享 IO 层），UI / Skill / agent 不绕开直接读写文件系统
- **FR-037**: API key 必须存 macOS Keychain（默认）或环境变量（开发期 fallback），**不允许**写入明文文件 / 打包进前端代码 / 出现在网络请求 URL 或日志

### Key Entities *(include if feature involves data)*

- **Vault**：用户的本地知识库根目录，三层结构（raw / wiki / .mewmo）。属性：路径、初始化时间、当前 active persona id、当前版本（用于未来 schema migration）
- **Raw 素材**：用户或 ingest 链放入 `raw/clips/` / `raw/feeds-archived/` / `raw/files/` / `raw/images/` 的原始内容。**不可改**——是真理证据。属性：源 URL（如有）、抓取时间、原始格式、关联的 wiki 摘要页路径
- **Wiki 页**：`wiki/notes/` / `wiki/entities/` / `wiki/topics/` / `wiki/reports/` / `wiki/cat-diary/` / `wiki/todos/` 下的 .md 文件。**LLM 可写可改**——是合成层。属性：type（user-note / wiki-summary / entity / topic / report / cat-diary / todo）/ created / updated / author（user / cat）/ tags / source（指向 raw）/ related（其他 wiki 页路径）
- **全局聚合页**：`wiki/index.md`（主索引）/ `wiki/log.md`（时间线，append-only）/ `.mewmo/cat/memory/recent-focus.md`（近期关注）/ `.mewmo/cat/memory/about-user.md`（长期画像）。多 writer 协调热点，必须串行化更新
- **Cat Persona**：`.mewmo/cat/persona-*.md`（5 预设）+ `voice-template.md`（场景化模板）+ active 标识。属性：性格名称、性格描述（自由文本）、说话倾向、关键词触发偏好、长度偏好
- **Cat Memory**：`.mewmo/cat/memory/threads/`（长期对话线程）+ `recent-focus.md` + `about-user.md`。Phase 0 仅建文件骨架，更新逻辑留后续
- **Supertag**：`.mewmo/tags/<tag-name>.md`，含名称 / 描述 / 触发关键词 / frontmatter 模板片段。属性：名称、描述、关键词列表、模板字段、用过次数（在 `_index.md` 维护，不是单条 tag 文件维护）
- **Skill 包**：`~/.claude/skills/mewmo/` 下的 capture / search / query / lint 四个 Skill。属性：name、入口脚本路径、描述、调用协议（同 Anthropic 标准 Skill 格式）
- **LLM 调用日志**：`.mewmo/logs/<YYYY-MM-DD>.jsonl` 内的结构化记录。属性：时间、调用类型、input_tokens、output_tokens、cache_read_input_tokens、cache_creation_input_tokens、latency、cost、success/error、error_message

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

#### vault-first 核心承诺

- **SC-001**: 用户在 mewmo 卸载后用 Obsidian 打开 vault 文件夹，能看到 100% 的 .md 文件（不少不缺），所有 frontmatter 不被错误渲染为正文
- **SC-002**: vault 路径冲突 / 文件夹外部移动 / merge conflict 等异常场景下，**0 起**用户数据被静默覆盖或丢失事件（dogfood 1 个月内）

#### Phase 0 milestone（hello-world ingest）

- **SC-003**: 用户提交一段 200-2000 字文本到完成 ingest（猫 voice 反馈出现）的 P95 时间 ≤ 30 秒（取决于 LLM 网络，可调）
- **SC-004**: 同一前缀 LLM 调用从第二次开始 prompt cache 命中率 ≥ 70%（POC-2 数学稳赚区，前提是启用 cache_control）
- **SC-005**: 在并发场景下（双 ingest 链同时跑、跨进程 mewmo + Claude Code 同时写）测试 100 次，**0 起 lost update**（POC-7 通过标准）
- **SC-006**: 强制 kill mewmo 进程 50 次（写入中途），**0 起** vault 内 .md 半截损坏（atomic rename 通过标准）

#### 猫的灵魂

- **SC-007**: 5 个预设 persona 之间盲测区分度（让第三方读三段同主题输出猜哪只猫）≥ 80%（POC-3 验证 100%，工程化后允许小幅退化）
- **SC-008**: 长会话（同一 session ≥10 次 LLM 调用）voice 一致性 ≥ 9/10（POC-3 标准），**不出现退回中立 AI 助手语气**

#### Agent-native 承诺

- **SC-009**: Claude Code 用户首次 `/mewmo:capture <text>` 到看到 vault 新页 + 反馈的耗时 ≤ 30 秒
- **SC-010**: mewmo 主 app 不运行时 Skill 命令成功率 ≥ 95%（除 LLM API 网络问题外）

#### Tag 骨架

- **SC-011**: 用户手写 supertag 文件 → mewmo 重启 → `_index.md` 自动反映该 tag 的成功率 = 100%
- **SC-012**: supertag 格式错误时其他 tag 加载不受影响（隔离失败），且日志中能定位到具体哪个文件错（fail-loud 但不致命）

#### 工程纪律（横切）

- **SC-013**: vault.ts / vault.py IO 层单元测试覆盖率 = 100%（FR-007 ~ FR-010 都有对应测试，**不能错的代码不允许漏测**）
- **SC-014**: 所有 LLM 调用、文件锁、Skill 调用 100% 有日志（log 不全 = 不可观测 = bug 难调，POC-2/6 已警告）
- **SC-015**: API key 静态扫描全过（用 ripgrep / git-secrets 等扫前端代码 / 网络请求体 / 日志），**0 命中**

---

## Assumptions

### 来自 PRD v1.1 的约束（已敲定，本 spec 不重新决策）

- **本 spec = Phase 0 范围**（PRD §12）：底层骨架 + POC 推出的工程必做项，**不含** Walking Skeleton（Phase 1，留下次 spec）也不含 vibe-coding 时代旧 4 tab 迁移（独立任务）
- **vault 默认路径**：`~/Documents/mewmo-vault/`（PRD §10.1），用户可改
- **5 个 persona 预设**具体名字 / voice 模板内容是 Phase 0 期间敲定的设计动作（PRD §14 待决策项 #2），本 spec 的 P3 假设这 5 个 persona 在 Phase 0 内会被设计完
- **vibe.db 与 vault-meta.db 并存**（架构文档 §7.2）：v1 阶段两个 DB 不混用，旧 4 tab 数据继续在 vibe.db；vault 模式的衍生索引在 `<vault>/.mewmo/vault-meta.db`，Phase 0 仅建 schema 占位
- **不预先做的事**（PRD §8 + 架构文档 §5）：双链笔记 / 实时多人 / 通用 chat / 全自动主题分类 / Web 移动版 / 在线同步 / embedding+RAG / 多权限多账号 —— 都在 Phase 0 之外，不进 spec

### 来自架构文档 v1.0 的技术决策（已选型，本 spec 不再讨论）

- **三层架构**（架构文档 §1.2）：Layer 3 Cat Agent / Layer 2 Skill / Layer 1 vault.ts，下层不知上层、跨层只下降不反向
- **依赖最小化**（架构文档 §3.7）：Phase 0 新增依赖共 7 个（Rust 6 + TS 1），不上 ORM / GraphQL / 微服务 / embedding 库 —— 具体清单见 plan 阶段
- **真理与衍生分离**（架构文档 §3.1）：vault/raw/* 和 vault/wiki/* 是真理；`.mewmo/` 内 SQLite 是衍生物；任何索引损坏都能从 .md 重建
- **配置驱动**（架构文档 §3.4）：行为约定（schema / Tag rules / persona）都是 .md 文件，改 .md 立刻改行为，不需要改代码
- **Fail-loud 错误处理**（架构文档 §3.3）：所有错误用户可见，silent failure 是反模式；猫诚实告诉主人哪里出问题
- **POC 推出的工程必做项**（PRD §12 Phase 0 + 架构文档 §5.4）：Anthropic prompt cache 全链路 / drill 走 parallel tool calls / Haiku-Sonnet 混合定价 / ingest 链串行调度 / LLM 输出长度上限 / persona 每次重 inject —— 都已落进本 spec 的 FR

### 来自 mewmo 项目宪法（v2.0.0）的约束

- **核心 Loop 闭环**（原则 II）：本 spec 完成后产品仍处于「捕获 + 整理」骨架，**不含「激活 / 消费 / 沉淀」完整闭环**——Phase 1 才是 walking skeleton。本 spec 显式申明此项原则**部分豁免**：Phase 0 是骨架阶段，整链跑通的责任落在 Phase 1
- **30 秒捕获**（原则 III）：本 spec 的 P2 和 P4 都满足该要求（SC-003 / SC-009）
- **Empty State 即引导**（原则 IV）：Phase 0 期间 React UI 改造范围有限，空状态引导落实由 Phase 1 walking skeleton 兜底
- **Vibe coding 安全底线**（治理段）：API key 通过 Tauri Rust 后端代理调用 LLM，FR-037 直接对应

### 工程边界假设

- **测试覆盖**（架构文档 §3.6）：vault.ts / vault.py 单元测试 100%；ingest 链 e2e 跑一篇真实文章（mock LLM）；UI 仍走手工验证 + 截图（项目现有惯例）
- **LLM provider**：v1 默认 Anthropic Claude API（PRD §10.2），用户可换兼容 OpenAI 格式，但 prompt cache 实证仅 Anthropic 原生 cache_control 走通，OpenRouter 等中转层 cache 透传未实证
- **平台**：v1 仅 macOS（PRD 范围红线 + 宪法）；Windows / Linux 通过同一 Tauri 工程出包但不在本 spec 验收范围
- **不做云同步**：用户走 iCloud Drive / Dropbox / git 自己同步 vault，mewmo 不做云服务
- **vibe-coding 旧 spec 处理**：`specs/001-search-tags` / `specs/001-subscription-feed` 在新架构下大概率要重做或归档，**那是独立 cleanup 任务**，不在本 spec 范围
