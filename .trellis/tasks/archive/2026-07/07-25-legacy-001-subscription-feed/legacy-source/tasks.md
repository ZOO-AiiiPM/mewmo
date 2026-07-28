# Tasks: 订阅区（Subscription Feed Zone）

**Input**: Design documents from `/specs/001-subscription-feed/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/tauri-commands.md, quickstart.md

**Tests**: 项目无显式 test framework（既有 Note/Clip 都没单元测试），本 tasks.md 不生成 test tasks。验收靠 quickstart.md 的 6 项手动测试脚本。

**Organization**: 按 user story 组织（US1 / US2 / US3 取自 spec.md），每个 phase 是"commit 后 app 仍可启动"的内聚切片（CLAUDE.md execution.md 硬规则）。

## Format: `[ID] [P?] [Story] Description`

- **[P]**：不同文件，无前序依赖 → 可并行
- **[Story]**：US1 / US2 / US3 标记所属 user story（Setup / Foundational / Polish 不带 Story 标）

## Path Conventions

本项目是 Tauri 单工程 monorepo（`app/` 子目录）：

- 后端 Rust：`app/src-tauri/src/`
- 前端 TS：`app/src/`
- 数据库 migration：`app/src-tauri/src/lib.rs`（既有内联 migration 数组，按现有模式追加）

---

## Phase 1: Setup（共享前置）

**Purpose**: Cargo 依赖到位，build 通过

- [ ] T001 在 `app/src-tauri/Cargo.toml` 的 `[dependencies]` 段加 `feed-rs = "2"`，跑 `PATH="$HOME/.cargo/bin:$PATH" cargo build --manifest-path app/src-tauri/Cargo.toml` 验证 build 通过

**Checkpoint**: cargo 编译通过，app 仍可启动（`pnpm tauri dev`）

---

## Phase 2: Foundational（所有 US 的前置 — 完成后 US1/US2/US3 可独立推进）

**⚠️ CRITICAL**: User story 实施前必须完成本 phase

- [ ] T002 新增 SQLite migration：在 `app/src-tauri/src/lib.rs` 既有 migrations 数组追加 version（`subscription_sources` + `feed_entries` 两表 + 3 个 index，schema 见 `data-model.md`）。app 启动时验证 sqlite 里两表已建立（`sqlite3 vibe.db ".tables"`）
- [ ] T003 后端 module 骨架：建 `app/src-tauri/src/subscription/` 目录，新建 5 个文件（`mod.rs` / `store.rs` / `adapter.rs` / `scheduler.rs` / `commands.rs`），仅 `mod.rs` 写 `pub mod store; pub mod adapter; pub mod scheduler; pub mod commands;`，其它 4 个先放空（保留对应 `pub fn`/`pub trait` 的 stub，便于后续填充）；`lib.rs` 顶部加 `mod subscription;`。`cargo build` 通过
- [ ] T004 [P] 实现 `app/src-tauri/src/subscription/store.rs`：定义 `Source` / `Entry` / `SourceStatus` 三个结构体（参照 `data-model.md` Rust entities）+ Source CRUD（insert / list / get_by_id / delete / update_after_fetch / increment_failure / reset_failure）+ Entry CRUD（batch_insert_with_dedup / list_by_source / mark_read / count_unread）。用 `tauri-plugin-sql` 既有 db handle，按 `lib.rs` 既有 notes 操作模式
- [ ] T005 [P] 前端类型：在 `app/src/types.ts` 末尾追加 `SourceStatus` / `SubscriptionSource` / `FeedEntry` 三个类型（数据模型见 `data-model.md` TS entities）
- [ ] T006 [P] 前端 invoke wrapper：新建 `app/src/lib/subscription.ts`，按 `contracts/tauri-commands.md` 末尾给的 wrapper 模板复制 7 个函数 + `RefreshSummary` 类型（command 还没实现也不影响——wrapper 是纯类型定义+invoke 调用，编译期 ok）
- [ ] T007 在 `app/src/App.tsx` 的 `activeZone === 'subscribe'` 分支挂载占位组件 `<div>订阅区开发中</div>`（确认 Zone 切换可达，避免之前点 subscribe 进死页）

**Checkpoint**: 后端 module 骨架编译通过，前端类型 + wrapper 就位，订阅 zone 切到能看到占位文案。所有 US 现在可独立开工

---

## Phase 3: User Story 1 — 添加订阅源并看到更新内容（Priority: P1）🎯 MVP

**Goal**: 用户进订阅区 → 添加 RSS URL → 看到该源的标题列表（按时间倒序 + bucket 分桶）

**Independent Test**: 添加一个真实公开 RSS（如 `https://stratechery.com/feed`），5-30s 内 source 出现在左栏、entries 列出现 ≥1 条历史

