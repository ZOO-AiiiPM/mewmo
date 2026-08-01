import Foundation
import Nuke
import XCTest

/// 配置默认值、错误投影与「原始 URL 作为缓存键」语义（PRD Acceptance 6、7）。
final class ImagePipelineConfigTests: XCTestCase {
    private var directory: URL!

    override func setUpWithError() throws {
        directory = try ImageTestData.makeTemporaryDirectory(name: "mewmo-img-cfg")
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: directory)
    }

    /// 默认配置：容量魔法值集中（memory 取 15% 物理内存在合理区间；disk/URLCache 有固定上限）。
    func testDefaultCapacityValuesAreCentralizedAndSanityChecked() {
        let config = ImagePipelineConfig()
        XCTAssertGreaterThan(config.memoryCostLimit, 0)
        XCTAssertEqual(config.diskSizeLimit, 150 * 1024 * 1024)
        XCTAssertEqual(config.urlCacheDiskCapacity, 150 * 1024 * 1024)
        XCTAssertEqual(config.urlCacheMemoryCapacity, 0)
        XCTAssertTrue(config.enableDataCache)
    }

    /// 不同来源 URL 的缓存键彼此独立：同一 pipeline 下两个 URL 各自缓存、互不污染。
    func testCacheKeyIsPerOriginalURL() async throws {
        let loader = MockImageDataLoader()
        let pipeline = try MewmoImagePipeline(
            config: ImagePipelineConfig(), cacheDirectory: directory, dataLoader: loader
        )
        // 七牛来源 URL 与原站 URL 都要保持原值作为键。
        let qiniu = ImageTestData.url("https://qiniu.example.com/note/a.jpg")
        let origin = ImageTestData.url("https://origin.example.com/feed/b.jpg")

        _ = try await pipeline.load(from: qiniu)
        _ = try await pipeline.load(from: origin)
        pipeline.dataCache?.flush()

        let qiniuRequest = ImageRequest(url: qiniu)
        let originRequest = ImageRequest(url: origin)

        // 两个 URL 都在缓存里，且加载各自 URL 不会命中对方的键。
        XCTAssertNotNil(pipeline.pipeline.cache.cachedImage(for: qiniuRequest, caches: [.memory]))
        XCTAssertNotNil(pipeline.pipeline.cache.cachedImage(for: originRequest, caches: [.memory]))
        // 磁盘缓存键同样按原 URL 区分（不同 URL 落到不同文件）。
        XCTAssertTrue(pipeline.pipeline.cache.containsCachedImage(for: qiniuRequest, caches: [.disk]))
        XCTAssertTrue(pipeline.pipeline.cache.containsCachedImage(for: originRequest, caches: [.disk]))
    }

    /// cancellation 与 pipelineInvalidated/empty 等错误投影到业务层四类错误。
    func testErrorProjectionCoversDistinctCases() {
        XCTAssertEqual(ImageLoadError.project(.cancelled), .cancelled)
        XCTAssertEqual(ImageLoadError.project(.dataMissingInCache), .offlineOrMiss)
        XCTAssertEqual(ImageLoadError.project(.dataIsEmpty), .other("empty data"))
        XCTAssertEqual(
            ImageLoadError.project(.dataLoadingFailed(error: URLError(.notConnectedToInternet))),
            .offlineOrMiss
        )
        XCTAssertEqual(
            ImageLoadError.project(.dataLoadingFailed(error: DataLoader.Error.statusCodeUnacceptable(503))),
            .invalidResponse(statusCode: 503)
        )
        guard case .decodeFailed = ImageLoadError.project(.decodingFailed(
            decoder: AnyDecoderStub(),
            context: ImageDecodingContext(
                request: ImageRequest(url: ImageTestData.url("https://example.com/x.jpg")),
                data: Data(),
                cacheType: .disk
            ),
            error: NSError(domain: "d", code: 0)
        )) else {
            XCTFail("解码失败应投影为 .decodeFailed")
            return
        }
    }
}

private struct AnyDecoderStub: ImageDecoding {
    func decode(_ data: Data) throws -> ImageContainer {
        throw ImageDecodingError.unknown
    }
}
