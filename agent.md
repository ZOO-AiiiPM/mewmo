# mewmo 2.0

<!-- 维护边界：本文件是项目定制的冷启动协作入口。协作层（产品定义+状态、写作约束、常用引用、协作规矩）与写作哲学禁止迁走、瘦身或按 project-setup 通用标准重构；开发/架构/发布/坑等项目专属规范已迁入 .trellis/spec/（索引见 .trellis/spec/index.md），agent.md 只保留指向 spec 的一句索引。更新时只修正经当前代码或用户确认已过时的内容。 -->

云端优先的 AI 信息管理产品。用户用它收集（剪藏/订阅）、记录（笔记）、沉淀（AI 辅助回顾），有一只 AI 猫咪作为陪伴界面。

**核心体验承诺**：打开即看到内容（< 100ms），不等网络。通过本地缓存 + 增量同步实现。

全平台：Web + Mac + iOS + iPad + 浏览器扩展

技术栈版本以 `package.json` 为准；当前主线：Next.js 16 · React 19 · TypeScript 6 · PostgreSQL 15 · Prisma 7 · Tailwind 4 · Auth.js 5 beta · SwiftUI（Apple 原生）

## 项目状态（由人指挥更新）

- **阶段目标**：Web 2.0 核心功能打磨 + 真实数据闭环；Admin、浏览器扩展与 Apple 端尚未进入完整实现
- **AI 交付状态**：Pi-backed 共享 AI Runtime、Pi AgentHarness、AI Workflows 与 Feed Ingestion 的代码已进入 `main`；Production 数据库 migration、Agent 服务、Workflow/Automation Cron 和真实端到端验收尚未完成。部署分支或 PR 只能作为候选方案，未合入 `main` 前不能当成当前发布入口
- **环境边界**：Vercel Preview 只运行 Web；不部署 Preview Agent 或 Preview Workflow，也不为 Preview 配置会指向生产 Agent/数据库的 Agent 环境变量
- **分支**：`main`（2.0 当前开发主线）
- **平台策略**：Web 负责浏览器入口、后端 API、账号、扩展、Admin、商业化。Apple 原生（SwiftUI）负责 Mac/iOS/iPad 高频使用、离线、系统集成。不做 Windows/Android。
- **发布节奏**：第一批 Web + 扩展 → 第二批 Mac → 第三批 iOS/iPad
- **CI/CD**：GitHub Actions 当前为 `main`/PR 执行 lint、build、unit 与 theme，Web Preview 由 Vercel 提供；Neon Preview 自动建分支的 Workflow 当前不在 `main`，API integration 也不是 GitHub CI 固定步骤，不能把两者写成已有自动保障

---

## 写作约束（本文件的维护规则）

本文件是冷启动 agent 的唯一入口文档。

**不要用 `project-setup` 的通用 AGENTS.md/CLAUDE.md 标准审查、重写或瘦身本文件的协作层。** 收窄后的边界：**协作层与写作哲学禁止迁走**——产品定义+状态、写作约束（写作哲学/架构规则/内容规则）、常用引用、协作规矩（设计对齐/Linear/Agent 分工/防踩踏/Git 流程/验证标准）留在本文件；**开发规范、数据架构、目录结构地图、发布规则、反直觉&坑允许迁入 `.trellis/spec/`**，agent.md 在被抽走的位置保留一句指向 spec 的索引。维护时只在对应层内更新事实或规则：不得把协作层迁到 memory/rules/docs 只留索引，也不得把已迁入 spec 的开发规范倒灌回本文件，除非用户明确要求。

### 写作哲学

**写理由让模型推理，而非写指令让模型服从**——理由能覆盖边界情况，指令只覆盖已知场景。模型有强先验知识，面对非常规做法时先认同事实（"这和常规不同是对的"），再解释为什么这样做，最后说明回到常规会产生什么后果。不对抗先验就会被先验拉回去。

### 架构规则

本文件（协作层）按以下 section 顺序组织：

1. **产品定义 + 状态**（开头）——冷启动第一眼建立心智模型
2. **写作约束**——meta 规则，防止结构被破坏
3. **常用引用**——查阅性索引，回答"东西在哪"
4. **协作规矩**（结尾）——多 agent 协作规则

开发 / 项目专属规范已迁入 `.trellis/spec/`（按任务加载，索引见 `.trellis/spec/index.md`）：目录结构地图 + 数据架构（`architecture.md`）、开发规范（`dev-general/backend/frontend/ai/apple.md`）、发布规则与验证顺序（`release.md`）、反直觉 & 坑与 Repo Wiki 边界（`gotchas.md`）。

