import Foundation
import Nuke
import XCTest

// MARK: - Mock DataLoading

/// mock transport（ZOO-92）：不访问公网，可追踪调用次数、按 URL 返回数据或抛错、可取消。
///
/// Nuke 的 `ImagePipeline` 通过注入的 `any DataLoading` 拉到原始数据，之后内存/磁盘缓存、
/// 解码、coalescing 全部照常工作——因此用它测并发去重、取消隔离与离线回退。
/// `@unchecked Sendable`：内部用锁保护可变状态，遵守 `DataLoading: Sendable`。
final class MockImageDataLoader: DataLoading, @unchecked Sendable {
    private let lock = NSLock()
    private var _invocationCount = 0
    /// 每次 `loadData` 递增；供并发去重断言“底层只下载一次”。
    var invocationCount: Int {
        lock.lock(); defer { lock.unlock() }
        return _invocationCount
    }

    /// 按 URL 返回数据；为 `nil` 时按 `failWith` 抛错。默认发一个合法 PNG。
    var dataProvider: (@Sendable (URLRequest) throws -> Data)?
    /// 网络失败时抛出的错误（模拟 offline / 非 2xx / 其他）。
    var failWith: (@Sendable (URLRequest) -> any Error)?
    /// 异步形态的加载处理（用于“门控”类测试：先阻塞、再放行，检验并发去重/取消隔离）。
    var loadHandler: (@Sendable (URLRequest) async throws -> Data)?

    init(
        dataProvider: (@Sendable (URLRequest) throws -> Data)? = nil,
        failWith: (@Sendable (URLRequest) -> any Error)? = nil
    ) {
        self.dataProvider = dataProvider ?? { _ in try ImageTestData.png() }
        self.failWith = failWith
    }

    func loadData(
        with request: URLRequest,
        didReceiveData: @escaping @Sendable (Data, URLResponse) -> Void,
        completion: @escaping @Sendable ((any Error)?) -> Void
    ) -> any Cancellable {
        lock.lock(); _invocationCount += 1; lock.unlock()

        let task = Task {
            do {
                if let error = failWith?(request) {
                    completion(error)
                    return
                }
                let data: Data
                if let handler = loadHandler {
                    data = try await handler(request)
                } else if let provider = dataProvider {
                    data = try provider(request)
                } else {
                    completion(NSError(domain: "MockImageDataLoader", code: -1))
                    return
                }
                didReceiveData(data, ImageTestData.httpResponse(for: request))
                completion(nil)
            } catch is CancellationError {
                completion(CancellationError())
            } catch {
                completion(error)
            }
        }
        return MockCancellable { task.cancel() }
    }
}

/// 简易 `Cancellable`（Nuke 的 `AnonymousCancellable` 是 internal，测试模块无法直接使用）。
private struct MockCancellable: Cancellable, @unchecked Sendable {
    let onCancel: () -> Void
    func cancel() { onCancel() }
}

// MARK: - Mock URLProtocol（validator / ETag / 304 测试）

/// 测试用 `URLProtocol`：用内存响应当 HTTP 响应，供 URLCache 走真实的条件请求路径。
final class MockURLProtocol: URLProtocol, @unchecked Sendable {
    /// 处理器：入参请求，出参 mock 响应；返回 `nil` 表示找不到被模拟的资源。
    static var handler: (@Sendable (URLRequest) -> (HTTPURLResponse, Data)?)? {
        get { store.withLock { $0.handler } }
        set { store.withLock { $0.handler = newValue } }
    }
    /// 每次请求记录（用于断言条件请求头）。
    static var requestLog: [URLRequest] {
        store.withLock { $0.log }
    }

    private static let store = LockedBox()

    private final class LockedBox: @unchecked Sendable {
        let lock = NSLock()
        var handler: (@Sendable (URLRequest) -> (HTTPURLResponse, Data)?)?
        var log: [URLRequest] = []
        func withLock<T>(_ body: (LockedBox) -> T) -> T {
            lock.lock(); defer { lock.unlock() }
            return body(self)
        }
    }

    static func reset() {
        store.withLock {
            $0.handler = nil
            $0.log.removeAll()
        }
    }

    static func register(in sessionConfig: URLSessionConfiguration) {
        sessionConfig.protocolClasses = [MockURLProtocol.self]
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.badServerResponse))
            return
        }
        Self.store.withLock { $0.log.append(request) }
        guard let (response, data) = handler(request) else {
            client?.urlProtocol(self, didFailWithError: URLError(.fileDoesNotExist))
            return
        }
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .allowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}

// MARK: - Test data helpers

enum ImageTestData {
    /// 1x1 透明 PNG 字节。Nuke 默认解码器可解码，作为测试图片数据。
    static func png() throws -> Data {
        // [length][type]... 最小合法 PNG（1x1）。字节来自固定数组。
        return Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=")!
    }

    /// 为 `URLRequest` 构造一个 200 HTTP 响应。
    static func httpResponse(for request: URLRequest, status: Int = 200, headers: [String: String] = [:]) -> HTTPURLResponse {
        HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
    }

    static func url(_ string: String) -> URL {
        URL(string: string)!
    }

    /// 生成独立临时目录，测试结束调用方删除。
    static func makeTemporaryDirectory(name: String) throws -> URL {
        let dir = FileManager.default
            .temporaryDirectory
            .appendingPathComponent("\(name)-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }
}
