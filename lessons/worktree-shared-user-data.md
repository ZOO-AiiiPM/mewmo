# worktree 不隔离 user data dir，多 worktree 跑 dev 共享 SQLite/偏好文件

> 桌面 app（Tauri / Electron / 原生 macOS app）在 worktree 工作流里反复犯的盲点：以为 worktree 隔离了一切，实际它只隔离 git working tree，user data dir 完全共享。

## 一句话本质

`git worktree` 隔离的是项目代码（working tree），不隔离系统级 user data 路径（`~/Library/Application Support/<bundle>/`、`~/.config/<app>/`、Electron 的 LocalStorage / IndexedDB / 偏好 plist 等）——多 worktree 跑同一个 app 的 dev 时这些路径**全部共享**，一边的 migration / 写入直接污染另一边的运行时状态。

## 现象

新建 worktree 起 dev 跑大重构（schema migration、indexedDB 升级、偏好结构重写），看起来 worktree 隔离很干净；但跑完之后用户反馈"我另一个分支的 dev 也炸了 / 数据看到不该看到的东西 / app 启动 panic"。例如：worktree 跑 v4 schema migration 加 `content_tokens` 列 + FTS 虚表 + 触发器，跑完发现用户在主仓库另一个分支跑的 dev 共用同一份 db，被强行升级到 v4 schema，但那个分支的 lib.rs 还是 v3 → 启动撞 schema mismatch / migration 版本号冲突。

更隐蔽的变体：worktree A 跑某个 buggy migration 把 db 写成 corrupt 状态（比如 FTS 索引 backfill 顺序错导致 "database disk image is malformed"），worktree B 即使代码完全没问题，启动也跟着 panic——因为 db 是 system-wide 路径下的同一个文件。

## 根因

`git worktree add <path> <branch>` 复制的是 git 视角下的 working tree（项目代码 + .git 链接），但**桌面 app 的运行时数据从来不在项目目录里**，而在系统约定的 user data 路径：

- macOS：`~/Library/Application Support/<bundle_id>/`、`~/Library/Preferences/<bundle_id>.plist`
- Linux：`~/.config/<app>/`、`~/.local/share/<app>/`
- Windows：`%APPDATA%\<app>\`、`%LOCALAPPDATA%\<app>\`
- Electron 默认 userData 也走以上路径

bundle_id 由 `tauri.conf.json` / `electron-builder` config / Info.plist 写死，多 worktree 默认拿到同一个 bundle_id → 同一个 user data 路径 → 同一份 SQLite 文件、同一份偏好、同一份 LocalStorage。worktree 在代码层面"看不到对方"，但 app 进程在数据层面**就是一份**。

## 修法

**起 worktree 跑 dev 之前显式选数据隔离策略**，三选一：

1. **改 bundle_id 含 worktree 名**：用 `tauri dev --config '{"identifier": "com.x.app.<worktree-name>"}'` 或同等的 inline override 让每个 worktree 有自己的 user data 路径。每个 worktree 第一次跑会从空数据起步，需要 seed 时 `cp` 主仓库的真 db 过去当起点。
2. **symlink 共享 + 明确容忍**：`~/Library/Application Support/com.x.app.<worktree-name>` symlink 到主 `com.x.app/`，让多 worktree 实例显式共享主 db。**前提是所有 worktree 的 schema migration 已经协调好版本号空间**（不同分支不能撞同一个 user_version）。
3. **完全独立 db**：worktree app config 指向项目目录内的 `./data/dev.db` 而非系统 user data dir，git ignore 掉。彻底干净，但开发时看不到主仓库的真实数据。

判断标准：纯重构 / 大 schema 变更选 1 或 3（独立数据避免污染主 db）；UI 调整 / 小 bug 修复选 2（共享数据接近真实使用场景）。**绝对不能不选——默认行为就是共享，"安全感"是错觉**。

## 适用场景

- Tauri app 多 worktree 开发，特别是涉及 schema migration / SQLite 表结构改动
- Electron app 多 worktree 测试不同分支的 IndexedDB / LocalStorage 行为
- 任何写入系统级偏好文件（plist / registry / `~/.config`）的桌面 app 多分支并行开发
- macOS 原生 app（SwiftUI / AppKit）用 NSUserDefaults / Core Data 默认存储位置

不适用场景：纯 web 项目（数据在 server 或浏览器 localStorage 走域名隔离）、无持久化的 CLI 工具、单 worktree 开发。

## 与其他规则的关联

- 这不是"在 main 上一切正常但在 worktree 炸了"的 base ref 落后问题（那个见 journal 5-24"worktree base ref 落后"条目），而是反过来——worktree 内的代码改动外溢污染了 worktree 外的 user data。
- 也不是"破坏性 git 操作覆盖未提交改动"（见 `lessons/git-reset-hard-覆盖未提交改动.md`），那个的覆盖发生在项目代码层，这个发生在 user data 层；两者根因不同（前者是没看 dirty，后者是没意识到隔离边界）。
