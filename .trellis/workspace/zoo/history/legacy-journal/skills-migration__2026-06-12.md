> agent: skills-migration · branch: 1.0version · 2026-06-12

## speckit-* skills → superpowers 全套核心（决策 + 操作）

**背景**：用户要把 intro-builder 项目里实战的 superpowers skill 套搬到 mewmo。

**决策（选 A：替换，不共存）**：
- mewmo 主目录原有 14 个 `speckit-*` skill，和 superpowers 是同类 spec→plan→implement 流程框架，并存会让 agent 在「该走哪套流程」上分裂（违反 MECE）。
- 关键实证：`speckit-git-commit` 的 description 是「命令跑完自动提交」，**直接违反** zoo 全局 execution.md 铁律「commit/push 只在用户明确要求时」。speckit 的 git 自动化在本工作流里是 footgun。
- superpowers（verification-before-completion / systematic-debugging / using-git-worktrees / TDD）和 zoo 现有全局规则同向加固，不打架。

**操作**：
- speckit-* 14 个移到 `.claude/skills-archive-speckit/`（移走不删，可逆）。
- 装 superpowers 14 核心到主目录 `.claude/skills/`：12 个来自 intro-builder 实战版，2 个（`using-superpowers` 总调度入口、`writing-skills`）intro-builder 缺、从 plugins 干净版补。
- 剔除 intro-builder 的项目专属件：template-studio（软链会断）、web-deploy、babysit-pr、image-analyzer。

**两个踩坑（反转链）**：
1. **zsh 不做 word-split**：`for s in $KEEP`（KEEP 是空格分隔字符串）在 zsh 里把整串当一个文件名，报 "File name too long"。bash 会拆，zsh 默认不拆。改成把名字字面量直接列进 for 循环才成。
2. **worktree skill 可见性 footgun**：skill 装主目录，但 session 跑在 worktree（CWD=`worktrees/1.0version/app`）。CC 沿 CWD 向上找 `.claude/skills`，worktree 根原本没有 → 主目录 skill 不可见。解法：worktree 根 `.claude/skills` 软链 → 主目录 `.claude/skills`（实测沿树能找到，当前 session 免重启即生效）。已把这条软链逻辑加进 `seed-worktree-stubs.js`（幂等：旧软链重建，真实目录跳过），新建 worktree 自动带 skill。

**恢复方式**：要回退 speckit，`mv .claude/skills-archive-speckit/speckit-* .claude/skills/` 即可。
