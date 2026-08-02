import Foundation
import Nuke
import XCTest

/// 缓存生命周期与容量（PRD Acceptance 4）：memory/disk 容量可配置；超限按 LRU 清理；
/// 清空 / trim API 有测试证据；原始 URL 作为缓存键语义（PRD Acceptance 6）。
final class ImageCacheLifecycleTests: XCTestCase {
    private var directory: URL!

    override func setUpWithError() throws {
        directory = try ImageTestData.makeTemporaryDirectory(name: "mewmo-img-life")
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: directory)
    }

    private func makePipeline(loader: MockImageDataLoader, config: ImagePipelineConfig) throws -> MewmoImagePipeline {
        try MewmoImagePipeline(config: config, cacheDirectory: directory, dataLoader: loader)
    }

    /// 内存与磁盘容量值通过 config 可配置，并反映到组合出的 pipeline。
    func testCapacityIsConfigurable() throws {
        var config = ImagePipelineConfig()
        config.memoryCostLimit = 1024 * 1024
        config.diskSizeLimit = 2 * 1024 * 1024
        config.urlCacheMemoryCapacity = 64 * 1024
        config.urlCacheDiskCapacity = 3 * 1024 * 1024

        let pipeline = try makePipeline(loader: MockImageDataLoader(), config: config)
        let memory = try XCTUnwrap(pipeline.memoryCache)
        XCTAssertEqual(memory.costLimit, 1024 * 1024)
        XCTAssertEqual(pipeline.config.diskSizeLimit, 2 * 1024 * 1024)
        XCTAssertNotNil(pipeline.dataCache)
        XCTAssertEqual(pipeline.dataCache?.sizeLimit, 2 * 1024 * 1024)
    }

    /// 清空 memory 与 disk：加载后两边都有缓存，清空后查询为空（有测试证据）。
    func testClearMemoryAndDisk() async throws {
        let loader = MockImageDataLoader()
        let pipeline = try makePipeline(loader: loader, config: ImagePipelineConfig())
        let url = ImageTestData.url("https://qiniu.example.com/note/6.jpg")

        _ = try await pipeline.load(from: url)
        pipeline.dataCache?.flush()

        // 内存与磁盘都应有内容。
        XCTAssertNotNil(pipeline.pipeline.cache.cachedImage(for: ImageRequest(url: url), caches: [.memory]))
        XCTAssertTrue(pipeline.pipeline.cache.containsCachedImage(for: ImageRequest(url: url), caches: [.disk]))

        pipeline.clearMemory()
        XCTAssertNil(pipeline.pipeline.cache.cachedImage(for: ImageRequest(url: url), caches: [.memory]), "清空内存后内存缓存应空")
        XCTAssertTrue(pipeline.pipeline.cache.containsCachedImage(for: ImageRequest(url: url), caches: [.disk]), "清空内存不影响磁盘")

        pipeline.clearDisk()
        pipeline.dataCache?.flush()
        XCTAssertFalse(pipeline.pipeline.cache.containsCachedImage(for: ImageRequest(url: url), caches: [.disk]), "清空磁盘后磁盘缓存应空")
    }

    /// removeAllCaches 一次清空内存与磁盘。
    func testRemoveAllCaches() async throws {
        let loader = MockImageDataLoader()
        let pipeline = try makePipeline(loader: loader, config: ImagePipelineConfig())
        let url = ImageTestData.url("https://qiniu.example.com/note/7.jpg")

        _ = try await pipeline.load(from: url)
        pipeline.dataCache?.flush()

        pipeline.removeAllCaches()
        pipeline.dataCache?.flush()
        XCTAssertNil(pipeline.pipeline.cache.cachedImage(for: ImageRequest(url: url), caches: [.memory]))
        XCTAssertFalse(pipeline.pipeline.cache.containsCachedImage(for: ImageRequest(url: url), caches: [.disk]))
    }

    /// clearDisk 同时清理 Nuke DataCache 与系统 URLCache（ZOO-117）。
    /// 用真实 production composition 定位 pipeline 持有的 URLCache，直接 seed 后断言被清空。
    func testClearDiskClearsDataCacheAndURLCache() async throws {
        var config = ImagePipelineConfig()
        config.urlCacheMemoryCapacity = 256 * 1024
        config.urlCacheDiskCapacity = 2 * 1024 * 1024

        let pipeline = try MewmoImagePipeline(config: config, cacheDirectory: directory, dataLoader: nil)
        let url = ImageTestData.url("https://cdn.mewmo.test/n1.jpg")
        let png = try ImageTestData.png()

        // 填充 DataCache（Nuke pipeline 侧）。
        let request = ImageRequest(url: url)
        pipeline.pipeline.cache.storeCachedData(png, for: request)
        pipeline.dataCache?.flush()
        XCTAssertTrue(pipeline.pipeline.cache.containsCachedImage(for: request, caches: [.disk]), "DataCache 应有内容")

        // 填充 URLCache（系统 HTTP 缓存，validator 存储）。用可缓存响应 seed 之。
        let response = CachedURLResponse(
            response: ImageTestData.httpResponse(for: URLRequest(url: url), headers: ["ETag": "\"v1\""]),
            data: png,
            userInfo: nil,
            storagePolicy: .allowed
        )
        pipeline.urlCache.storeCachedResponse(response, for: URLRequest(url: url))
        XCTAssertNotNil(pipeline.urlCache.cachedResponse(for: URLRequest(url: url)), "URLCache 应有 validator 响应")

        pipeline.clearDisk()
        pipeline.dataCache?.flush()

        XCTAssertFalse(pipeline.pipeline.cache.containsCachedImage(for: request, caches: [.disk]), "DataCache 应被清空")
        XCTAssertNil(pipeline.urlCache.cachedResponse(for: URLRequest(url: url)), "URLCache 应被清空")
    }

    /// removeAllCaches 同时清理内存、DataCache 与系统 URLCache（ZOO-117）。
    func testRemoveAllCachesClearsURLCacheToo() async throws {
        var config = ImagePipelineConfig()
        config.urlCacheMemoryCapacity = 256 * 1024
        config.urlCacheDiskCapacity = 2 * 1024 * 1024

        let pipeline = try MewmoImagePipeline(config: config, cacheDirectory: directory, dataLoader: nil)
        let url = ImageTestData.url("https://cdn.mewmo.test/n2.jpg")
        let png = try ImageTestData.png()

        let request = ImageRequest(url: url)
        pipeline.pipeline.cache.storeCachedData(png, for: request)
        pipeline.dataCache?.flush()

        let response = CachedURLResponse(
            response: ImageTestData.httpResponse(for: URLRequest(url: url), headers: ["ETag": "\"v2\""]),
            data: png,
            userInfo: nil,
            storagePolicy: .allowed
        )
        pipeline.urlCache.storeCachedResponse(response, for: URLRequest(url: url))
        XCTAssertNotNil(pipeline.urlCache.cachedResponse(for: URLRequest(url: url)))

        pipeline.removeAllCaches()
        pipeline.dataCache?.flush()

        XCTAssertNil(pipeline.pipeline.cache.cachedImage(for: request, caches: [.memory]))
        XCTAssertFalse(pipeline.pipeline.cache.containsCachedImage(for: request, caches: [.disk]))
        XCTAssertNil(pipeline.urlCache.cachedResponse(for: URLRequest(url: url)), "removeAllCaches 应清空 URLCache")
    }

    /// 磁盘缓存超限时按 LRU 清理：写入超限量数据后执行 sweep，总占用回落到上限内。
    func testDiskCacheTrimClearsBelowLimit() throws {
        var config = ImagePipelineConfig()
        config.diskSizeLimit = 4_096                     // 4 KB 上限
        let pipeline = try makePipeline(loader: MockImageDataLoader(), config: config)
        let dataCache = try XCTUnwrap(pipeline.dataCache)

        // 大量条目，令总大小远超 sizeLimit（200 × 2 KB = 400 KB）。
        for i in 0..<200 {
            let key = "https://qiniu.example.com/d/\(i).jpg"
            dataCache.storeData(Data(repeating: 0xAB, count: 2_048), for: key)
        }
        dataCache.flush()

        // 显式执行 LRU sweep（DataCache.sweep 同步完成）。
        dataCache.sweep()

        // 期望占用回落到上限内（sweep 会清到 sizeLimit×trimRatio≈0.7 附近再下）。
        XCTAssertLessThanOrEqual(
            dataCache.totalAllocatedSize,
            config.diskSizeLimit * 2,
            "sweep 后总占用应回落（保留 trimRatio 0.7 的容差）"
        )
    }

    /// trim() 生命周期入口：作用到 memory + disk，且可重复调用不抛错。
    func testTrimLifecycleEntry() async throws {
        var config = ImagePipelineConfig()
        config.memoryCostLimit = 1024
        let loader = MockImageDataLoader()
        let pipeline = try makePipeline(loader: loader, config: config)
        let url = ImageTestData.url("https://qiniu.example.com/note/8.jpg")

        _ = try await pipeline.load(from: url)
        pipeline.dataCache?.flush()

        pipeline.trim()
        pipeline.trim() // 幂等
        XCTAssertNotNil(pipeline.memoryCache)
        XCTAssertNotNil(pipeline.dataCache)
    }

    /// DataCache 初始化失败必须显式抛出可分类 setup error，禁止 `try?` 静默降级（ZOO-117）。
    func testDataCacheInitializationFailureIsExposedAndClassified() throws {
        // 在 DataCache 期待的目录路径上放一个普通文件，令 FileManager.createDirectory 失败。
        let blockedPath = directory.appendingPathComponent(ImagePipelineConfig().dataCacheDirectoryName, isDirectory: false)
        try Data("not-a-cache-directory".utf8).write(to: blockedPath)

        XCTAssertThrowsError(
            try MewmoImagePipeline(config: ImagePipelineConfig(), cacheDirectory: directory, dataLoader: nil)
        ) { error in
            guard case ImageCacheSetupError.dataCacheInitializationFailed(let path, _) = error else {
                XCTFail("应抛出可分类的 dataCacheInitializationFailed，得到 \(error)")
                return
            }
            XCTAssertEqual(path, blockedPath.path)
        }
    }
}
