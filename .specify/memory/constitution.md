<!--
Sync Impact Report
- Version change: 1.0.0 → 2.0.0
- 触发事件：项目方向 pivot（Character AI 仿品 → AI 信息管家），核心 Loop 重定义，平台从 Web 改为 macOS 桌面，数据从云端改为本地
- Modified principles:
  - I. 用户价值优先：核心价值表述从"愉快地和 AI 角色对话"改为"信息从被动收集到主动激活"
  - II. 核心 Loop 闭环：Loop 重定义为"捕获→整理→激活→消费→沉淀"
  - III. 5 秒上手 → 30 秒捕获（适配桌面 App + 信息工具的合理上手时间）
  - IV. Empty State 即引导（措辞保留，配合新 Loop 调整示例）
  - V. 数据驱动迭代（核心动作清单更新为信息工具语义）
- Added sections: (none)
- Removed sections: (none)
- Templates requiring updates:
  - .specify/templates/plan-template.md ⚠ pending（首次跑 /speckit-plan 时按 v2.0.0 校核）
  - .specify/templates/spec-template.md ⚠ pending（首次跑 /speckit-specify 时确认呼应新 Loop）
  - .specify/templates/tasks-template.md ⚠ pending（首次跑 /speckit-tasks 时增加 macOS 打包 / 本地存储 类目）
- Follow-up TODOs: (none)
-->

# vibe-coding Constitution

## Core Principles

### I. 用户价值优先（User Value First）
每个功能必须直接服务于"信息从被动收集到主动激活"这一核心价值。功能 MUST 通过以下检验才能立项：能用一句话回答"用户为什么需要它"，且答案不依赖工程师视角的理由（如"这样代码更优雅"、"以后好扩展"）。
**Why**: 个人知识管理赛道极度拥挤（Notion / Obsidian / Heptabase / Readwise / Mem.ai 等），靠堆功能必输，靠 AI-native 的"主动激活"才能立住差异化。工程驱动的功能堆砌会稀释定位、拖慢上线节奏。

### II. 核心 Loop 闭环（Core Loop Closure, NON-NEGOTIABLE）
项目核心 Loop 定义为：**捕获（多源信息进入）→ 整理（AI 摘要 / 标签 / 关联）→ 激活（主动推送 / 回顾）→ 消费（用户阅读 / 标记）→ 沉淀（自动归入主题库，强化下次激活）**。任何上线版本 MUST 让用户能完整跑完这个 Loop，不允许"有捕获但不能整理"、"有整理但没激活"这类半成品状态。新功能 MUST 标注其在 Loop 中的位置，否则 SHOULD 推迟到 P2/P3。
**Why**: AI 信息管家的核心差异化是 Loop 闭环——不闭环就退化成"RSS 阅读器 + Markdown 笔记本"，user value 几乎归零。

### III. 30 秒捕获（30-Second Capture）
新用户首次打开产品到完成第一次有价值的捕获动作（粘贴一个 URL 看到 AI 摘要 / 添加一个 RSS 源 / 写下一条笔记）的耗时 MUST ≤ 30 秒。空状态、引导教程 MUST 服务这个目标。如新增功能会延长此时间，必须在 spec 中显式权衡并由用户确认。
**Why**: 信息管理工具的死亡螺旋是"工具复杂度高于用户痛点强度"——用户花 10 分钟配置完发现还不如自己存到备忘录。30 秒首次价值是 Reflect / Mem.ai / Heptabase 等成功产品的隐性共识。桌面 App 比 Web 多了"安装"这一步，所以耗时上限从 5 秒放宽到 30 秒。

### IV. Empty State 即引导（Empty State as Onboarding）
任何用户可见页面 MUST NOT 出现"暂无内容"的死页。空状态 MUST 提供以下其一：示例笔记 / 推荐 RSS 源 / "粘贴 URL 试试"的可点击引导。设计稿评审时空状态是 P0 检查项。
**Why**: 死页让用户瞬间感觉"产品没东西"——是个人工具最致命的负面印象。空状态是免费的获客资源，浪费它等于把用户推走。

