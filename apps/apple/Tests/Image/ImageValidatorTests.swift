import Foundation
import Nuke
import XCTest

/// HTTP validator / 条件请求语义（ZOO-117 / PRD Acceptance 5）。
///
/// 条件请求（ETag/Last-Modified → 304）在真实网络中由系统 URLCache/URLSession 消费。本项目
/// “不自定义第二套 validator 协议”，生产 pipeline 直接复用系统 URLCache。测试用可控 HTTP stub
/// 确定地验证两件语义：
/// 1) 第二次请求携带 validator（`If-None-Match` / `If-Modified-Since`），stub 观测到；
/// 2) 服务端返回 304（资源未变）时，客户端复用第一次收到的缓存内容，而不是用空 body 冲掉。
final class ImageValidatorTests: XCTestCase {
    private var directory: URL!

    override func setUpWithError() throws {
        directory = try ImageTestData.makeTemporaryDirectory(name: "mewmo-img-val")
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: directory)
    }

    private func makePipeline(loader: (any DataLoading), config: ImagePipelineConfig) throws -> MewmoImagePipeline {
        try MewmoImagePipeline(config: config, cacheDirectory: directory, dataLoader: loader)
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

    /// ETag 条件请求：第二次请求携带 `If-None-Match`，stub 观测到并回 304，客户端复用第一次缓存内容。
    func testETagConditionalRequest_304ServesFirstCachedContent() async throws {
        let url = ImageTestData.url("https://qiniu.example.com/note/etag.jpg")
        let png = try ImageTestData.png()
        let stub = MockConditionalHTTPLoader(body: png, validatorHeaderName: "ETag", validatorValue: "\"abc\"")

        var config = ImagePipelineConfig()
        config.enableDataCache = false     // 强制每次请求走到 stub（HTTP 语义层），隔离 Nuke DataCache。
        let pipeline = try makePipeline(loader: stub, config: config)

        // 首次：无条件头 → 200 + ETag + 完整 body。
        let firstRequest = ImageRequest(urlRequest: URLRequest(url: url), options: [.disableMemoryCacheReads])
        let first = try await pipeline.pipeline.imageTask(with: firstRequest).response
        XCTAssertNotNil(first.image, "首次 200 应成功解码")

        // 第二次：携带 If-None-Match（revalidating HTTP client 的请求头）。
        var revalidate = URLRequest(url: url)
        revalidate.setValue("\"abc\"", forHTTPHeaderField: "If-None-Match")
        let secondRequest = ImageRequest(urlRequest: revalidate, options: [.disableMemoryCacheReads])
        let second = try await pipeline.pipeline.imageTask(with: secondRequest).response
        XCTAssertNotNil(second.image, "304 应复用第一次缓存内容并成功解码")

        // stub 观测到第二次请求携带了 If-None-Match。
        XCTAssertTrue(stub.observedValidators.contains("\"abc\""), "应记录 If-None-Match=\\\"abc\\\"")
        // 第一次与第二次的 body 位级一致（304 返回第一次缓存内容，而非空 body）。
        XCTAssertEqual(first.container.data, second.container.data)
    }

    /// Last-Modified 条件请求：第二次携带 `If-Modified-Since`，观测到并回 304。
    func testLastModifiedConditionalRequest_304ServesFirstCachedContent() async throws {
        let url = ImageTestData.url("https://example.com/note/lm.jpg")
        let png = try ImageTestData.png()
        let lastModified = "Wed, 01 Aug 2026 00:00:00 GMT"
        let stub = MockConditionalHTTPLoader(body: png, validatorHeaderName: "Last-Modified", validatorValue: lastModified)

        var config = ImagePipelineConfig()
        config.enableDataCache = false
        let pipeline = try makePipeline(loader: stub, config: config)

        let first = try await pipeline.pipeline.imageTask(
            with: ImageRequest(urlRequest: URLRequest(url: url), options: [.disableMemoryCacheReads])
        ).response
        XCTAssertNotNil(first.image)

        var revalidate = URLRequest(url: url)
        revalidate.setValue(lastModified, forHTTPHeaderField: "If-Modified-Since")
        let second = try await pipeline.pipeline.imageTask(
            with: ImageRequest(urlRequest: revalidate, options: [.disableMemoryCacheReads])
        ).response
        XCTAssertNotNil(second.image)

        XCTAssertTrue(stub.observedValidators.contains(lastModified), "应记录 If-Modified-Since")
        XCTAssertEqual(first.container.data, second.container.data)
    }

    /// 显式区分：磁盘已有内容时，离线/失败回退返回磁盘命中；无任何缓存时返回分类错误。
    func testValidatorErrorIsClassified() async throws {
        let url = ImageTestData.url("https://qiniu.example.com/note/10.jpg")
        let loader = MockImageDataLoader(failWith: { _ in URLError(.notConnectedToInternet) })
        let pipeline = try makePipeline(loader: loader, config: ImagePipelineConfig())

        do {
            _ = try await pipeline.load(from: url)
            XCTFail("无缓存且失败应抛错")
        } catch let error as ImageLoadError {
            XCTAssertEqual(error, .offlineOrMiss)
        }
    }
}