- [ ] T008 [US1] 实现 `app/src-tauri/src/subscription/adapter.rs`：定义 `pub trait FetchAdapter { async fn fetch(&self, source: &Source) -> Result<FetchResult, FetchError> }` + `RssAtomAdapter` 实现（reqwest GET 带 If-None-Match / If-Modified-Since header；304 → 跳过；200 → 算 MD5 hash → 与 source.last_content_hash 比较 → 一致跳过 / 不一致用 feed-rs 解析 → 拿到 entries 列表）。`FetchResult` enum 含 `NotModified` / `Updated { entries, etag, last_modified, content_hash, feed_meta }`
- [ ] T009 [US1] 实现 `app/src-tauri/src/subscription/scheduler.rs`：`pub async fn batch_fetch_all(db) -> RefreshSummary`（SELECT 所有 source → 串行调用 adapter.fetch → 失败重试 2 次（5s 间隔）→ 仍失败 increment_failure，连续 3 次标 unhealthy → 成功 reset_failure + 入库 entries via store.batch_insert_with_dedup）+ `pub fn should_auto_refresh_on_startup(db) -> bool`（SELECT MAX(last_fetched_at) → 与 today 比）
- [ ] T010 [US1] 实现 `app/src-tauri/src/subscription/commands.rs` 的 5 个 command：`add_subscription` / `list_sources_with_unread` / `list_entries_for_source` / `refresh_all_subscriptions` / `should_auto_refresh_on_startup`（接口见 `contracts/tauri-commands.md`）。在 `lib.rs` 的 `tauri::Builder::default().invoke_handler(...)` 注册这 5 个。`pnpm tauri dev` 验证启动正常
- [ ] T011 [P] [US1] 前端 `app/src/components/SourceList.tsx`（参照 `NoteList.tsx`：左栏 w-56、source-favicon + name + unread badge、`bg-black/[0.06] dark:bg-white/[0.08]` 选中态、空状态提示"还没订阅任何源 ✨"）
- [ ] T012 [P] [US1] 前端 `app/src/components/EntryList.tsx`（参照 `NoteList.tsx` 的分桶：用 `lib/dateBuckets.ts` 既有 `groupByBucket` 按 published_at 分桶；sticky h-12 bucket-header + backdrop-blur；entry item 含未读小圆点 + title 2 行 clamp + excerpt 2 行 clamp + foot meta；w-80 ≈ 320px）
- [ ] T013 [P] [US1] 前端 `app/src/components/AddSourceDialog.tsx`（modal + URL input + 错误状态 + 公众号 onboarding 折叠区指向 we-mp-rss / RSSHub。视觉参照原型 `tmp/subscription-prototype/index.html` 的 `tpl-add` 段）
- [ ] T014 [US1] 前端 `app/src/components/SubscriptionLayout.tsx`（三栏容器：管理 sources / entries / selected ids 状态；`useEffect` 启动时调 `shouldAutoRefreshOnStartup` → 自动 refresh；header 加刷新按钮调 `refreshAllSubscriptions`；空状态 / 主视图分支渲染；Reader 占位先放 placeholder）。在 `App.tsx` 把 T007 的占位换成 `<SubscriptionLayout>`
- [ ] T015 [US1] 跑 `pnpm tauri dev`，按 `quickstart.md` 验收 1（添加 stratechery.com/feed → 看到 source + entries 入库 + sqlite 验证）。spec.md US1 全部 acceptance scenarios 通过 = checkpoint

