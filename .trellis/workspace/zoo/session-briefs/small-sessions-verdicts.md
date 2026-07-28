# 小会话批量判定（6c9faec2 / 3f473d4e / 66557e71 / 0b2fe6d0 / 2468d742 / c681e053）

| 会话 | 判定 |
|---|---|
| 6c9faec2（7/26 查进程） | 完全可归档：0 工具调用，死于 401 |
| 3f473d4e（7/26 收敛困惑） | 完全可归档：死于登录错误，问题已由本收敛工作承接 |
| 66557e71（7/26 Trellis 范式） | 讲解可归档；**遗留待办：删 Superpowers skill 已获批未执行** |
| 0b2fe6d0（7/25 pi-agent） | 讲解可归档；**遗留悬案：生产服务器 agent 不可用 + embedding 失败，零进展** |
| 2468d742（7/23 AI 层评审） | 基本可归档；核对 3 个拟好的 issue 是否已录入 Linear |
| c681e053（6/25 claude-code-setup） | 完全可归档：plugin 已装好、launch.json 已落盘 |

## 需转移的上下文

### 1. Superpowers skill 清理（66557e71，用户已批「都删掉，只保留 trellis 的」，从未执行）
`.claude/skills/` 下 Superpowers 套件（using-superpowers、brainstorming、writing-plans、executing-plans 等 ~20 个）+ `.superpowers/` 目录仍在磁盘。理由：与 Trellis 是竞争工作流范式。执行前向用户再确认一次（授权在已死会话）。

### 2. 生产服务器 agent/embedding 不可用（0b2fe6d0，未解决）
现象：agent/workflow server 已部署到 **101.36.117.253**，但「agent 完全用不了，embedding 模型也完全失败」。该会话两次 SSH 都被拦、429 死亡，服务器侧数据为零。入口线索：`deploy/PR27-deployment-handoff.md` + `apps/agent/src/config.ts` 的环境变量。接手先确认是否已被后续会话解决。

### 3. AI 层方案评审结论（2468d742，7/23）
- 总评：workflow 层收集/摘要 + agent 层知识库 agent 的分层策略正确，spec 可放心 commit；3 个冻结前必须定稿点：**定时自动化的写入确认语义**（最大的洞）、**embedding 模型与维度先定再做 vector 迁移**、**pg_trgm 中文召回问题**。
- 已拟好 3 个 Linear issue 全文（定时 Agent 写入授权模型 / Agent 成本护栏 / Embedding 模型与维度定稿）+ 1 组 pgvector issue 增补评论，**未确认是否已录入 Linear**；未录的话转录 entry 134 有全文可直接粘贴（`~/.claude/projects/-Users-zoo-zoo-CC---------mewmo/2468d742-1e51-4be8-b3ab-11e5e46e1037.jsonl`）。

### 4. Trellis 工作范式约定（66557e71，已在 .trellis/workflow.md 体系内，此处仅存快照）
一切工作挂任务；同意建任务 ≠ 同意开工，`task.py start` 后才动代码；Plan(prd/design/implement) → Execute（PRD 缺陷可回滚重规划）→ Finish（更新 spec 必需）；子代理 prompt 以 `Active task: <路径>` 开头。
