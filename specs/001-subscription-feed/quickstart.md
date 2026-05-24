# Quickstart: 订阅区开发 / 验收

**Audience**: implementer（你 / 未来 session 的 Claude）+ 用户验收
**Context**: 实现 phase（`/speckit-tasks` 拆任务后逐项实现）+ 验收 phase（implement 完跑这个手动测试脚本）

## 开发环境前置

```bash
# 当前已在 worktree 内（feature+subscription 分支），node_modules 已装好
cd "/Users/zoo/zoo/CC工作目录/进行中/vibe coding/.claude/worktrees/feature+subscription/app"

# Rust 工具链 PATH（CLAUDE.md 项目硬规则）
export PATH="$HOME/.cargo/bin:$PATH"

# 加 feed-rs 依赖
# 编辑 src-tauri/Cargo.toml [dependencies] 段，加：
#   feed-rs = "2"
cargo build --manifest-path src-tauri/Cargo.toml

# 跑 dev
pnpm tauri dev
```

## 实现顺序（建议）

按"每步 commit 后 app 仍可运行"的切片原则（CLAUDE.md execution.md 硬规则）：

1. **Schema migration**：在 `src-tauri/src/lib.rs` 既有 migrations 数组追加新 version → app 启动时自动建表 → 验证 sqlite 里有 `subscription_sources` + `feed_entries` 表（dev 模式 db 路径：`~/Library/Application Support/com.vibecoding.app/vibe.db`）
2. **后端 module 骨架**：建 `src-tauri/src/subscription/` 目录 + `mod.rs / store.rs / adapter.rs / scheduler.rs / commands.rs` 五个空文件，`lib.rs` 加 `mod subscription;`
3. **Store 层**：`store.rs` 实现 Source / Entry CRUD（参照 lib.rs 既有的 notes 操作模式）
4. **Adapter 层**：`adapter.rs` 定义 `trait FetchAdapter` + `RssAtomAdapter` 实现（reqwest GET + ETag/If-Modified-Since header + feed-rs 解析）
5. **Scheduler 层**：`scheduler.rs` 实现 `batch_fetch_all` 函数（DB 取所有 source → 串行 adapter.fetch → 入库）
6. **Commands 层**：`commands.rs` 7 个 Tauri command（按 contracts/tauri-commands.md），`lib.rs` 注册到 `invoke_handler`
7. **前端 types + lib**：`src/types.ts` 加类型；`src/lib/subscription.ts` 加 invoke wrapper
8. **前端组件**（按依赖顺序）：
   - `EntryReader.tsx`（最简单：纯渲染）
   - `EntryList.tsx`（参照 NoteList 分桶）
   - `SourceList.tsx`（参照 NoteList，多一个 favicon + unread badge）
   - `AddSourceDialog.tsx`（modal，含公众号 onboarding 折叠区）
   - `SourceManageView.tsx`（表格视图）
   - `SubscriptionLayout.tsx`（三栏容器，组合上面四个）
9. **App.tsx 集成**：`activeZone === 'subscribe'` 分支挂载 `<SubscriptionLayout>`
10. **TabBar.tsx 调整**：tab 的 refId 改为 `{ source_id?: number, entry_id?: number }` 复合类型

每步完成后 `pnpm tauri dev` 验证 app 还能启动 + 既有功能（notes / clip / sediment）不破。

## 验收脚本（implement 完后跑）

> 实际验收时建议用真实公开 RSS 源（不依赖三方桥接），减少干扰。

### 验收 1：US-1 添加并看到内容（spec.md User Story 1）

```text
[1] pnpm tauri dev 启动
[2] 切到订阅 zone
    预期：看到空状态卡片 + "添加你的第一个订阅源"按钮
[3] 点 "添加" → 输入 https://stratechery.com/feed → 点添加
    预期：modal 关闭，sources 列出现 "Stratechery"，开始抓取（status=pending）
[4] 等待 5-30s
    预期：source.status 变为 ok，entries 列出现历史内容（≥ 1 条）
[5] 检查 sqlite：
    sqlite3 vibe.db "SELECT * FROM subscription_sources;"
    sqlite3 vibe.db "SELECT COUNT(*) FROM feed_entries WHERE source_id=1;"
    预期：1 条 source，N 条 entry
```