**Checkpoint**: US1 闭环完成，订阅 → 抓 → 看列表全流程可用。可作为 MVP demo

---

## Phase 4: User Story 2 — 阅读单篇内容（Priority: P2）

**Goal**: 用户从 entries 列点选条目 → 进 reader → 看到完整正文 + 图片 + 暗色适配 + 已读状态记忆

**Independent Test**: 在 US1 已有 entries 基础上点选任意一条 → reader 渲染完整正文 + 图片正常 + 切到 dark 主题灰阶字体不变白底深字 + 列表上 unread-dot 消失

- [ ] T016 [US2] 在 `app/src-tauri/src/subscription/commands.rs` 加 `mark_entry_read` command（接口见 `contracts/tauri-commands.md`），`lib.rs` 注册
- [ ] T017 [US2] 前端 `app/src/components/EntryReader.tsx`（参照 `ClipReader.tsx`：toolbar 左组 ← 返回上一条 / → 在浏览器打开原文，右组 ⤢ 全屏切换；正文区用 `marked` 渲染 content_html → markdown 后挂 `.clip-prose` 作用域；复用 `ClipReader` 的 `isNeutralColor` 灰阶判断 + `useEffect` 主题切换时遍历 inline color。最大宽度 680px 居中）
- [ ] T018 [US2] `SubscriptionLayout.tsx` 集成 `EntryReader`：点 entry → 调 `markEntryRead` → 刷新该 entry 在列表里的 read_at 状态 → reader 渲染选中 entry。entry 历史栈用 ref 记录，← 按钮 pop 上一条
- [ ] T019 [US2] 跑 `quickstart.md` 验收 2（点选 entry → reader 渲染 / 暗色适配 / read_at 持久化 / 在浏览器打开）

**Checkpoint**: US1 + US2 都可用，订阅区已有"知道有更新 + 实际能读"完整价值

---

## Phase 5: User Story 3 — 管理订阅源（Priority: P3）

**Goal**: 用户能查看所有源 + 看抓取状态 + 删除不要的源（含确认对话框）

**Independent Test**: 添加 ≥3 个源 → 进管理视图看全部 + 状态徽章正确显示 → 删除某源 → sqlite 验证 source + entries 都被 cascade 删除

- [ ] T020 [US3] 在 `app/src-tauri/src/subscription/commands.rs` 加 `delete_source` command，`lib.rs` 注册
- [ ] T021 [P] [US3] 前端 `app/src/components/SourceManageView.tsx`（表格视图，含 favicon + name/url + last_fetched + 状态徽章（`status-ok` / `status-pending` / `status-err`）+ 删除按钮 hover 红色。视觉参照原型 `tmp/subscription-prototype/index.html` 的 `tpl-manage`）
- [ ] T022 [US3] `SubscriptionLayout.tsx`：sources 列 col-header 齿轮按钮切到 manage 视图；删除按钮接 `deleteSource` + 确认对话框（参照既有 `ConfirmDialog.tsx`）→ 删除后刷新 sources 列表
- [ ] T023 [US3] 跑 `quickstart.md` 验收 3 + 验收 5（错误处理：添加不可达 URL / 已订阅源持续失败标 unhealthy 红点）

**Checkpoint**: US1 + US2 + US3 全部可用，订阅区功能完整

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 补 Constitution Check ⚠️ + 跑完整验收 + 发布前清理

