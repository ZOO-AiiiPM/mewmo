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
