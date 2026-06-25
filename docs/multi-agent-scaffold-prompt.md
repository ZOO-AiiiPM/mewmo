# 多 Agent 协作层改造提示词

> 复制以下 prompt 在项目里开一个 Claude session，一次性搭出完整的协作层骨架。
> 适用前提：项目已有代码 + git，想加上 multi-agent / multi-worktree 协作能力。

---

## Prompt

```
我要给当前项目加一套多 agent 协作层，让多个 Claude / Codex / Cursor session 能并行工作在不同 worktree 上而不撞车。先完整了解当前项目结构，然后按以下架构搭建。

## 目标

1. 任何 agent 冷启动进入任意 worktree，都能自动拿到当前状态（阶段目标 + 谁在改什么 + git 状态）
2. 多 agent 并行时不互相覆盖文件（防撞车）
3. 修 bug / 做组件 / 确立惯例时有周期性提醒沉淀到共享知识库
4. 协作元层不污染产品代码的 git history

## 架构（照搬，不要发明新结构）

### 文件布局

```
<project-root>/
├── agent.md                    # 唯一入口源（硬规则 + 技术栈 + 索引指针）
├── .agent/
│   ├── START_HERE.md           # 协作分层说明 + 读取顺序 + 写入规矩 + 并发安全
│   ├── scripts/
│   │   ├── agent-brief.js      # SessionStart 注入的状态简报脚本
│   │   ├── turn-reflect.js     # UserPromptSubmit 周期提醒脚本
│   │   ├── pre-bash-tmp-check.js  # PreToolUse 拦截系统 /tmp 写入
│   │   └── seed-worktree-stubs.js # 给新 worktree 铺指路桩 + hook 开关
│   ├── state/
│   │   ├── STATUS.md           # 阶段白板（人指挥更新，非流水账）
│   │   ├── WORKTREES.md        # worktree 用途登记表
│   │   ├── sessions/           # 各 agent 的 session 卡（声明 touching files）
│   │   └── .counters/          # turn-reflect 按 cwd 分桶的计数器
│   ├── registry/
│   │   ├── bugs-fixed.md       # 修过的 bug 索引（只追加）
│   │   ├── components.md       # 可复用组件索引（只追加）
│   │   └── patterns.md         # 项目惯例索引（只追加）
│   ├── templates/              # STATUS / session 卡模板
│   └── prompts/                # 可复用的 prompt（如本文件）
├── journal/
│   ├── README.md               # journal 写法规范
│   └── {agent-id}__{date}.md   # 各 agent 自己的时间线分片
├── lessons/                    # 给人看的深复盘（少而深）
└── <app-dir>/                  # 产品代码（被 git track）
    └── .claude/
        └── settings.local.json # hooks 配置（Claude Code 加载离 CWD 最近的 .claude/）
```

### 关键机制

**协作元层 vs 产品代码分离**：
- 根 `.gitignore` 只 track 产品代码目录，协作元层全部排除在 git 之外
- 公开发布只发产品代码

**3 个 Claude Hook（全部自定位，从 cwd 往上爬找 .agent/）**：
1. SessionStart → agent-brief.js：注入 STATUS + sessions 汇总 + git 状态 + registry 指针
2. UserPromptSubmit → turn-reflect.js：每 5/10/30 轮提醒沉淀 bug库/组件库/review
3. PreToolUse(Bash) → pre-bash-tmp-check.js：拦截写系统 /tmp（应写项目 tmp/）

**Hook 配置位置的关键规则**：
Claude Code 加载 settings 用的是「离 CWD 最近的 .claude/ 目录」，不是 git root 的 .claude/。
如果产品代码在子目录（如 app/），且 app/.claude/ 存在，hooks 必须配在 app/.claude/settings.local.json。
seed-worktree-stubs.js 负责把 hooks 合并写到正确位置。

**防撞车**：
- 一 agent 一 worktree 一 branch
- 开工前写 session 卡声明 touching / do-not-touch
- Brief 汇总所有活跃 session 的 touching 文件
- 不碰别人声明在改的文件

**并发写入安全（无锁）**：
- STATUS：人单点指挥，不并发
- Journal：按 owner 分片文件，各写各的
- Registry：只追加新行，不读改写回（OS 追加原子性兜底）
- Session 卡：按 owner 分文件

**Worktree 支持**：
- seed-worktree-stubs.js 给每个 worktree 铺：指路桩（CLAUDE.md/AGENTS.md/.cursorrules）+ hook 开关
- 脚本全部自定位（从 cwd 往上爬找 .agent/），worktree 里也能正确工作
- 新建 worktree 后跑一次 seed 即可

## 执行要求

1. 先分析当前项目的目录结构：产品代码在哪个目录、git root 在哪、是否已有 .claude/
2. 按上面架构创建所有文件，脚本逻辑参考 mewmo 项目已验证的实现
3. agent.md 要填入当前项目的真实信息（技术栈、路径、依赖等）
4. settings.local.json 的 hooks 放到 Claude Code 的真正 CWD 所在的 .claude/ 下
5. 根 .gitignore 配好：只 track 产品代码，排除协作元层
6. 跑一次 seed-worktree-stubs.js 验证
7. 创建一个初始 STATUS.md（当前阶段目标 = "协作层搭建完成，待验证"）
```

---

## 补充说明

- `agent-brief.js` 核心逻辑：读 STATUS + 扫 sessions/ 汇总 + `git status` + `git worktree list` + registry 行数统计，输出为 `hookSpecificOutput.additionalContext`
- `turn-reflect.js` 核心逻辑：按 cwd 分桶计数，到阈值时通过 `additionalContext` 静默注入提醒文本
- `pre-bash-tmp-check.js` 核心逻辑：检查 Bash 命令是否写 `/tmp`，是则 `decision: "block"` + 提示用项目 `tmp/`
- 所有脚本输出 JSON 格式 `{"hookSpecificOutput": {...}}`，hook 类型决定可用字段
