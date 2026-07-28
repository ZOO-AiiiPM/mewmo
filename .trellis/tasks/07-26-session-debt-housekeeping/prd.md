# 会话遗留杂务清理（skill 清理/issue 核对/journal 补账）

## Goal

清掉 6 个已归档会话留下的三件小额欠账，之后这些会话可彻底遗忘。

## Requirements

1. **Superpowers skill 清理**（会话 66557e71 已获用户批准但从未执行）：删除 `.claude/skills/` 下 Superpowers 套件（using-superpowers、brainstorming、writing-plans、executing-plans 等 ~20 个）及 `.superpowers/` 目录，只保留 trellis-* 系。⚠️ 两个前置注意：① 授权在已死会话，执行前向用户再确认；② 本机 skill 布局是 **`.agents/skills` 为唯一实体源、各平台目录为软链**——先确认删除对象是软链还是实体，从源头删，勿只删软链留悬挂。
2. **核对 3 个 AI 层 issue 是否已录入 Linear**（会话 2468d742 拟好全文）：定时 Agent 写入授权模型 / Agent 成本护栏 / Embedding 模型与维度定稿。未录入则从转录 `~/.claude/projects/-Users-zoo-zoo-CC---------mewmo/2468d742-1e51-4be8-b3ab-11e5e46e1037.jsonl` entry 134 取全文录入（另有 1 组 pgvector issue 增补评论）。
3. **journal 补账**：shell 画框 UI 改造的设计决策已抢救至 `.trellis/workspace/zoo/session-briefs/shell-frame-css.md`；顺带评估是否为深色模式设计真正的选中态高亮色（当前与 --raised 同值无视觉变化），如做则单独开任务。

## Acceptance Criteria

- [ ] Superpowers 套件删除完成（或用户否决并记录），Trellis 工作流不受影响
- [ ] 3 个 AI 层 issue 的 Linear 状态核对结论；缺失者已录入
- [ ] 深色选中态评估结论记录
