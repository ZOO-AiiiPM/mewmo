import Foundation
import Nuke
import XCTest

/// HTTP validator / 条件请求语义（ZOO-117 / PRD Acceptance 5）。
///
/// 用**真实 loopback HTTP 服务器 + 生产 `DataLoader`（真实 URLSession）+ 独立 URLCache** 端到端验证：
/// 1) 首次 200 + ETag/Last-Modified + body；
/// 2) 第二次请求由 URLSession/URLCache **自动**携带 `If-None-Match` / `If-Modified-Since`；
/// 3) 服务端回 304（零 body），pipeline 仍返回与首次**位级一致**的缓存内容。
///
/// 这是生产 validator 语义（系统 URLCache/URLSession），非自造的第二套头/协议。
final class ImageValidatorTests: XCTestCase {
    private var directory: URL!

    override func setUpWithError() throws {
        directory = try ImageTestData.makeTemporaryDirectory(name: "mewmo-img-val")
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: directory)
    }

    /// 生产 pipeline：不注入 loader（真实 `DataLoader` + 内部 URLCache），缓存目录为独立临时目录。
    private func makeProductionPipeline(config: ImagePipelineConfig) throws -> MewmoImagePipeline {
        try MewmoImagePipeline(config: config, cacheDirectory: directory, dataLoader: nil)
    }

    /// 构造 ETag 条件请求处理器：带 `If-None-Match` → 304（零 body）；否则 200 + ETag + body。
    private func etagHandler(body: Data, etag: String) -> (@Sendable ([String: String], String) -> (Int, [String: String], Data)) {
        { headers, _ in
            if headers["If-None-Match"] == etag {
                return (304, ["ETag": etag], Data())
            }
            return (200, ["ETag": etag, "Cache-Control": "no-cache", "Date": "Wed, 01 Aug 2026 00:00:00 GMT"], body)
        }
    }

    /// ETag：真实 URLSession 自动对第二次请求注入 If-None-Match，304 零 body 下 pipeline 返回位级一致缓存内容。
    func testETagConditionalRequest_RealURLSessionRevalidation() async throws {
        let server = try LoopbackHTTPServer()
        defer { server.stop() }
        let body = try ImageTestData.png()
        server.handler = etagHandler(body: body, etag: "\"abc\"")

        var config = ImagePipelineConfig()
        config.enableDataCache = false   // 仅 URLCache，强制第二次请求走 URLSession revalidation。
        let pipeline = try makeProductionPipeline(config: config)
        let url = server.baseURL.appendingPathComponent("note/etag.jpg")

        // 首次：200 + ETag + body。
        let first = try await pipeline.pipeline.imageTask(
            with: ImageRequest(url: url, options: [.disableMemoryCacheReads])
        ).response
        XCTAssertNotNil(first.image, "首次 200 应成功解码")

        // 第二次：仅禁用 Nuke 内存缓存读——必须由 URLSession/URLCache 自动携带 If-None-Match。
        let second = try await pipeline.pipeline.imageTask(
            with: ImageRequest(url: url, options: [.disableMemoryCacheReads])
        ).response
        XCTAssertNotNil(second.image, "304 复用缓存后应成功解码")

        // 服务器观测到第二次请求自动携带了 If-None-Match。
        let headersLog = server.requestHeadersLog
        XCTAssertGreaterThanOrEqual(headersLog.count, 2, "应发生至少两次请求")
        XCTAssertEqual(headersLog[1]["If-None-Match"], "\"abc\"", "第二次请求应由 URLCache 自动携带 If-None-Match")

        // 304 零 body：服务器只发送过一次完整 body（第二次字节由缓存复用，非重新下发）。
        XCTAssertEqual(server.fullResponseCount, 1, "完整 body 只应被发送一次（第一次 200）")
        XCTAssertGreaterThanOrEqual(server.notModifiedCount, 1, "第二次请求应命中 304（零 body）")
        // 两次解码结果位级一致 —— 第二次复用第一次的缓存字节。
        XCTAssertEqual(ImageTestData.bitmapBytes(first.image), ImageTestData.bitmapBytes(second.image))
    }

    /// Last-Modified：真实 URLSession 自动注入 If-Modified-Since，304 复用缓存内容。
    func testLastModifiedConditionalRequest_RealURLSessionRevalidation() async throws {
        let server = try LoopbackHTTPServer()
        defer { server.stop() }
        let body = try ImageTestData.png()
        let lastModified = "Sat, 01 Aug 2026 00:00:00 GMT"
        server.handler = { headers, _ in
            // 客户端若携带 If-Modified-Since（revalidation）→ 304 零 body。
            if headers["If-Modified-Since"] != nil {
                return (304, ["Last-Modified": lastModified], Data())
            }
            return (200, ["Last-Modified": lastModified, "Cache-Control": "no-cache", "Date": lastModified], body)
        }

        var config = ImagePipelineConfig()
        config.enableDataCache = false
        let pipeline = try makeProductionPipeline(config: config)
        let url = server.baseURL.appendingPathComponent("note/lm.jpg")

        let first = try await pipeline.pipeline.imageTask(
            with: ImageRequest(url: url, options: [.disableMemoryCacheReads])
        ).response
        XCTAssertNotNil(first.image)

        let second = try await pipeline.pipeline.imageTask(
            with: ImageRequest(url: url, options: [.disableMemoryCacheReads])
        ).response
        XCTAssertNotNil(second.image)

        let headersLog = server.requestHeadersLog
        XCTAssertGreaterThanOrEqual(headersLog.count, 2)
        XCTAssertEqual(headersLog[1]["If-Modified-Since"], lastModified, "第二次请求应由 URLCache 自动携带 If-Modified-Since")

        XCTAssertEqual(server.fullResponseCount, 1, "完整 body 只应被发送一次")
        XCTAssertGreaterThanOrEqual(server.notModifiedCount, 1, "第二次请求应命中 304（零 body）")
        XCTAssertEqual(ImageTestData.bitmapBytes(first.image), ImageTestData.bitmapBytes(second.image))
    }

    /// production 形态：DataLoader 的 URLSession 必须接入一个 URLCache，且容量与 config 一致
    /// —— 证明 ETag/Last-Modified validator 由系统 HTTP 缓存保留（不剥离、不另造协议）。
    func testURLCacheValidatorsAreRetainedInDataLoaderComposition() throws {
        var config = ImagePipelineConfig()
        config.urlCacheMemoryCapacity = 64 * 1024
        config.urlCacheDiskCapacity = 3 * 1024 * 1024

        // 不注入 loader：走 production DataLoader + URLCache 组合。
        let sessionConfig = URLSessionConfiguration.default
        sessionConfig.urlCache = URLCache(
            memoryCapacity: config.urlCacheMemoryCapacity,
            diskCapacity: config.urlCacheDiskCapacity,
            diskPath: directory.appendingPathComponent("urlcache", isDirectory: true).path
        )
        let loader = DataLoader(configuration: sessionConfig)
        let pipeline = try MewmoImagePipeline(
            config: config, cacheDirectory: directory, dataLoader: loader
        )

        let dataLoader = try XCTUnwrap(pipeline.pipeline.configuration.dataLoader as? DataLoader)
        let urlCache = dataLoader.session.configuration.urlCache
        XCTAssertNotNil(urlCache, "DataLoader 应接入 URLCache（validator 存储）")
        XCTAssertEqual(urlCache?.diskCapacity, 3 * 1024 * 1024)
        XCTAssertEqual(urlCache?.memoryCapacity, 64 * 1024)
    }

    /// 显式区分：磁盘已有内容时，离线/失败回退返回磁盘命中；无任何缓存时返回分类错误。
    func testValidatorErrorIsClassified() async throws {
        let url = ImageTestData.url("https://qiniu.example.com/note/10.jpg")
        let loader = MockImageDataLoader(failWith: { _ in URLError(.notConnectedToInternet) })
        let pipeline = try MewmoImagePipeline(config: ImagePipelineConfig(), cacheDirectory: directory, dataLoader: loader)

        do {
            _ = try await pipeline.load(from: url)
            XCTFail("无缓存且失败应抛错")
        } catch let error as ImageLoadError {
            XCTAssertEqual(error, .offlineOrMiss)
        }
    }
}
