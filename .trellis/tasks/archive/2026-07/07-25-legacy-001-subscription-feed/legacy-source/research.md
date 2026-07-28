# Phase 0 Research

**Status**: Consolidation only —— 详细技术调研已落到 [research-backend.md](./research-backend.md) 和 [research-wechat-mp.md](./research-wechat-mp.md)，本文档仅汇总关键决策。

## Decisions Summary

### D1：RSS / Atom 解析库 = `feed-rs`

- **Decision**: 用 `feed-rs = "2"` 做 RSS 0.9-2.0 / Atom 1.0 / JSON Feed 的统一解析
- **Rationale**: 唯一把多种 feed 格式抽象成统一 `Feed { id, title, entries }` 模型的 Rust 库；活跃维护（2026-05-18 commit）；MIT
- **Alternatives considered**:
  - `rust-syndication/rss` (495 stars) + `atom_syndication` (97) 组合 → 上层要写 dispatcher，徒增复杂度
  - 纯 `xmltree` 自己写解析 → 重复造轮子，解析 RSS / Atom 边界情况会很痛
- **Reference**: [research-backend.md §1](./research-backend.md)

### D2：HTTP 抓取层 = 复用现有 `reqwest 0.12`

- **Decision**: 不新增 HTTP 库；扩展 reqwest 用法支持 ETag / Last-Modified 条件请求
- **Rationale**: Cargo.toml 已有 reqwest 0.12（用于剪藏功能）；事实标准；满足条件请求 / 超时 / 重定向所有需求
- **Alternatives considered**: `ureq`（同步阻塞，不适合并发抓取）/ `hyper`（太底层）
- **Reference**: [research-backend.md §2](./research-backend.md)

### D3：抓取调度策略 = 启动检查 + 手动按钮（不常驻）

- **Decision**: app 启动时若 `last_global_fetch_date != today` → 触发一次 batch fetch；用户手动点刷新按钮可强制触发；关 app 即停（不接 OS 级后台任务）
- **Rationale**: 信息天级新鲜度足够，30min 常驻轮询是过度设计；调度器代码量从 ~150 降到 ~50 行
- **Alternatives considered**:
  - `tokio::interval` 30-60min 常驻 → 业界惯例（NetNewsWire）但**不适配 vibe-coding 克制工具哲学**
  - OS 级后台任务（launchd / Windows Task Scheduler） → 跨平台复杂度爆炸，关 app 还跑违反"轻量工具"语义
  - 前端 setInterval + invoke → Chromium 节流不可控
- **Reference**: [research-backend.md §3](./research-backend.md)

### D4：错误处理 = ETag/MD5 双层去重 + 失败 3 次标 unhealthy（不取消订阅）

- **Decision**: 抓取流程 = 条件请求 → 304 跳过 / 200 → 算 MD5 → 一致跳过 / 不一致 → 解析 + 入库；网络错重 2 次（5s 间隔）；连续 3 次失败标 `unhealthy` 但保持订阅
- **Rationale**: 双层去重照搬 NetNewsWire AvoidFeedParsing technote，省 90%+ 流量；3 次阈值（每天 1 次 = 3 天观察期）比业界 10 次（10 天）更合理；不自动取消是"工具不替用户做主"
- **Alternatives considered**:
  - 仅 ETag 不算 hash → 服务端不维护 ETag 时退化为每次拉全量
  - 失败即取消 → 反模式（用户的历史内容会丢）
- **Reference**: [research-backend.md §4](./research-backend.md)

### D5：公众号 / X / YouTube 等非标准源 = 用户自部署桥接（Path A）

- **Decision**: vibe-coding **仅接 RSS URL**；公众号通过用户自部署 we-mp-rss / wewe-rss 输出的 RSS URL 接入；不内嵌任何爬虫或桥接服务代码
- **Rationale**:
  1. 业界主流阅读器（Reeder / Inoreader / Feedly）全员不内嵌爬腾讯——根因：腾讯反爬不可控 + 封号责任无法承担
  2. RSSHub 是 AGPL-3.0 → 协议传染会污染整个 vibe-coding，永久失去商业化和闭源版本可能
  3. we-mp-rss / wewe-rss 虽 MIT 但需要 Node.js / Python runtime，Tauri 内嵌打包是噩梦（+150MB+）
- **Alternatives considered**:
  - Path B：we-mp-rss 作为 sidecar 进程 → +2-3 周工程量、+150MB 包体积、跨平台测试坑
  - Path C：用云端公共实例 → 没有可用公共实例（RSSHub 公共没有公众号路由，wewe-rss/we-mp-rss 作者明确不提供托管）
- **Reference**: [research-wechat-mp.md](./research-wechat-mp.md)

### D6：抓取层抽象 = `trait FetchAdapter`

- **Decision**: 抓取逻辑抽象成 `trait FetchAdapter { async fn fetch(&self, source: &Source) -> Result<Vec<Entry>> }`；v1 仅实现 `RssAtomAdapter`；v2 加 `RsshubAdapter` 等 impl 不动调度器和 UI
- **Rationale**: 现在抽 trait 多花 1-2 天，换 v2 不重写——边际成本极低
- **Alternatives considered**: 直接把 reqwest + feed-rs 写死在调度器里 → v2 加新源类型时要改调度 / 改存储 / 改 UI

### D7：前端组件结构 = 三栏（Source / Entry / Reader），复用 note 区视觉语言

- **Decision**: SubscriptionLayout 渲染三栏 SourceList(w-56) + EntryList(w-80) + EntryReader(flex-1)，全部参照 note 区的 Tailwind v4 + light/dark 调色板 + sticky bucket header + `bg-black/[0.06]` 选中态
- **Rationale**: 用户已确认"参照 note 区"是设计前提；原型已通过验收
- **Reference**: 原型 `tmp/subscription-prototype/index.html`

## Resolved Clarifications

spec.md 的 3 个 NEEDS CLARIFICATION 在 spec 阶段已全部消解——本 plan 阶段无新的 clarification 需要处理。

## Open Risks（向 tasks 阶段交付）

| 风险 | 缓解 |
|---|---|
| 部分源不返回 ETag → MD5 hash 兜底 | 已设计在 D4，tasks 阶段确认实现覆盖 |
| 大量历史 entry 一次入库阻塞 UI | tasks 阶段加 batch insert + 进度回调 |
| 用户首次添加大源时等待焦虑 | UI 显示"抓取中"loading 态 + 计数（原型已设计） |
| we-mp-rss 文档 onboarding 用户做不到 | tasks 阶段做一份图文步骤（截图 + 链接），放在添加源 modal 的折叠区 |
