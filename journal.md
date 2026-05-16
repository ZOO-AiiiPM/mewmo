# Journal — vibe-coding

> 最新条目在顶部（**倒序**，session 开头 Claude 读前几条就知道最近状态）。
> 格式：`## YYYY-MM-DD 标题` + 做了 / 坑了 / 学到，可选 + 决策。
> **真实 > 完整**：没实质进展的日子空着比凑数好。"今天 review 代码"这种条目会稀释 journal 价值。
>
> 审视时机：每周回看上周条目的"坑了"字段，找**重复出现的词** —— 那就是该蒸馏成 rule 或 lesson 的模式。
>
> 写法标准与示例：skill 的 `references/journal.md`。

## 2026-05-16 P1 切法决策反转

- **做了**：讨论 P1 怎么切——先推荐"薄切片派"（端到端 AI 总结切片，1-2 天能看到 AI 价值）；用户拍板"空壳 note 优先"，理由是 AI 总结模块已有雏形，需要先建容器对接
- **坑了**：(1) 我推荐切法时没问"AI 模块当前状态" → 默认 AI 还没做 → 推了和用户实际不符的方案 → 用户两次催促"思考这么久" "直接写 plan"  (2) 单次回应过长（3 个方案 + 4 个推理 + 表格 + 决定段），用户反感
- **学到**：(1) 推荐 MVP 切法前先问"现有资产/雏形是什么"，避免基于错误前提推方案；(2) 用户已经下决心时不要再列 ABC 选项，直接执行；(3) AI-native 产品的容器先行 vs 切片先行 取决于 AI 模块成熟度——AI 已有 → 容器先行合理，AI 没做 → 切片先行体现价值
- **决策**：P1 = 空壳 markdown note 应用（用户系统 + 笔记 CRUD + Markdown 编辑），AI 雏形稍后接入

## 2026-05-16 项目方向大转向

- **做了**：上午刚 ratify 完 constitution v1.0.0（按 Character AI 仿品立的 5 原则）；用户在跑 /speckit-specify 之前突然改方向，要做"Notion + Get笔记"类的知识管理产品
- **坑了**：constitution v1.0.0 5 原则里"5 秒上手"和"核心 Loop（发现→对话→收藏→分享）"是按 C 端娱乐产品写的，方向变后这两条都要 MAJOR 升版重写
- **学到**：(1) 用户真实痛点驱动 > 我推的调研方向（用户对调研推的 Character AI 仿品没热情，对自己日常用 getnote/obsidian/video-summary 的痛点有热情）；(2) 用户列的 A/B/D 三个痛点（收集易整理难/跨工具碎片化/缺主动推送）合起来本质是同一个："信息从被动收集到主动激活的链路断裂"；(3) 拆解后给出新定位 = AI 信息管家（多源捕获 + AI 整理 + 主动激活），核心 Loop 改成"捕获→整理→激活→消费→沉淀"
- **决策**：新 MVP 砍到 3 个 feature（F1 多源捕获 / F2 主题视图 / F3 主动激活），砍掉块编辑器/双链/全文检索/协作；等用户确认后立即 (a) 修宪法升到 v2.0.0 (b) 跑 /speckit-specify 从 F1 写起

## 2026-05-15 项目初始化

- **做了**：从 project-setup 骨架建项目，方向是体现 AI 产品思维的 vibe coding 展示
- **坑了**：-
- **学到**：-
- **决策**：技术栈 / 具体做什么尚未确定，先搭协作骨架，边想边建

## 2026-05-15 vibe coding 市场调研

- **做了**：通过 agent-reach 调研多平台 vibe coding 现状，r/vibecoding 25万人，r/ClaudeCode 27.5万人
- **坑了**：DDG 搜索 + Exa MCP 调用都失败了，主要数据来自 Reddit
- **学到**：高频痛点 = "代码混乱无法 onboard"（1927 ups）+ "PoC 易 production 难"（auth/secrets/GDPR/multi-tenant 全漏）；最有意思的反向洞察 = "40 天 vibe coding 项目里 CLAUDE.md 改了 43 次，比任何代码文件都多"
- **决策**：项目方向锁在"用 spec-driven 流程承接 vibe coding"，配合刚装的 Spec Kit（14 个 speckit skills）作为核心骨架

## 2026-05-15 装上 Spec Kit

- **做了**：从 skillfoo 项目拷来 `.specify/` + 14 个 speckit-* skills
- **坑了**：-
- **学到**：Spec Kit = spec-driven 开发框架，7 步主流程：constitution → specify → clarify → plan → tasks → analyze → implement
- **决策**：vibe-coding 项目用 Spec Kit 走完整 spec 流程，作为"AI 产品思维"的核心展示骨架
