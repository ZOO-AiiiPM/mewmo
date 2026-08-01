# Design

## Adopted Solution

使用 Nuke 13 core 的 `ImagePipeline`，不自行实现 downloader、request coalescing、decoder、memory cache 或 disk LRU。项目代码只负责 composition、容量配置、缓存目录和面向后续业务层的错误/生命周期边界。

`ImagePipeline.Configuration` 同时配置 `ImageCache`、`DataCache` 与 `URLCache` backed data loader。`DataCache` 保存可复用原始图片数据并执行 LRU；URLCache 保留 HTTP validators 并处理条件请求。原始 URL 是唯一来源标识。

## Ownership

- `apps/apple/Sources/Image/`: pipeline factory/configuration、cache lifecycle、错误投影。
- `apps/apple/Tests/Image/`: mock transport、coalescing/cancellation、disk reopen、validators、capacity tests。
- `apps/apple/project.yml`: Nuke package 与 test source 接线，并把共享 test target 调整为后续 `Sources/Auth` 可直接接入的可扩展结构；不得手改生成的 xcodeproj。
- `.trellis/tasks/08-01-zoo-92-apple-image-cache/lesson.md`: 只追加本轮原始经验。

## Concurrency And Storage

共享 pipeline 由 composition root 持有。加载接口使用 async/await 和 Nuke task cancellation；不另建重复的 in-flight dictionary。磁盘缓存位于可注入目录，production 默认系统 caches directory，测试使用独立临时目录。

## Failure Boundary

网络失败不得删除已有 disk entry。解码失败、非 HTTP 成功响应、离线 miss 和 cancellation 必须可区分。清理缓存是显式用户/生命周期动作，不与普通加载失败耦合。

## Dependency Decision

- Nuke 13.0.6：采用；功能覆盖完整、2026 年仍活跃、Swift 6/Xcode 26 兼容。
- Kingfisher 8.11.0：成熟但包含更宽 UI/processor surface，本 Issue 只需 lean pipeline core。
- SDWebImageSwiftUI：偏 UI 绑定，不适合当前“基础设施先行、暂不上 UI”的边界。
