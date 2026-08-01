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

// MARK: - Loopback HTTP server（真实 URLSession / 条件请求测试）

/// 最小 loopback HTTP 服务器（127.0.0.1，临时端口），用于真实端到端条件请求测试。
///
/// 测试通过**生产 `DataLoader`（真实 URLSession）+ 独立 URLCache** 指向本服务器：
/// - 首次请求 → 200 + validator（ETag/Last-Modified）+ body；
/// - 第二次请求由 URLSession/URLCache **自动**携带 `If-None-Match` / `If-Modified-Since`，
///   本服务器据此返回 304（零 body），URLSession 侧复用第一次缓存内容。
///
/// 用 POSIX socket 实现，绑定 127.0.0.1 的临时端口，避免占用固定端口/触碰公网。
/// `@unchecked Sendable`：可变状态（handler/log/stopped）以 `NSLock` 保护，fd 为值类型。
final class LoopbackHTTPServer: @unchecked Sendable {
    /// 每请求处理器：入参请求头 + 首行，出参 (状态码, 响应头, body)。线程安全（锁保护，写多读也为可重入 safe）。
    var handler: (@Sendable (_ headers: [String: String], _ requestLine: String) -> (Int, [String: String], Data))? {
        get { lock.lock(); defer { lock.unlock() }; return _handler }
        set { lock.lock(); _handler = newValue; lock.unlock() }
    }
    /// 已收到的请求头记录（按时间序），供断言“第二次请求携带条件头”。
    var requestHeadersLog: [[String: String]] {
        lock.lock(); defer { lock.unlock() }
        return log
    }
    /// 发送了完整 body 的 200 响应次数（供断言：revalidation 下只发送一次 body，第二次由缓存复用）。
    var fullResponseCount: Int {
        lock.lock(); defer { lock.unlock() }
        return _fullResponseCount
    }
    /// 返回 304（未改变）的响应次数。
    var notModifiedCount: Int {
        lock.lock(); defer { lock.unlock() }
        return _notModifiedCount
    }

    /// 服务器监听地址（测试连到它）。
    let baseURL: URL
    let port: UInt16

    private let fd: Int32
    private let lock = NSLock()
    private var _handler: (@Sendable (_ headers: [String: String], _ requestLine: String) -> (Int, [String: String], Data))?
    private var log: [[String: String]] = []
    private var _fullResponseCount = 0
    private var _notModifiedCount = 0
    private var stopped = false

    init() throws {
        let sockfd = socket(AF_INET, SOCK_STREAM, 0)
        guard sockfd >= 0 else { throw LoopbackServerError.socket }
        var reuse: Int32 = 1
        setsockopt(sockfd, SOL_SOCKET, SO_REUSEADDR, &reuse, socklen_t(MemoryLayout<Int32>.size))
        var addr = sockaddr_in()
        addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = 0 // ephemeral
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")
        let bindOK = withUnsafePointer(to: &addr) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                bind(sockfd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard bindOK == 0 else { close(sockfd); throw LoopbackServerError.bind }
        guard listen(sockfd, 8) == 0 else { close(sockfd); throw LoopbackServerError.listen }

        var bound = sockaddr_in()
        var len = socklen_t(MemoryLayout<sockaddr_in>.size)
        withUnsafeMutablePointer(to: &bound) { ptr in
            ptr.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                getsockname(sockfd, $0, &len)
            }
        }
        self.fd = sockfd
        self.port = UInt16(bigEndian: bound.sin_port)
        self.baseURL = URL(string: "http://127.0.0.1:\(self.port)")!
        acceptLoop()
    }

    deinit { stop() }

    /// 幂等停服：只在第一次调用时关闭 `fd`（`defer stop()` 与 `deinit` 会各调一次，
    /// 重复 `close` 同一描述符在描述符被复用时会误关无关资源并造成随机 flaky）。
    func stop() {
        let shouldClose: Bool
        lock.lock()
        if stopped {
            shouldClose = false
        } else {
            stopped = true
            shouldClose = true
        }
        lock.unlock()
        if shouldClose {
            close(fd)
        }
    }

    private func acceptLoop() {
        DispatchQueue.global(qos: .userInitiated).async { [weak self] in
            guard let self else { return }
            while true {
                let client = accept(self.fd, nil, nil)
                if client < 0 { return }
                self.handle(client: client)
            }
        }
    }

    private func handle(client: Int32) {
        var raw = ""
        var buf = [UInt8](repeating: 0, count: 4_096)
        // 读请求头（HttpURLSession 通常一次送来）。
        while !raw.contains("\r\n\r\n") {
            let n = read(client, &buf, 4_096)
            if n <= 0 { raw = ""; break }
            raw += String(decoding: buf[0..<n], as: UTF8.self)
        }
        defer { close(client) }

        let headerBlock = raw.components(separatedBy: "\r\n\r\n").first ?? ""
        let lines = headerBlock.components(separatedBy: "\r\n")
        let requestLine = lines.first ?? ""
        var headers: [String: String] = [:]
        for line in lines.dropFirst() where line.contains(":") {
            if let idx = line.firstIndex(of: ":") {
                let key = line[..<idx].trimmingCharacters(in: .whitespaces)
                let value = line[line.index(after: idx)...].trimmingCharacters(in: .whitespaces)
                headers[key] = value
            }
        }
        lock.lock(); log.append(headers); lock.unlock()

        guard let handler = self.handler else {
            writeResponse(client, status: 503, headers: [:], body: Data())
            return
        }
        let (status, respHeaders, body) = handler(headers, requestLine)
        lock.lock()
        if status == 304 {
            _notModifiedCount += 1
        } else {
            _fullResponseCount += 1   // 发送了完整 body（200 或其它非 304）
        }
        lock.unlock()
        writeResponse(client, status: status, headers: respHeaders, body: body)
    }

    private func writeResponse(_ client: Int32, status: Int, headers: [String: String], body: Data) {
        let reason = LoopbackHTTPServer.reason(for: status)
        var head = "HTTP/1.1 \(status) \(reason)\r\n"
        for (k, v) in headers { head += "\(k): \(v)\r\n" }
        head += "Content-Length: \(body.count)\r\nConnection: close\r\n\r\n"
        var out = Data(head.utf8)
        out.append(body)
        var total = 0
        while total < out.count {
            let written = out.withUnsafeBytes { raw -> Int in
                write(client, raw.baseAddress!.advanced(by: total), out.count - total)
            }
            if written <= 0 { break }   // 连接关闭或错误，无法继续
            total += written
        }
    }

    private static func reason(for status: Int) -> String {
        switch status {
        case 200: return "OK"
        case 304: return "Not Modified"
        case 404: return "Not Found"
        case 503: return "Service Unavailable"
        default: return "Status \(status)"
        }
    }
}

enum LoopbackServerError: Error {
    case socket, bind, listen
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

    /// 把 macOS `NSImage` 转成 RGBA 像素字节（用于比较两次解码结果位级是否一致）。
    static func bitmapBytes(_ image: PlatformImage) -> [UInt8]? {
        guard let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return nil }
        let width = cg.width
        let height = cg.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        guard let ctx = CGContext(
            data: &pixels,
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
        return pixels
    }
}
