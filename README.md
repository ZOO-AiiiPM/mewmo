# vibe-coding

体现 AI 产品思维的 vibe coding 展示项目

> 本项目从 [claude-project-skill](https://github.com/ZOO-AiiiPM/claude-project-skill) 的 `assets/` 骨架创建。

## 快速开始

**推荐**：直接用 `/project-setup init <name> <desc> <abs_path>`，占位符和 `autoMemoryDirectory` 会自动配好，不用手动改。

**手动拷贝场景**：
1. 替换占位符 `vibe-coding` / `体现 AI 产品思维的 vibe coding 展示项目` 在 `CLAUDE.md` / `journal.md` / `README.md` 里
2. `cp .claude/settings.local.json.example .claude/settings.local.json`
3. 把 `autoMemoryDirectory` 改成本项目的**绝对路径**（如 `/Users/you/projects/my-project/.claude/memory`）
4. 读 `CLAUDE.md` 的"跨 Session 协作"段了解 journal / memory / rules 分工

## 目录说明

- `CLAUDE.md` — 每次 session 自动加载的规则和索引（目标 < 80 行）
- `journal.md` — 倒序时间线（进度 / 反思 / 决策），session 开头 Claude 读顶部几条
- `.claude/memory/` — 事实（服务器 / 账号 / API / 命令），Claude 对话中自动维护
- `.claude/rules/` — 长规则 / 按主题拆 / 支持 `paths:` 作用域触发
- `.claude/hooks/turn-reflect.sh` — 每 5 轮提 journal、每 10 轮提蒸馏（见下方）
- `lessons/` — 复杂反转 / 多步踩坑的完整案例叙事
- `docs/` — 给人读的产品文档（编号前缀保证阅读顺序）
- `workspace/` — 临时工作区（tmp / bak / scratch 被 gitignore）

**正式项目产物**（eval 结果 / LLM 生成 / 爬虫数据 / embedding）按项目需要在根建独立顶级目录（`eval-results/` / `llm-outputs/` / `scraped-data/` / `embeddings/`），配独立 gitignore。**不要塞 workspace**（workspace 语义是"临时"，放耗时产物后清理时风险大）。

## 预置 hook（默认启用）

两个 hook 配合，把跨 session 同步和规则维护自动化：

**`session-brief.sh`（SessionStart 触发）** —— 新 session 开始时让 Claude 读 journal 顶部 + MEMORY.md + CLAUDE.md 待做段，生成一段简短 brief（"上次做到 X / 当前焦点 Y / 今天接着做 Z"）。不用用户手动讲"我们上次做到哪里"。

**`turn-reflect.sh`（Stop 触发，三级）** —— 每轮对话后：
- **每 5 轮** — journal 提醒：判断要不要 append journal（有决策 / 踩坑 / 学到就写）
- **每 10 轮** — 蒸馏提醒：判断要不要蒸馏到 lesson / rules（附带 lesson / rule 写作标准）
- **每 30 轮** — 规则层 review 提醒：扫 CLAUDE.md + rules/ 找重复 / 冲突 / 可合并 / 可升级 / 过期的规则

Claude 自己判断自己写，没值得记 / 没发现问题就静默跳过。30 轮时三级同时触发。

**配置**：`.claude/settings.local.json` 的 `hooks.SessionStart` 和 `hooks.Stop` 两段。阈值在 `turn-reflect.sh` 顶部 `JOURNAL_EVERY` / `DISTILL_EVERY` / `REVIEW_EVERY` 改。关某一级把阈值设为大值（如 `999999`）；关某个 hook 删对应 `hooks.{事件}` 子段即可。
