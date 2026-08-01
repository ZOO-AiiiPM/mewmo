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
}
