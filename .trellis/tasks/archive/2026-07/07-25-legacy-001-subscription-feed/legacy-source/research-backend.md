# 后端技术方案预研：订阅功能

> 这份文档是 `/speckit-plan` 之前的**技术预研**，给用户在 spec 范围决策（Q1/Q2/Q3）之前一份"这事到底多复杂"的成本参考。正式 plan 时会被 `/speckit-plan` 接管并 refine。
> 调研日期：2026-05-22。事实基于 GitHub API 实数 + RFC 9110 + NetNewsWire 公开 technote。

---

## 1. RSS / Atom 解析库

Rust 生态没有"feedparser 一统江湖"的局面，是**两条路线并存**：

| 库 | Stars | 最近 commit | 覆盖 | 说明 |
|---|---|---|---|---|
| [feed-rs](https://github.com/feed-rs/feed-rs) | 201 | 2026-05-18 | RSS 0.9-2.0 + Atom 1.0 + JSON Feed | **统一抽象**，v2.3.1 |
| [rust-syndication/rss](https://github.com/rust-syndication/rss) | 495 | 2026-05-10 | 仅 RSS（不支持 Atom） | star 高但功能窄 |
| [atom_syndication](https://github.com/rust-syndication/atom) | 97 | 2026-05-10 | 仅 Atom | 需配合上一个 |

**推荐 feed-rs**——唯一把 RSS / Atom / JSON Feed 抽象成统一 `Feed { id, title, entries: Vec<Entry> }` 的库（[docs.rs/feed-rs](https://docs.rs/feed-rs)，"populates a unified data model over all feed formats"），把 `description` vs `subtitle` 等语义等价字段折成一个，正合"上层无差别"诉求。`rss + atom_syndication` 组合方案需要上层自己写 dispatcher，徒增复杂度，**不推荐**。

API 入口：`feed_rs::parser::parse(reader)` → `Feed { id, title, entries }`。

---

## 2. HTTP 抓取层

**直接复用项目已有的 `reqwest` 0.12**（在 `app/src-tauri/Cargo.toml` 已有）。reqwest 是 Tokio 生态首选 HTTP 客户端，11.6k stars，覆盖订阅器需要的所有特性：

- 自定义 `User-Agent`（建议 `vibe-coding/0.1`，部分源会拦截无 UA 的请求）
- `.timeout(Duration)` 单请求超时
- `.redirect(Policy::limited(10))` 重定向次数控制
- 手动加 `If-None-Match` / `If-Modified-Since` 头做条件请求

不需要换更轻的库——`ureq` 是同步阻塞，`hyper` 太底层，对桌面 app 都是退步。Tauri 2 官方 `tauri-plugin-http` 本质是 reqwest 的封装 + 权限白名单（给前端 fetch 用），后端直接用 reqwest 更直接。

---

## 3. 抓取调度策略

**用户最终决策（2026-05-22）**：

- **频率**：每天 1 次（不是常驻轮询）
- **触发**：app 启动时 + 用户手动点"刷新"按钮
- **关闭后**：不抓（不接 OS 级后台任务，关 app 即停）
- **去重**：启动时检查"上次抓取日期"——如果今天已经抓过，启动不再抓（避免反复开 app 反复抓）

**为什么这个策略合理**：

- 大多数订阅源（博客 / newsletter / 周刊）发布频率是天级，30min 轮询是过度设计
- 用户对"信息新鲜度"的真实容忍度通常是天级，不是小时级；真要紧急的内容用户自己会去原网站
- 关 app 不抓 = 不需要 OS 级后台任务（launchd / Windows Task Scheduler），跨平台复杂度归零
- 手动按钮 = 用户随时可以"现在就抓一次"，覆盖了"刚发布的文章想立刻看到"的极端场景

**实现**（比常驻 `tokio::interval` 简单得多）：

- app 启动时检查 `last_global_fetch_date`，今天没抓 → 触发一次 batch fetch；抓过 → 跳过
- 手动刷新按钮 → 一个 Tauri command `refresh_all_subscriptions()`，前端调用即可
- batch fetch 内部按 source 串行（50 源 × 单次 ~1s = 50s 内跑完，不需要并发 worker pool）；未来源数量超过 100 再加 `tokio::Semaphore` 限并发 4-8

**不需要**：常驻 `tokio::interval` 后台任务、按 source 单独间隔、复杂的 worker 调度。

---

## 4. 错误处理 / 重试 / 限流

**ETag / Last-Modified 是必做项，不是可选优化**：客户端用 `If-None-Match` + `If-Modified-Since`，服务端命中返回 `304 Not Modified` + 空 body，省 90%+ 流量与解析开销（[RFC 9110 §13.2.2](https://datatracker.ietf.org/doc/html/rfc9110)）。

**强烈推荐照搬 NetNewsWire 的双层去重**（[AvoidFeedParsing technote](https://github.com/Ranchero-Software/NetNewsWire/blob/main/Technotes/AvoidFeedParsing.markdown)）：
1. 第一层：HTTP 304 → 直接跳过
2. 第二层：即使没 304，content **MD5 hash** 与上次相同 → 跳过解析

**重试策略**：
- 网络错（DNS / timeout / 5xx）：单次抓取内**最多重试 2 次**，每次间隔 5s（不做长时间指数退避——下次抓已经是明天了，无意义）
- 每个 source 维护 `consecutive_failure_count`；**连续 3 次失败**标记 `unhealthy`（每天 1 次 = 3 天观察期），UI 红点提示**但保持订阅**——工具不替用户做主，自动取消订阅是反模式

**限流**：每天 1 次 batch fetch + 串行调用，**不需要 Semaphore 限并发**（直到 source 数量超过 100 再加）。

---

## 5. 数据源扩展（v2 桥接）

**[RSSHub](https://github.com/DIYgod/RSSHub)** (44k stars, AGPL-3.0) 是桥接事实标准，覆盖公众号 / X / YouTube / Substack / B站 / 知乎，社区维护 1500+ routes。备选 [RSS-Bridge](https://github.com/RSS-Bridge/rss-bridge)（PHP，447+ bridges，海外强中文弱）。

**集成方式：用户自填 RSSHub URL，app 不内置**。理由：
1. AGPL-3.0 传染性强，内置污染 vibe-coding 整体 license
2. RSSHub 是 Node.js 服务，打包进 Tauri 桌面包是噩梦
3. 公共实例稳定性差易被风控，让用户用自部署或自己信任的实例是社区惯例

### v1 核心抽象（关键决策）

为 v2 留扩展位，**v1 必须把抓取层抽成 trait**：

```rust
trait FetchAdapter {
    async fn fetch(&self, source: &Source) -> Result<Vec<Entry>>;
}

// v1 仅实现：
struct RssAtomAdapter;       // 用 reqwest + feed-rs
// v2 时新增：
struct RsshubAdapter;        // 上层调度器与 UI 不变
```

**Entry 模型保持"标题 + 内容 + 时间 + 链接"四要素**，不要混入 RSS 特有字段（多值 `<category>`、`<enclosure>` 等），扩展成本最低。

### v1 推荐表 schema

```sql
CREATE TABLE subscription_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feed_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  etag TEXT,
  last_modified TEXT,
  last_fetched_at INTEGER,
  consecutive_failure_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',  -- ok / unhealthy / disabled
  added_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE feed_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES subscription_sources(id) ON DELETE CASCADE,
  guid TEXT NOT NULL,           -- RSS guid 或 Atom id
  title TEXT NOT NULL DEFAULT '',
  content_md TEXT NOT NULL DEFAULT '',
  link TEXT,
  published_at INTEGER,
  fetched_at INTEGER NOT NULL DEFAULT (unixepoch()),
  read_at INTEGER,              -- NULL = 未读，set 后 = 已读
  UNIQUE(source_id, guid)       -- 同源同 guid 去重
);
```

---

## 关键链接

- [feed-rs](https://github.com/feed-rs/feed-rs) · [docs.rs](https://docs.rs/feed-rs)
- [reqwest](https://github.com/seanmonstar/reqwest)
- [RFC 9110 条件请求](https://datatracker.ietf.org/doc/html/rfc9110)
- [NetNewsWire AvoidFeedParsing](https://github.com/Ranchero-Software/NetNewsWire/blob/main/Technotes/AvoidFeedParsing.markdown)
- [RSSHub](https://github.com/DIYgod/RSSHub) · [RSS-Bridge](https://github.com/RSS-Bridge/rss-bridge)

## 调研受限说明

- Reeder 闭源、Readwise Reader 私有 API，它们的具体调度策略未直接验证，相关表述基于公开博客与社区讨论
- `Grok 联网搜索` 与 WebSearch 当日服务异常，部分细节降级为 GitHub README 二手信息
- 上述局限若进 plan 时仍要展开，建议追加一轮针对性查询
