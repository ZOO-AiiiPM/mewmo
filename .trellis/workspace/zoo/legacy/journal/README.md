# journal/ —— 时间线 / 决策 / 踩坑（按 owner 分片）

每个 agent·session 写**自己的文件**，各写各的、零并发冲突。不再共用单一 `journal.md`。

## 文件命名
`{agent-id}__{session-或日期}.md`，例：`claude-main__2026-06-01.md`、`search-impl__2026-06-02.md`。
文件名要能一眼看出是谁、哪个 session / 哪天写的。

## 写法
- 只在**自己**的文件里**追加**条目，绝不改别人的文件（这是并发安全的关键）。
- 每条顶部一行元数据：`> agent: {agent-id} · branch: {branch} · {日期}`。
- 内容：做了什么 / 决策 / 踩坑。

## 不注入 SessionStart
journal 历史**不进开场 brief**（brief 只注入 STATUS + sessions 卡）。需要背景 / 决策 / 踩坑时按需来这里读。

## 存档
`_archive-*.md` 是旧的单文件 journal 历史（2026-06-01 前），**只读存档**，不再追加。
