# ZOO-92 Apple 图片缓存基础设施

## Goal

为 Apple 三端提供统一、可控、可离线读取的图片管线，服务笔记七牛图片与剪藏/Feed 原站图片，同时避免重复下载和无界磁盘增长。

## Confirmed Facts

- 工程为 XcodeGen，目标 macOS 14+/iOS 17+、Swift 6；ZOO-91 已建立共享 macOS unit-test target。
- SwiftData 只保存来源 URL，不保存图片二进制；图片缓存必须位于系统 caches directory。
- 笔记图片继续使用七牛来源 URL；剪藏与 Feed 图片继续使用原站 URL，缓存层不得永久改写来源语义。
- Nuke 13.0.6 支持目标平台，并原生提供 memory/disk cache、LRU、request coalescing、cancellation、async/await 和可注入 data loader。

## Requirements

1. 通过 Swift Package Manager 只引入 Nuke core，不在本 Issue 引入 NukeUI 或业务 SwiftUI 组件。
2. 在 `Sources/Image/` 提供项目级 pipeline composition：显式配置内存上限、磁盘上限、LRU DataCache、URLCache/HTTP validator 行为和 caches directory。
3. 缓存键基于原始来源 URL；不得把七牛 URL 或原站 URL重写回 SwiftData，也不得按页面复制图片文件。
4. 同 URL 并发请求复用 Nuke 的 task coalescing；调用方取消后不影响仍有订阅者的共享请求，最后订阅者取消时停止无用工作。
5. 在线成功后可从 memory/disk 读取；离线或网络失败时，已有磁盘缓存仍可返回，未命中返回可分类错误供后续 UI 稳定降级。
6. 使用 HTTP `ETag`/`Last-Modified` 的条件请求与系统 URLCache 语义，不自定义第二套 validator 协议。
7. 提供显式清空 memory、清空 disk、查询/执行 trim 的生命周期入口；容量默认值集中配置，不散落 magic numbers。
8. 测试使用 Nuke 可注入 data loader/URLProtocol stub 和临时磁盘目录，不访问公网、不依赖 UI。

## Acceptance Criteria

- [ ] 同 URL 并发加载只触发一次底层下载，两个调用方均收到相同结果。
- [ ] 单个调用方取消有回归测试；共享请求的其他调用方不被误取消。
- [ ] 首次在线写入后，重建 pipeline 并断网仍能从磁盘命中。
- [ ] memory 与 disk 容量可配置，超限时按 LRU 清理；清空 API 有测试证据。
- [ ] 条件请求保留并消费 `ETag`/`Last-Modified`，304 不破坏已有缓存。
- [ ] 七牛 URL 与原站 URL 的缓存键保持原值，SwiftData/model 不被图片缓存反向改写。
- [ ] 错误区分 cancelled、offline/cache miss、invalid response/decode，供后续 UI 回退。
- [ ] `make -C apps/apple test`、`make -C apps/apple verify` 与 `git diff --check` 通过。

## Out of Scope

- 业务页面、SwiftUI 图片 View、placeholder 视觉、上传、编辑和全库预下载。
- 把图片二进制写进 SwiftData，或更改服务端/七牛/原站 URL。
- ZOO-96/97 的页面接入与预取策略。
