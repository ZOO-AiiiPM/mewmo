# 微信公众号订阅方案对照

> 这份文档是 `/speckit-plan` 之前的**技术调研附录**，配合 `research-backend.md` 一起服务于 Q2（数据源类型）的最终决策。
> 调研日期：2026-05-22。事实基于 GitHub API 实数 + 项目 LICENSE 实证，未编造。

## 用户最终决策（2026-05-22）

**Path A**：vibe-coding 仅支持标准 RSS URL；公众号 / X / YouTube 等非标准源通过**用户自部署的第三方桥接服务**（如 we-mp-rss）输出 RSS URL 后接入。

vibe-coding 不内嵌、不打包、不下场爬腾讯——理由见下方"为什么不内嵌"段。

## 候选项目清单（按 stars 降序）

| 项目 | Stars | 最近 commit | License | 数据源 | 状态 |
|---|---|---|---|---|---|
| **DIYgod/RSSHub** | 44.1k | 2026-05-22 | **AGPL-3.0** | 不爬 mp.weixin，转发第三方镜像 (`freewechat.com`) | 活跃 |
| **cooderl/wewe-rss** | 9.4k | 2026-03-20 | MIT | 微信读书 API（需用户的微信读书 cookie） | 半活跃 ⚠️ |
| **rachelos/we-mp-rss** | 3.2k | 2026-05-18 | **MIT**（LICENSE 实证）| 公众号后台扫码（需用户自申请公众号） | 活跃 ⭐ 推荐 |
| hellodword/wechat-feeds | 976 | 2021-06-26 | 无 | "已停止服务" | **archived** ⚠️ |
| 其他（zlzchat / mprss / 个人玩具）| <300 | — | 无 license / 闭源 | — | 不可用 |

## 推荐：we-mp-rss

理由（按权重排序）：

1. **MIT license**——可以放心写进 vibe-coding 的推荐文档，不污染任何东西
2. **维护活跃**——2026-05-18 还在 push，issue 处理及时
3. **架构上最稳**——让用户**申请自己的公众号** + 用公众号后台 token 抓取，比 wewe-rss 依赖"个人微信读书 cookie" 风控压力小（自己的公众号被封 = 自己的责任，且账号创建成本远低于"被封禁的微信读书账号"）
4. **保活机制内置**——README 自带"多账号轮换"模块，承认必须靠多 token 对抗腾讯反爬，比裸爬方案更现实

## 备选：wewe-rss

如果用户没有自申请公众号的能力，wewe-rss 是退路。代价：
- 依赖个人微信读书账号（cookie 失效 = 服务挂）
- issue #463 起的风控反馈（2026-04 至今）显示账号失效已是常态
- 维护节奏放缓（2026-03-20 后无新 commit）

不直接推荐，但用户实际能选。

## 为什么不内嵌（即使是 MIT 协议）

技术上：
- we-mp-rss 是 **Python 3.13 + FastAPI + SQLite** 服务，不是一个 Rust crate
- Tauri 内嵌 Python runtime 跨平台打包是出名的坑（PyOxidizer / PyInstaller 都不完美），包大小 +150MB+
- 即使打包成功，还要做 sidecar 进程管理、崩溃重启、跨平台路径处理——工程量 2-3 周打底

法律上：
- RSSHub 是 AGPL-3.0，**协议传染**（即使内嵌一小段代码也会要求整个 vibe-coding 切到 AGPL，永久失去商业化和闭源版本的可能性）
- we-mp-rss / wewe-rss 虽然是 MIT 不传染，但内嵌后 vibe-coding 要承担"我打包了一个爬腾讯的工具"的法律责任

业界实证：
- Reeder / Feedly / Inoreader / Readwise Reader 等主流 RSS 阅读器**全员不做内嵌公众号订阅**
- 这种"集体缺席"不是因为没想到，是因为试过都撞墙——腾讯反爬不可控、封号责任无法承担

## Path A 的具体集成姿势

### vibe-coding 端（v1 已经做的事，无新增工作）

- 订阅源类型 = RSS 2.0 / Atom 1.0
- 用户在"添加订阅源" modal 里粘贴任意 RSS URL（不区分这个 URL 来自哪里）
- 抓取层用 `feed-rs` 解析，统一处理

### 用户端（一次性 setup）

1. 用户跑 we-mp-rss server（Docker / 本地 Python 都行）
2. 申请一个个人公众号（免费，腾讯有对个人开放）
3. 在 we-mp-rss 后台扫码登录公众号 + 添加要订阅的目标公众号
4. we-mp-rss 输出 RSS URL（形如 `http://localhost:8080/feed/<公众号id>`）
5. 把这个 URL 粘进 vibe-coding 订阅区——和粘贴一个普通博客 RSS URL 完全一样

### vibe-coding 文档需要做

- 订阅区"添加订阅源" modal 加一段折叠 onboarding：「想订阅公众号？跑 we-mp-rss / RSSHub 等桥接服务，把它输出的 RSS URL 粘进来」+ 一个外链到本文档或 we-mp-rss README

## 影响 spec / 后端的实际改动

| 维度 | 改动 |
|---|---|
| spec.md FR-003 | 从 [NEEDS CLARIFICATION] 收紧成"直接支持 RSS / Atom；非标准源（公众号 / X 等）通过用户自部署桥接服务接入" |
| spec.md 新增 FR | 加一条明确"vibe-coding 不内嵌爬虫 / 不打包桥接服务" |
| research-backend.md | 不需要改（Path A 完全在已有方案范围内）|
| 后端代码 | 无新增（仅 RSS/Atom feed-rs 即可，无需特殊处理）|
| 前端代码 | 添加订阅源 modal 加一段 onboarding 文案 |

## 关键链接

- [rachelos/we-mp-rss](https://github.com/rachelos/we-mp-rss) — 推荐
- [cooderl/wewe-rss](https://github.com/cooderl/wewe-rss) — 备选
- [DIYgod/RSSHub](https://github.com/DIYgod/RSSHub) — AGPL，仅参考不内嵌
- [GNU AGPL-3.0 全文](https://www.gnu.org/licenses/agpl-3.0.html) — 协议传染机制说明