- [ ] T024 埋点（宪法 V 条）：在 `app/src-tauri/src/lib.rs` 既有 migrations 追加 `events` 表（`id / event_name / payload_json / created_at`，若表不存在则建）；在 `subscription/commands.rs` 关键动作打点（`subscription_add` / `subscription_fetch_success` / `subscription_fetch_fail` / `subscription_open_entry` / `subscription_mark_unhealthy` / `subscription_delete`）。事件不上报远端，只写本地 sqlite
- [ ] T025 [P] 文档：在 `AddSourceDialog.tsx` 的公众号 onboarding 折叠区，把内容扩成图文步骤（"1. docker run we-mp-rss → 2. 浏览器开 localhost:8080 → 3. 扫码登录 → 4. 添加目标公众号 → 5. 复制 RSS URL 粘到这里"），附 GitHub repo 链接
- [ ] T026 跑 `quickstart.md` 全部 6 项验收脚本（含验收 4 调度 / 验收 6 性能 + 离线）；对照 `spec.md` 的 SC-001 ~ SC-007 逐条核对
- [ ] T027 [P] 风险点回归（`quickstart.md` 末尾段）：暗色模式适配 / 大 feed 入库 / 重复添加 / guid 缺失 fallback / 极长 content 截断
- [ ] T028 README.md 进度标记从 🚧 改为 ✅（如全部验收通过）

**Checkpoint**: 订阅区可对外发布

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: 立刻开始
- **Phase 2 (Foundational)**: 依赖 Phase 1 完成 — **阻塞所有 US**
- **Phase 3 (US1)**: 依赖 Phase 2 完成
- **Phase 4 (US2)**: 依赖 Phase 2 完成（与 US1 并行可，但 US2 没有 entries 来源所以实际要先 US1）
- **Phase 5 (US3)**: 依赖 Phase 2 完成（与 US1/US2 并行可）
- **Phase 6 (Polish)**: 依赖所需 US 完成

### 单 vibe coder 推荐顺序

按 priority + 依赖串行：T001 → T002 → T003 → T004/T005/T006/T007 (并行可) → T008 → T009 → T010 → T011/T012/T013 (并行可) → T014 → T015 → T016 → T017 → T018 → T019 → T020 → T021 → T022 → T023 → T024 → T025/T027 (并行) → T026 → T028

### Parallel Opportunities

- **Phase 2 内**：T004 (store) / T005 (types) / T006 (wrapper) / T007 (App.tsx 占位) 互相不冲突，可并行
- **Phase 3 前端**：T011 / T012 / T013 是不同文件无依赖，可并行
- **Phase 6 polish**：T025 / T027 互不冲突

---

## Implementation Strategy

### MVP 路径（推荐）

1. Phase 1 + Phase 2 → 基础设施就绪
2. **Phase 3 (US1)** → 跑 `验收 1` → MVP demo 可对外
3. STOP & VALIDATE — 确认 US1 真实跑通再继续
4. Phase 4 (US2) → 阅读体验补足
5. Phase 5 (US3) → 管理能力补足
6. Phase 6 → 埋点 + 验收清扫 + 发布

### 切片纪律（CLAUDE.md execution.md 硬规则）

- 每个 task commit 后 `pnpm tauri dev` 必须能启动 + 既有功能（notes / clip / sediment）不破
- 大功能 WIP 禁止落 main，本 worktree 在 `001-subscription-feed` 分支累积，全部 done + 验收通过后再合并
- 拒绝 `--no-verify` 跳过 hook
- commit message 跟随既有项目风格：`feat(subscription): ...` / `fix(subscription): ...` / `docs(subscription): ...`

---

## Notes

- 28 个 task，按 quickstart.md 的 10 步切片重构成"按 user story 组织 + 内聚 commit 切片"双重约束的清单
- US1 是 MVP，做完即可对外 demo
- Polish phase 的埋点（T024）是宪法 V 条 explicit 要求，不能省
- 公众号 onboarding 文档（T025）保证 Path A 用户体验闭环
- 验收脚本（T026/T027）放最后，对照 spec.md SC-001~SC-007 + risk regression
