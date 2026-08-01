import Foundation
import Nuke
import XCTest

/// 并发去重与取消隔离（PRD Acceptance 1-2）。
final class ImageLoadConcurrencyTests: XCTestCase {
    private var directory: URL!

    override func setUpWithError() throws {
        directory = try ImageTestData.makeTemporaryDirectory(name: "mewmo-img-cc")
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: directory)
    }

    /// 同 URL 并发加载只触发一次底层下载，两个调用方均收到相同结果。
    func testConcurrentLoadsSameURL_TriggerSingleDownload() async throws {
        let loader = MockImageDataLoader()
        let pipeline = try MewmoImagePipeline(
            config: ImagePipelineConfig(), cacheDirectory: directory, dataLoader: loader
        )
        let url = ImageTestData.url("https://qiniu.example.com/note/1.jpg")

        async let a = pipeline.load(from: url)
        async let b = pipeline.load(from: url)
        let (ra, rb) = try await (a, b)

        XCTAssertEqual(loader.invocationCount, 1, "同 URL 并发应共享一次底层下载")
        XCTAssertNotNil(ra.image)
        XCTAssertNotNil(rb.image)
    }

    /// 单个调用方取消不影响共享请求的另一调用方。
    func testCancellingOneCaller_DoesNotCancelSharedRequest() async throws {
        // 门控 loader：首个请求阻塞直到被放行，让两个调用方进入同一 in-flight 下载。
        let gate = Gate()
        let loader = MockImageDataLoader()
        loader.loadHandler = { request in
            await gate.wait()
            return try ImageTestData.png()
        }

        let pipeline = try MewmoImagePipeline(
            config: ImagePipelineConfig(), cacheDirectory: directory, dataLoader: loader
        )
        let url = ImageTestData.url("https://qiniu.example.com/note/2.jpg")

        let callerA = Task { try await pipeline.load(from: url) }
        let callerB = Task { try await pipeline.load(from: url) }

        // 等待底层 loader 被调用（确认 A/B 已并入同一下载）。
        while loader.invocationCount < 1 { await Task.yield() }

        callerA.cancel()
        // 放行共享下载；B 应照常成功，A 抛 cancelled。
        await gate.open()

        do {
            _ = try await callerA.value
            XCTFail("被取消的调用方应抛出 cancelled")
        } catch let error as ImageLoadError {
            XCTAssertEqual(error, .cancelled)
        }

        let resultB = try await callerB.value
        XCTAssertNotNil(resultB.image)
        XCTAssertEqual(loader.invocationCount, 1)
    }
}

/// 门控原语：`wait()` 阻塞到 `open()`。
actor Gate {
    private var waiters: [CheckedContinuation<Void, Never>] = []
    private var opened = false
    // Actor 需在 `open()` 前保留对 waiters 的访问时序；这里用独立异步等待来保证。

    func wait() async {
        if opened { return }
        await withCheckedContinuation { waiters.append($0) }
    }

    func open() {
        opened = true
        waiters.forEach { $0.resume() }
        waiters.removeAll()
    }
}
