# Lessons: ZOO-92 Apple 图片缓存基础设施

This file captures raw observations from this task. Keep evidence and uncertainty visible; a later curation pass promotes durable guidance into `.trellis/spec/`.

## Observations

- XcodeGen + SPM：`packages:`（`from: 13.0.6`）+ 每个 target `dependencies: [{package: Nuke}]`。Nuke 13 用 `swift-tools-version:6.0`、支持 macOS 12+，可在 macOS 26.5 / Xcode 26.6 上解析构建（无 package plugin，`make test` 的 `-skipPackagePluginValidation` 足够）。
- Mewmo-Tests 把 `Sources/Data` + `Sources/Image` + `Tests/` 编译进 test bundle（同一模块），测试无需 `@testable import`；ZOO-91 已如此，ZOO-92 延续并加「可扩展清单」注释，Auth 后续追加一行即可。
- Nuke 13 API 要点（对照 13.0.6 源码）：
  - `ImagePipeline.Configuration.init(dataLoader:)`；`imageCache`/`dataCache`/`dataCachePolicy/.storeOriginalData`/`isTaskCoalescingEnabled`（默认开）。
  - `DataCache(path:)` 默认 `sizeLimit` = 150MB，**必须手动 `dataCache.sizeLimit = config.diskSizeLimit`**，否则 LRU 上限配置不生效（首批两个测试因此失败）。
  - async 加载用 `pipeline.imageTask(with:).response`（返回 `ImageResponse.cacheType` 记 memory/disk）；`pipeline.cache.cachedImage(for:caches:[.disk])` 做离线磁盘回退。
  - `containsData(for:)` 无 `caches:` 参数；判“磁盘有内容”用 `containsCachedImage(for:caches:[.disk])`。
  - `AnonymousCancellable` 是 internal，测试要实现自己的 `Cancellable`。
- URLCache validator 实测：**URLProtocol stub 伪造 HTTP 响应时，URLCache 只存储、不注入条件请求头（不发送 If-None-Match/If-Modified-Since），也无 304 复用**——纯 URLSession+URLProtocol+URLCache 复现（macOS 26.5）。因此 validator 测试改为：断言 DataLoader 接入的 URLCache 容量被保留 + “revalidation 无新字节(等价304)不破坏已有磁盘缓存”。不自定义第二套 validator 协议（PRD 约束）。
- mock transport 两条路：`DataLoading` 注入（测并发去重/取消/离线/容量，最干净）+ 携带 URLCache 的 `DataLoader`（测 validator 组合）。`MewmoImagePipeline` 通过 `dataLoader:` 参数注入；`enableDataCache=false` 时纯走 URLCache 语义。
- error 投影：`ImagePipeline.Error.dataLoadingFailed(URLError .notConnectedToInternet 等)` → `.offlineOrMiss`；`DataLoader.Error.statusCodeUnacceptable(code)` → `.invalidResponse(code)`；`cancelled`→`.cancelled`；`decodingFailed/decoderNotRegistered`→`.decodeFailed`。
- Swift 6 严格并发：测试 mock 类需 `@unchecked Sendable`（遵守 `DataLoading: Sendable`）；静态可变状态装进 `NSLock` 包裹的 box；actor 门控测试用 `await gate.open()`。

## ZOO-117（验收缺口修复）

- 驳回点 1（再次驳回后收敛）：条件请求必须走**真实 URLSession + 生产 DataLoader + 独立 URLCache + loopback HTTP 服务器**，不能手改头/用 stub 冒充。实测结果：
  - URLProtocol stub 路径（`sessionConfig.protocolClasses = [Mock ...]`）让 URLCache **只存不 revalidate**——不发 If-None-Match/If-Modified-Since，也无 304 复用（macOS 26.5，纯 URLSession 复现）。
  - **真实 loopback HTTP 服务器（POSIX socket，127.0.0.1 临时端口）则完全正常**：URLSession/URLCache 对第二次请求自动注入 `If-None-Match`/`If-Modified-Since`，服务器回 304（零 body），客户端复用第一次 body。所以判定在真实网络加载路径下系统会生效，问题只出在 URLProtocol 传输薄层。
  - 用 `MewmoImagePipeline`（`enableDataCache=false` + 不注入 loader → 生产 `DataLoader` + `pipeline.urlCache`）+ `.disableMemoryCacheReads` 请求：两次 `pipeline.imageTask(from).response` 走真实 revalidation。断言：`requestHeadersLog[1]` 带条件头、`fullResponseCount==1`（完整 body 只发一次）、`notModifiedCount>=1`、两次解码 `bitmapBytes` 位级一致。
  - 关键坑：`If-Modified-Since` 值由 URLCache 依据响应的 `Date`/`Last-Modified` 规范重算（weekday 会变！），**handler 必须按“头存在与否”判定 304**，不能 `==` 硬比日期字符串。HTTP 日期注意真实 weekday（2026-08-01 是周六）。
  - 不要断言 `container.data`（网络解码路径下常为 nil）；比解码后 RGBA 像素字节（`cgImage` 画进 1×1 bgra context）。
- 驳回点 2：pipeline 增加 `public let urlCache: URLCache` 持有生产 URLCache；`clearDisk()`/`removeAllCaches()` 同时 `urlCache.removeAllCachedResponses()`。测试用 `storeCachedResponse` seed URLCache 再断言被清空——比 URLProtocol+网络喂 URLCache 更稳（URLProtocol serve URLCache 的生产 DataLoader 组合在 `URLSessionConfiguration.default` 下不拦截 https，会真联网报 TLS -1200；避免）。
- 驳回点 3：`DataCache(path:)` 创建失败不再 `try?`，显式抛 `ImageCacheSetupError.dataCacheInitializationFailed(path:message:)`（新的 Sendable/Equatable public enum）。失败路径测试：在 dataCache 目录路径放一个普通文件，令 `FileManager.createDirectory` 失败 → 断言抛该分类 error。
- `ImageCacheSetupError` 关联值存 `String`（path/message）而非 `any Error`，保证 `Sendable`/`Equatable`，便于测试 `guard case` 匹配。
- LoopbackHTTPServer 两个测试助手防 flaky 点：`stop()` 必须**幂等**——`defer server.stop()` 与 `deinit` 各调一次，重复 `close` 同一 fd 在描述符被复用时会误关无关资源；应在锁内用 `stopped` 标志保证只首次关闭。`writeResponse` 要**循环写直到全部字节写完**（`write` 对长 body 可能短写/部分写），不能假设一次写完。
- 注意：URLCache 用 sqlite 备份磁盘缓存时，removeItem 整个临时目录会打印 `BUG IN CLIENT OF libsqlite3` 日志——测试绿、非失败；如要根除可在 tearDown 前让 pipeline/URLCache 出作用域。