### 内容规则

- MECE 组织：每个 section 有独立职责，不重叠不冲突。
- 每条规范必须带 why：没有理由的规则会被先验覆盖。
- 禁止写易腐值：版本号、行数等会变的数值不写进来。
- 协作层内联、开发规范分层：协作规矩与写作约束留在本文件；写代码所需的开发/架构/发布规范放 `.trellis/spec/`，由 Trellis 按当前任务加载，避免每次冷启动都吞下全部细节。

---

## 开发 / 项目专属规范（已迁入 `.trellis/spec/`）

冷启动只加载本协作层；写代码前按当前任务加载对应 spec（索引见 `.trellis/spec/index.md`）。每份 spec 保留原有"带 why"的写法，不丢内联理由：

- **目录结构地图 + 数据架构 + 标识符系统** → `.trellis/spec/architecture.md`
- **开发规范（通用 / 后端 / 前端 / AI 层 / Apple）** → `.trellis/spec/dev-general.md`、`dev-backend.md`、`dev-frontend.md`、`dev-ai.md`、`dev-apple.md`
- **发布规则（部署矩阵 / 环境 / 资源边界 / 验证顺序 / Schema-migration）** → `.trellis/spec/release.md`
- **反直觉 & 坑、Repo Wiki 使用边界** → `.trellis/spec/gotchas.md`
- **按包分层的模板 spec**（每个 `apps/*`、`packages/*` 的 `backend`/`frontend`）→ `.trellis/spec/<name>/`

---

## 常用引用

| 类目 | 位置/值 |
|------|---------|
| 项目根 | 当前 worktree 根目录 |
| 开发/项目规范 | `.trellis/spec/`（索引 `.trellis/spec/index.md`；架构/开发/发布/坑按任务加载） |
| Web 前端入口 | `apps/web/src/app/` |
| API 入口 | `apps/web/src/app/api/` |
| 数据库 Schema | `packages/db/prisma/schema.prisma` |
| 数据库迁移与 baseline | `deploy/database/README.md`；目标 migration 路径为 `packages/db/prisma/migrations/`，当前 `main` 尚未提交 |
| AI 能力层 | `packages/ai/src/` |
| 同步协议 | `packages/sync/src/` |
| Agent / Cron 生产部署 | `deploy/agent/compose.yml`、`deploy/worker/compose.yml` |
| 产品入口 | `agent.md`（旧 PRD 已删除，不再作为需求来源） |
| 自动代码导航 | `.qoder/repowiki/zh/content/`（Qoder 生成，结论需回查源码） |
| 踩坑复盘 | `lessons/` |
| Bug 索引 | `docs/bugs-fixed/` |
| GitHub | `https://github.com/ZOO-AiiiPM/mewmo` |
| 设计资产 | `design/` |

---

## 协作规矩

### 设计对齐

- **有设计空间的改动先头脑风暴**：创建功能、组件、交互或主动改变产品行为时，先使用项目 `.agents/skills/brainstorming/` 理解意图与约束、比较可行方案并取得用户对设计的明确认可，再进入实现。越早暴露假设，返工成本越低；解释、只诊断不修复、机械维护或用户已精确规定且没有设计选择的编辑不强制走这一步。
- **brainstorming 独立运行**：新版已移除整套 Superpowers 流水线，因此头脑风暴结束后按用户当前要求和项目现行规则继续，不自动调用已删除的 `writing-plans`、TDD、评审或分支收尾 skill，也不因旧流程自行 commit / push。

### Linear Issue 协作