### V. 数据驱动迭代（Data-Driven Iteration）
核心 Loop 上的每个用户动作（首次启动、添加 RSS 源、捕获链接、读 Daily Brief、写笔记、标记 / 收藏、回顾历史）MUST 配备本地埋点（写入 SQLite events 表，不上报远端）。任何新功能上线前 MUST 在 spec 中定义"成功指标"（如周活、Daily Brief 打开率、捕获→消费转化率），上线 7 天内 MUST 回看数据决定保留 / 调整 / 撤回。
**Why**: "我觉得用户喜欢"在产品决策中是高发错误来源。本地埋点既能拿数据、又不违反"纯本地无云"的隐私底线。

## Product Scope & Constraints

本项目是 **vibe coding 教学/展示性质的 demo**，不是商业化产品。范围约束如下：

- **平台**：macOS 桌面 App 优先（Tauri 2 + Vite + React），通过 GitHub Releases 分发 .dmg；Windows / Linux MAY 后续通过同一 Tauri 工程出包，iOS / Android 原生 MUST 推迟至 v2。
- **数据本地化**：MUST 用本地 SQLite 存储（Tauri `tauri-plugin-sql`），MUST NOT 引入云端数据库 / 多设备同步 / 用户登录体系——Demo 阶段的核心简化点。
- **AI 模型托管不自训**：MUST 调用现成 LLM API（默认走 BMC 中转），MUST NOT 自训模型 / 不微调。LLM 调用走 Tauri Rust 后端代理，API key MUST NOT 暴露到前端代码 / 网络请求 / 日志。
- **范围红线**：MUST NOT 实现登录系统、支付、多用户、协作、移动端、浏览器扩展、邮件推送服务。这些与 demo 核心目标无关，引入会拖死项目。
- **代码体量**：单 feature 的 spec MUST 能在 1 周内由一个 vibe coder 实现完。超出的拆 P1/P2/P3。
- **签名**：Demo 阶段 MUST NOT 强制 Apple Developer 签名（节省 99 美元/年），用户首次打开通过"右键→打开"绕过 Gatekeeper 即可；自签名 / 公证 SHOULD 在 v2 商业化时再做。

## Development Workflow

- **Spec Kit 全流程**：每个功能 MUST 按 `/speckit-specify → /speckit-clarify → /speckit-plan → /speckit-tasks → /speckit-implement` 顺序走，不允许跳过 specify 直接写代码（紧急小改 MAY 走 git 直接 commit + journal 记录）。
- **CLAUDE.md 是单一事实源**：项目级硬规则、决策、约束沉淀到 `CLAUDE.md`；事实进 `.claude/memory/`；时间线进 `journal.md`。MUST NOT 在多个地方重复同一条规则。
- **核心 Loop 演示门槛**：每个 feature 上线前 MUST 由实际用户（含开发者本人之外至少 1 人）跑通完整 Loop 一遍，跑不通就回退。
- **Vibe coding 安全底线**：API key MUST 通过 Tauri Rust 后端代理调用 LLM，MUST NOT 出现在 React 端代码 / 网络请求 / 日志；用户输入到 LLM 前 MUST 做基础注入防护；任何抓取的网页内容入库前 MUST 去除可执行脚本。
- **GitHub Releases 节奏**：每完成一个 P1 user story 后 SHOULD 打 tag 出一次 .dmg release，让 demo 可被外部下载试用——这是验证"用户首次打开 ≤ 30 秒捕获"的真实场景。
- **journal 节奏**：每完成一个 P1 user story、每踩一次坑、每做一个不可逆决策都 MUST 记 journal.md 顶部。

## Governance

- 本宪法 supersedes 所有非显式记录的开发约定。冲突时以本宪法为准。
- **修订规则**：
  - PATCH（措辞 / typo / 澄清）：直接改，不变版本号。
  - MINOR（新增原则 / 扩充章节）：版本号 +0.1.0，journal 记录原因。
  - MAJOR（删除原则 / 重定义核心 Loop / 范围红线变化）：版本号 +1.0.0，必须在 journal 中说明触发事件并列出受影响的已写 spec。
- 每个 `/speckit-plan` 阶段 MUST 跑 Constitution Check（回答 5 个核心原则是否被这次方案违反），违反则在 plan 中显式申明豁免理由或调整方案。
- 当某条原则在 30 天内被豁免 ≥ 2 次时，应触发原则修订评审——可能这条原则脱离实际，需要降级或重写。
- 运行时开发指引以 `CLAUDE.md` 为入口，本宪法为基础约束。

**Version**: 2.0.0 | **Ratified**: 2026-05-16 | **Last Amended**: 2026-05-16
