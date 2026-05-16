<!--
Sync Impact Report
- Version change: (none) → 1.0.0
- Modified principles: (initial ratification, all five principles new)
- Added sections:
  - Core Principles I–V
  - Product Scope & Constraints
  - Development Workflow
  - Governance
- Removed sections: (none)
- Templates requiring updates:
  - .specify/templates/plan-template.md ⚠ pending（首次跑 /speckit-plan 时按本宪法校核 Constitution Check 段）
  - .specify/templates/spec-template.md ⚠ pending（首次跑 /speckit-specify 时确认用户故事段呼应"核心 Loop 闭环"原则）
  - .specify/templates/tasks-template.md ⚠ pending（首次跑 /speckit-tasks 时增加 onboarding / empty state / 埋点 类目）
- Follow-up TODOs: (none)
-->

# vibe-coding Constitution

## Core Principles

### I. 用户价值优先（User Value First）
每个功能必须直接服务于"用户能更愉快地和 AI 角色对话"这一核心价值。功能 MUST 通过以下检验才能立项：能用一句话回答"用户为什么需要它"，且答案不依赖工程师视角的理由（如"这样代码更优雅"、"以后好扩展"）。
**Why**: 仿 Character AI 的核心是 C 端用户体验，工程驱动的功能堆砌会稀释产品定位、拖慢上线节奏。

### II. 核心 Loop 闭环（Core Loop Closure, NON-NEGOTIABLE）
项目核心 Loop 定义为：**发现角色 → 与角色对话 → 创建/收藏角色 → 分享或回访**。任何上线版本 MUST 让用户能完整跑完这个 Loop，不允许"有创建但不能对话"、"有对话但不能保存"这类半成品状态。新功能 MUST 标注其在 Loop 中的位置，否则 SHOULD 推迟到 P2/P3。
**Why**: C 端产品最忌 Loop 断裂——用户在断点处流失，前面所有引导都白做。Character AI 当年起飞靠的就是 Loop 极短极顺。

### III. 5 秒上手（5-Second Onboarding）
新用户首次打开产品到完成第一次有价值的交互（至少看到一段 AI 角色对话）的耗时 MUST ≤ 5 秒。注册、引导教程、空状态填充 MUST 服务这个目标。如新增功能会延长此时间，必须在 spec 中显式权衡并由用户确认。
**Why**: C 端冷启动用户没有耐心。Character AI 默认让游客直接看到热门角色对话，注册推迟到留存动作触发——这是 C 端的既得方法论，不要重新发明。

### IV. Empty State 即引导（Empty State as Onboarding）
任何用户可见页面 MUST NOT 出现"暂无内容"的死页。空状态 MUST 提供以下其一：示例内容、推荐入口、可点击的引导操作。设计稿评审时空状态是 P0 检查项。
**Why**: 死页让用户瞬间感觉"产品没东西"——C 端产品最致命的负面印象。空状态是免费的获客资源，浪费它等于把用户推走。

### V. 数据驱动迭代（Data-Driven Iteration）
核心 Loop 上的每个用户动作（首次访问、查看角色、发起对话、发送消息、创建角色、收藏、分享）MUST 配备埋点。任何新功能上线前 MUST 在 spec 中定义"成功指标"（如 DAU、对话轮数、留存率），上线 7 天内 MUST 回看数据决定保留 / 调整 / 撤回。
**Why**: 没有埋点的 C 端功能等于盲飞。"我觉得用户喜欢"在 C 端产品中是高发错误来源，数据是唯一可信的反馈。

## Product Scope & Constraints

本项目是 **vibe coding 教学/展示性质的 demo**，不是商业化产品。范围约束如下：

- **单平台优先**：先做 Web，移动端、原生 App MUST 推迟至 v2。
- **轻量技术栈**：优先用一站式云平台（Vercel + 托管 LLM API + 托管数据库），MUST NOT 引入 K8s、自建 LLM、复杂微服务架构等超出 demo 必要的基础设施。
- **AI 模型托管不自训**：MUST 调用现成 LLM API（默认走 BMC 中转），MUST NOT 自训模型、不微调。
- **范围红线**：MUST NOT 实现支付、企业 SSO、多租户、合规审计模块——这些与 demo 核心目标无关，引入会拖死项目。
- **代码体量**：单 feature 的 spec MUST 能在 1 周内由一个 vibe coder 实现完。超出的拆 P1/P2/P3。

## Development Workflow

- **Spec Kit 全流程**：每个功能 MUST 按 `/speckit-specify → /speckit-clarify → /speckit-plan → /speckit-tasks → /speckit-implement` 顺序走，不允许跳过 specify 直接写代码。
- **CLAUDE.md 是单一事实源**：项目级硬规则、决策、约束沉淀到 `CLAUDE.md`；事实进 `.claude/memory/`；时间线进 `journal.md`。MUST NOT 在多个地方重复同一条规则。
- **核心 Loop 演示门槛**：每个 feature 上线前 MUST 由实际用户（含开发者本人之外至少 1 人）跑通完整 Loop 一遍，跑不通就回退。
- **Vibe coding 安全底线**：API key MUST NOT 出现在前端代码 / 网络请求 / 日志中；用户输入到 LLM 前 MUST 做基础注入防护；任何收集用户数据的功能 MUST 配套隐私说明。
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

**Version**: 1.0.0 | **Ratified**: 2026-05-16 | **Last Amended**: 2026-05-16
