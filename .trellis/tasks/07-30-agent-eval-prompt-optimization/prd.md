# Agent 正常功能评测与提示词优化（Langfuse）

## 背景

Agent 对话功能（/mew 与侧边栏）已上线，但从未系统评测过。提示词（`apps/agent/prompts/system.zh.md` 等）靠感觉迭代，缺少数据支撑。项目已具备：

- Agent 全链路 Langfuse trace（`apps/agent/src/observability/langfuse.ts`）：每轮一条 trace，含 generation 与 tool span，本地 `environment=development` 隔离
- 提示词已注册 Langfuse Prompt Management（`apps/agent/prompts/langfuse-manifest.json`，v1），trace 关联提示词版本
- ai-workflows 已有成熟评测范式（offline/live + Dataset + Experiment API + LLM-judge），可复用架构

## 目标

评测 Agent 正常功能，产出失败归因，最终以数据支撑提示词优化。

## 四步闭环（本任务范围为 ①+②，③④ 视结果续期）

1. **采集**：本地起 agent + web（开 Langfuse tracing），按正常功能清单跑真实对话（每功能 3~5 个变体问法），产出 20~40 条 trace
2. **打分归因**：与用户一起看 trace，在 Langfuse 打 score，标失败原因分类（提示词问题 / 工具描述问题 / 模型能力问题）
3. **沉淀**（后续）：典型 case 做成 Langfuse Dataset + agent 评测 runner（确定性断言硬门槛 + LLM-judge 软分）
4. **迭代**（后续）：改提示词 → bump 版本 → 重跑 experiment → 版本间 score 对比

## 正常功能清单（评测维度）

- 搜索：找笔记/剪藏（关键词、模糊描述、时间范围）
- 创建：新建笔记（指定标题/内容/位置）
- 润色：改写当前笔记选段/全文
- 移动：笔记移动到指定文件夹
- 归类：批量整理/打标签
- 写操作预览确认：所有写操作必须先出 proposal 预览，确认后才执行
- 上下文理解：`读当前笔记` 等基于 AISidebar context 的指令

## 每条 trace 的评分维度

- 工具选择正确性（选了正确的 tool，参数合理）
- 写操作是否出预览（硬性要求）
- 回复质量（准确、简洁、中文自然）
- 失败归因标签：prompt / tool-desc / model / infra

## 验收标准

- [ ] Langfuse 中有 ≥20 条覆盖全部功能维度的 development trace
- [ ] 每条 trace 有 score 与归因标注
- [ ] 产出失败分类表（research/ 目录），明确哪些问题归因为提示词可解
- [ ] 给出提示词优化候选清单（含具体修改建议），供 ③④ 阶段执行

## 约束

- Langfuse 密钥用本地 .env.local 已有配置，environment=development，不污染生产数据
- 本阶段不改任何提示词、不动生产；只观测和分析
- 测试账号：2209205181@qq.com（dev 端口 3210）
