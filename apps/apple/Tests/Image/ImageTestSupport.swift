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

// MARK: - 条件请求（ETag/Last-Modified）可控 HTTP stub

/// 可控 HTTP stub（`DataLoading` 形态）：用锁保护的服务端状态，按 HTTP 语义做条件请求。
///
/// 行为（RFC 7232 服务端侧）：
/// - 首次请求（无条件头）→ 200 + validator（默认 `ETag`）+ 完整 body；
/// - 携带匹配条件头的请求 → 304 语义：不重新下发资源内容，而是“复用第一次缓存内容”——
///   本 stub 把同样的 `body` 投递给调用方，且把观测到的条件头记入 `observed`。
///
/// 这样可确定地观察“第二次请求携带 validator”并验证“304 返回第一次缓存内容”，
/// 不依赖系统 URLCache 在自定义传输下的 revalidation 注入行为（该行为在本平台不可复现）。
final class MockConditionalHTTPLoader: DataLoading, @unchecked Sendable {
    private let lock = NSLock()
    private let body: Data
    private let validatorHeaderName: String   // "ETag"（默认）
    private let validatorValue: String
    private var _firstRequestSeen = false
    /// 记录各轮请求观测到的条件头（供断言）。
    var observedValidators: [String] {
        lock.lock(); defer { lock.unlock() }
        return _observedValidators
    }
    private var _observedValidators: [String] = []

    init(
        body: Data,
        validatorHeaderName: String = "ETag",
        validatorValue: String = "\"abc\""
    ) {
        self.body = body
        self.validatorHeaderName = validatorHeaderName
        self.validatorValue = validatorValue
    }

    /// 是否携带了与已记录 validator 匹配的条件头。
    private func carriesMatchingConditional(_ request: URLRequest) -> Bool {
        if validatorHeaderName == "ETag" {
            return request.value(forHTTPHeaderField: "If-None-Match") == validatorValue
        }
        return request.value(forHTTPHeaderField: "If-Modified-Since") == validatorValue
    }

    func loadData(
        with request: URLRequest,
        didReceiveData: @escaping @Sendable (Data, URLResponse) -> Void,
        completion: @escaping @Sendable ((any Error)?) -> Void
    ) -> any Cancellable {
        let matched: Bool
        lock.lock()
        if let conditional = request.value(forHTTPHeaderField: "If-None-Match")
            ?? request.value(forHTTPHeaderField: "If-Modified-Since") {
            _observedValidators.append(conditional)
        }
        matched = _firstRequestSeen && carriesMatchingConditional(request)
        _firstRequestSeen = true
        lock.unlock()

        let data = body
        let etag = validatorValue
        let headerName = validatorHeaderName
        Task {
            // 304 语义：资源未变，service 不重新下发新内容，客户端复用第一次收到的 body。
            let headers: [String: String] = {
                if headerName == "ETag" { return ["ETag": etag] }
                return ["Last-Modified": etag]
            }()
            let status = matched ? 304 : 200
            let response = ImageTestData.httpResponse(for: request, status: status, headers: headers)
            didReceiveData(data, response)
            completion(nil)
        }
        return MockCancellable {}
    }
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
