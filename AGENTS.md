# mewmo 2.0

<!-- TRELLIS:START -->
## Trellis Instructions

This project is managed by Trellis. Working knowledge lives under `.trellis/`:

- `.trellis/workflow.md` — development phases and skill routing
- `.trellis/spec/` — package- and layer-scoped coding guidelines
- `.trellis/workspace/` — developer journals and session traces
- `.trellis/tasks/` — active and archived task context

Prefer available Trellis commands over manual workflow steps. Project helpers may also live in `.agents/skills/` and `.codex/agents/`.

<!-- TRELLIS:END -->

云端优先的 AI 信息管理产品。用户用它收集（剪藏/订阅）、记录（笔记）、沉淀（AI 辅助回顾），有一只 AI 猫咪作为陪伴界面。

**核心体验承诺**：打开即看到内容（< 100ms），不等网络。通过本地缓存 + 增量同步实现。

全平台：Web + Mac + iOS + iPad + 浏览器扩展

技术栈版本以 `package.json` 为准；当前主线：Next.js 16 · React 19 · TypeScript 6 · PostgreSQL 15 · Prisma 7 · Tailwind 4 · Auth.js 5 beta · SwiftUI（Apple 原生）

## 项目状态（由人指挥更新）

- **阶段目标**：Web 2.0 核心功能打磨 + 真实数据闭环 + agent/workflow功能 + apple mac端 ；Admin、浏览器扩展尚未进入到任务
- **AI 交付状态**：Pi-backed 共享 AI Runtime、Pi AgentHarness、AI Workflows 与 Feed Ingestion 的代码已进入 `main`；Production 数据库 migration、Agent 服务、Workflow/Automation Cron 和真实端到端验收尚未完成。部署分支或 PR 只能作为候选方案，未合入 `main` 前不能当成当前发布入口
- **环境边界**：Vercel Preview 只运行 Web；不部署 Preview Agent 或 Preview Workflow，也不为 Preview 配置会指向生产 Agent/数据库的 Agent 环境变量
- **分支**：`main`（2.0 当前开发主线）
- **平台策略**：Web 负责浏览器入口、后端 API、账号、扩展、Admin、商业化。Apple 原生（SwiftUI）负责 Mac/iOS/iPad 高频使用、离线、系统集成。不做 Windows/Android。
- **发布节奏**：第一批 Web + 扩展 → 第二批 Mac → 第三批 iOS/iPad
- **CI/CD**：GitHub Actions 当前为 `main`/PR 执行 lint、build、unit 与 theme，Web Preview 由 Vercel 提供；API integration 也不是 GitHub CI 固定步骤，不能把两者写成已有自动保障

---

## 写作约束（本文件的维护规则）

本文件是冷启动 agent 的唯一入口文档。

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
| 产品入口 | `AGENTS.md` |
| 自动代码导航 | `.qoder/repowiki/zh/content/`（Qoder 生成，结论需回查源码） |
| 踩坑复盘 | `lessons/` |
| Bug 索引 | `docs/bugs-fixed/` |
| GitHub | `https://github.com/ZOO-AiiiPM/mewmo` |
| 设计资产 | `design/` |

---

## 协作规矩

### Linear Issue 协作

- **Linear 管团队态，Trellis 管执行上下文**：Linear 是需求、优先级和验收真源；每个顶层 Issue 必须属于 `Mewmo` 项目，标题简洁，详情按 Spec 写清目标、边界与验收标准，并使用 Linear 原生 `feature` / `bug` / `improvement` label 和 priority。Trellis `task.json.status` 只驱动本地 workflow，不另造一套业务状态。
- **顶层 Issue 严格 1:1**：一个 Linear Issue 对应一个 Trellis task、一次 AO 执行单元、一个 worktree、一条 issue branch 和一个 PR。branch 与 PR 名必须包含 `issue-<Linear ID>`，否则自动关联会失效。委派后的 worker 标题附 `@agent+model`，让责任主体可直接识别。
- **Sub-issue 是同一交付单元内的验收发现**：主控只在验收暴露独立问题时拆 Sub-issue；Sub-issue 复用 parent 的 Trellis task、AO session、worktree、branch 和 PR，不得再 spawn 新资源。它不是主控预先拆实现步骤的工具。
- **状态以真实生命周期为准**：实现前读完整 Issue、关系和评论；实现与自测完成后进入 `In Review`，由主控独立验收并把结论回写 Linear。`approve` 若长期不更新，主动核对 worker、PR、review run 和 Linear 状态并做 reconciliation（状态对账），不能把卡住的 UI 当成仍在执行。只有用户明确验收通过后才能标记完成。

### AO 编排

- **Codex 是主控，不默认充当 worker**：主控负责 Issue 边界、Spec、委派、`In Review` 验收和 CI 结果；worker 负责实现、自测、提交和提 PR。默认 worker 使用 OpenCode Zen 的 `DeepSeek V4 Flash Free`，困难任务可以改派 Codex worker。角色分错是主控的编排错误，不是 AO UI 展示错误。
- **worker 从启动时获得完整权限**：项目 worker permission 使用 `bypass-permissions`，避免每一步人工批准。权限配置只在新 session spawn 时解析，已经运行的 session 不会热更新；需要换 runtime/session 时仍复用原 Issue、Trellis task、worktree、branch 和 PR。
- **事件触发，不持续轮询**：主控只在 `In Review`、blocked、authorization、CI 事件出现时介入，避免持续监控消耗。验收失败时在原执行单元修复；禁止为同一顶层 Issue 重建并行 session。
- **禁止自动合并**：worker 可提交并提 PR，主控可验收和 approve，但 merge 默认关闭；只有用户当次明确授权后才可合并。
- **经验先原样留在任务内**：执行中的原始经验追加到 `.trellis/tasks/<task>/lesson.md`；后续由整理 agent 验证、去重，再把可复用约束提升到 `.trellis/spec/`。不要把具体 case 直接塞进 `AGENTS.md`。


### 防踩踏规则

- **一 agent 一 branch**：多 agent 不碰同一 working tree。
- **改 schema 影响所有人**：改 `packages/db/prisma/schema.prisma` 前必须通知用户，因为所有 app 都依赖它。
- **改 shared 类型影响所有人**：改 `packages/shared/src/types/` 同理。
- **一 完成后验收 一**：完成后的验收要启动localhost服务，且注意配置env.local软链，因为git ignore的原因，启动服务时需要检查端口是否有被占用，默认先用未占用端口。

### Git 操作流程

改动从工作区进入 main 按四个阶段单向推进：分支 → 暂存 → 提交 → 推送。每个阶段只做该阶段的事，不跳过、不混用。

**1. 分支（Branch）**
- 开工前先同步 main，再由 AO 为顶层 Issue 建 `issue-<Linear ID>-<简述>` 分支和 worktree。
- 一顶层 Issue 一分支，branch 与 PR 名都带 `issue-<Linear ID>`，供 Linear、AO 与 Preview 自动关联。

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