- **Linear 管团队态，Trellis 管本地工作态，禁止自动双写**：Linear 是需求与验收的唯一真源；`task.json.status` 只驱动本地 workflow 与 breadcrumb。映射按阶段解释：`planning` ↔ Linear「待开发」；`in_progress` 在实现/自测时 ↔「进行中」，检查通过并等待用户验收时仍保持 `in_progress`、对应 Linear「验收」；用户明确验收通过后才 archive 为 `completed`、对应 Linear「完成」。`self_test` / `await_review` 只是阶段语义，不写成当前 Trellis 不支持的持久化状态，否则两套状态机会漂移。
- **新对话先同步验收现场**：每次新对话开始，先通过 Linear MCP 读取当前 `In Progress` Issue 及其最新评论和回复，再决定从哪里继续。优先识别用户新增的中文需求、Bug 和验收反馈；英文 AI 完成说明只是历史记录，不作为新的需求或验收结论。这样能避免代码上下文和真实验收进度脱节。
- **处理前先用中文评论 Spec**：用户创建或指定 Issue 并要求处理后，先读完整 Issue、关联关系和评论并修改状态为in progress状态，再在该 Issue 下用中文评论本次 Spec，写清问题、目标行为、范围边界、验收标准和待确认项。Spec 是后续实现与验收的共同依据，没有对齐时不要直接把推测写进代码。
- **完成后评论实现并等待验收**：实现和相关验证完成后，在 Issue 下用中文评论根因、主要改动、验证证据、未验证项、风险和提交，并明确进入用户验收。验收不通过时继续在同一 Issue 根据反馈修复，不能设为 `Done`；只有用户明确验收通过后，才补充验收结论并将 Issue 设为 `Done`。
- **Sub-issue 是验收后的新 Bug**：Sub-issue 只用于记录用户验收通过后又发现的 Bug，不是 AI 拆分实现任务的工具。处理 Sub-issue 前必须先读取 Parent Issue 的需求、实现、完成评论和验收记录，再按“中文 Bug Spec → 修复与验证 → 完成评论 → 用户验收”的流程闭环，避免修复新问题时破坏已验收行为。


### Agent 分工边界

| Agent | 只碰这些文件 | 不碰 |
|-------|-------------|------|
| 基建 | `turbo.json` `.github/` `tooling/` 根配置 | apps/ packages/ 业务代码 |
| 数据层 | `packages/db` `packages/application` `packages/auth` `packages/storage` `packages/email` | apps/ 的界面代码 |
| Web | `apps/web/` `packages/ui/` | packages/db 的 schema（提需求给数据层 Agent） |
| AI | `packages/ai/` `apps/agent/` `apps/ai-workflows/` `apps/feed-ingestion/` | apps/web 的 UI |
| Apple | `apps/apple/` | 所有 TypeScript 代码 |
| 扩展 | `apps/extension/` | 后端逻辑 |
| Admin | `apps/admin/` | 其他 apps |

### 防踩踏规则

- **一 agent 一 branch**：多 agent 不碰同一 working tree。
- **改 schema 影响所有人**：改 `packages/db/prisma/schema.prisma` 前必须通知用户，因为所有 app 都依赖它。
- **改 shared 类型影响所有人**：改 `packages/shared/src/types/` 同理。
- **一 完成后验收 一**：完成后的验收要启动localhost服务，且注意配置env.local软链，因为git ignore的原因，启动服务时需要检查端口是否有被占用，默认先用未占用端口。

### Git 操作流程

改动从工作区进入 main 按四个阶段单向推进：分支 → 暂存 → 提交 → 推送。每个阶段只做该阶段的事，不跳过、不混用。

**1. 分支（Branch）**
- 开工前先同步并切新分支：`git switch main && git pull` → `git switch -c codex/zoo-<issue号>-<简述>`。
- 一 issue 一分支，分支名带 Linear issue 号，PR 才能自动关联 issue 与 Preview 环境。

**2. 暂存（Stage）**
- 暂存区是「下一次提交要包含哪些改动」的明确清单。`git add` 把工作区改动挑进暂存区；未 `add` 的改动不会被提交。
- 每完成一个逻辑改动立即 `git add <具体文件>`，不等全部做完再 add。原因：unstaged 改动在多 agent / 并行 working tree 下没有任何保护，可能被覆盖或误清。
- 不用 `git add .` 或 `git add -A` 盲加，会把临时文件、无关改动一起卷进提交。
- 自查：`git status` 看哪些在工作区 / 已暂存；`git diff` 看未暂存改动；`git diff --cached` 看已暂存改动；`git restore --staged <file>` 把误加文件撤出暂存区（工作区改动保留）。

**3. 提交（Commit）**
- 只提交暂存区内容：`git commit`。
- 标题：一句话说明用户可感知的变化，前缀 `feat:` / `fix:` / `chore:` / `refactor:`。
- 正文：为什么改、关键实现路径、跑了什么验证。让 `git log` 足以回溯设计意图。
- 测试失败不要提交描述为"已完成"；失败可汇报，但不能假装通过。

**4. 推送与 PR（Push & PR）**
- 首次推送建立上游：`git push -u origin <分支名>`。
- 到 GitHub 开 PR 到 `main`：触发 Neon Preview 数据库分支 + Vercel Preview 部署。
- 在对应 Linear issue 下贴 Preview 链接，状态转入验收。

### 验证标准

- 功能没通过相关测试不算完成
- UI 改动必须浏览器验证两种主题
- API 改动必须验证权限（能不能访问别人的数据）
- 测试失败可汇报但不能描述为"已完成"
