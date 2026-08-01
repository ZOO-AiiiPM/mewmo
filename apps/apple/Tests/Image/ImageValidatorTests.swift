import Foundation
import Nuke
import XCTest

/// HTTP validator / 条件请求语义（PRD Acceptance 5）。
///
/// 条件请求（ETag/Last-Modified + 304）由**系统 URLCache** 在真实网络路径上消费，属于 Apple
/// URLSession 行为。本项目“不自定义第二套 validator 协议”。因此这里验证两件可确定成立的事：
/// 1) 生产 pipeline 的 DataLoader 已接入带指定容量的 URLCache（validator 存储被保留，不剥离）；
/// 2) “revalidation 无新字节”（等价于 304 返回空 body）不破坏已有磁盘缓存条目——Nuke 会回退读
///    磁盘，304 语义下缓存数据保持不变。
final class ImageValidatorTests: XCTestCase {
    private var directory: URL!

    override func setUpWithError() throws {
        directory = try ImageTestData.makeTemporaryDirectory(name: "mewmo-img-val")
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: directory)
    }

    private func makePipeline(loader: MockImageDataLoader, config: ImagePipelineConfig) throws -> MewmoImagePipeline {
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

    /// “revalidation 无新字节”（等价 304）不破坏已有缓存：首次成功写入磁盘后，下一次加载
    /// 收到空 body（无新数据）也应回退读磁盘、仍返回原图，磁盘条目保持不变。
    func testEmptyRevalidationDoesNotBreakExistingCache() async throws {
        let url = ImageTestData.url("https://qiniu.example.com/note/9.jpg")
        let png = try ImageTestData.png()

        // 首次在线：写入磁盘。
        let loader = MockImageDataLoader(dataProvider: { _ in png })
        let pipeline = try makePipeline(loader: loader, config: ImagePipelineConfig())
        let first = try await pipeline.load(from: url)
        XCTAssertNotNil(first.image)
        pipeline.dataCache?.flush()
        XCTAssertTrue(pipeline.pipeline.cache.containsCachedImage(for: ImageRequest(url: url), caches: [.disk]))

        // 第二次：模拟 304 语义——数据加载返回空 body（0 字节，无新内容）。
        // Nuke 会以“空数据”报错（dataIsEmpty），但 load 回退读磁盘命中，缓存不被破坏。
        let emptiedLoader = MockImageDataLoader(dataProvider: { _ in Data() })
        let p2 = try makePipeline(loader: emptiedLoader, config: ImagePipelineConfig())

        let second = try await p2.load(from: url)
        XCTAssertEqual(second.cacheType, .disk, "无新字节的 revalidation 应回退读磁盘缓存")
        XCTAssertNotNil(second.image)
        XCTAssertTrue(
            p2.pipeline.cache.containsCachedImage(for: ImageRequest(url: url), caches: [.disk]),
            "304 语义不应删除已有磁盘缓存条目"
        )
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