### 验收 2：US-2 阅读单篇（spec.md User Story 2）

```text
[1] 在 entries 列点选一条
    预期：reader 渲染该 entry 的 title + meta + content_html
[2] 检查列表上该 entry 的 unread-dot 消失
[3] sqlite3 vibe.db "SELECT read_at FROM feed_entries WHERE id=<X>;"
    预期：read_at 为 unixepoch（非 NULL）
[4] 切换 light / dark 主题
    预期：含 inline color 的内容（如灰阶字体）正常适配，不出现"白底深字看不见"
[5] 点 reader toolbar "在浏览器打开" 按钮
    预期：默认浏览器打开 entry.link
```

### 验收 3：US-3 管理订阅源（spec.md User Story 3）

```text
[1] sources 列 header 点齿轮 → 进入源管理页
    预期：表格展示所有 source，含状态徽章 + 上次抓取时间 + 删除按钮
[2] 添加 2-3 个源后回管理页
    预期：所有源都列出
[3] 点删除按钮 → 确认
    预期：source 消失，sqlite 验证 source + 关联 entries 都被删（CASCADE）
```

### 验收 4：抓取调度

```text
[1] 关 app，等到第二天再启动 / 或手动改 sqlite 把 last_fetched_at 改成昨天
[2] 启动 app
    预期：app 启动后看到右上角 spin animation，3-30s 内 sources 列状态更新
[3] 点 sources 列 header 刷新按钮
    预期：spin animation，几秒后看到 "刷新完成" 反馈，新内容（如有）出现
```

### 验收 5：错误处理

```text
[1] 添加一个不可达 URL（如 https://invalid.example.notexist/feed）
    预期：modal 显示 "FETCH_FAILED: ..." 错误，**不入库**
[2] 添加一个返回 200 但不是 RSS 的 URL（如 https://www.google.com）
    预期：modal 显示 "PARSE_FAILED: ..."
[3] 已添加的源，模拟 server 不可达（断网 + 手动刷新）
    预期：source 显示 unhealthy 红点（连续 3 次失败后），entries 不变
```

### 验收 6：性能 / 离线

```text
[1] 添加 5 个真实 RSS 源
    预期：5 源 × ~2-5s 顺序抓 = 10-25s 内全部完成
[2] 断网后切到订阅区
    预期：所有已抓取 entries 仍可阅读（离线可读）
[3] 断网后点刷新
    预期：所有源标 unhealthy（DNS / connection error）但保持订阅
```

## 风险点回归测试

- **暗色模式适配**：含 `<span style="color:rgb(...)">` 的 entry 在 dark 主题下灰阶文字适配（参照 ClipReader 的 isNeutralColor 判断）
- **大 feed 入库**：找一个有 ≥ 100 条历史的源，抓取不应卡死 UI 或 OOM（feed-rs 流式解析 + batch insert）
- **重复添加**：同一 URL 加两次，第二次应明确报 `DUPLICATE_URL`，不污染数据
- **guid 缺失**：构造一个测试 feed 没 guid，应 fallback 到 link 做去重 key
- **极长 content**：>5MB content_html 应被截断（防恶意 feed）

## 前置依赖（external）

如要测公众号订阅，需用户**自行 setup**：

1. 跑 [we-mp-rss](https://github.com/rachelos/we-mp-rss) Docker 镜像
2. 申请个人公众号，扫码登录 we-mp-rss 后台
3. 添加目标公众号 → 拿到 RSS URL → 粘到 vibe-coding 订阅区

vibe-coding 的代码不直接测公众号订阅（路径 = 普通 RSS URL，无特殊处理）。

## 不在本期范围

- AI 摘要 / 跨内容关联 / Daily Brief（独立 spec）
- 多设备同步（宪法范围红线）
- 按 source 单独抓取间隔（v3）
- OS 级后台抓取（v3）
- OPML 导入 / 导出（v2 考虑）
