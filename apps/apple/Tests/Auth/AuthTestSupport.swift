import Foundation

actor MockNativeAuthTransport: NativeAuthTransport {
    private var responses: [String: [NativeAuthHTTPResponse]] = [:]
    private var counts: [String: Int] = [:]
    private var authorizationValues: [String] = []
    private var blockNextPaths: Set<String> = []
    private var blockedContinuations: [String: [CheckedContinuation<Void, Never>]] = [:]
    private var requestContinuations: [String: [CheckedContinuation<Void, Never>]] = [:]

    func enqueue(path: String, _ response: NativeAuthHTTPResponse) {
        responses[path, default: []].append(response)
    }

    func blockNextResponse(path: String) { blockNextPaths.insert(path) }

    func waitUntilRequested(path: String, atLeast target: Int = 1) async {
        while counts[path, default: 0] < target {
            await withCheckedContinuation { requestContinuations[path, default: []].append($0) }
        }
    }

    func releaseBlockedResponse(path: String) {
        let continuations = blockedContinuations.removeValue(forKey: path) ?? []
        continuations.forEach { $0.resume() }
    }

    func send(_ request: URLRequest) async throws -> NativeAuthHTTPResponse {
        let path = request.url?.path ?? ""
        counts[path, default: 0] += 1
        let requestWaiters = requestContinuations.removeValue(forKey: path) ?? []
        requestWaiters.forEach { $0.resume() }
        if let authorization = request.value(forHTTPHeaderField: "Authorization") { authorizationValues.append(authorization) }
        guard !responses[path, default: []].isEmpty else { throw URLError(.badServerResponse) }
        let response = responses[path]!.removeFirst()
        if blockNextPaths.remove(path) != nil {
            await withCheckedContinuation { blockedContinuations[path, default: []].append($0) }
        }
        return response
    }

    func count(_ path: String) -> Int { counts[path, default: 0] }
    func headers() -> [String] { authorizationValues }
}

actor BlockingCredentialStore: CredentialStore {
    private var value: Data?
    private var shouldBlockNextReplace = false
    private var blockedContinuation: CheckedContinuation<Void, Never>?
    private var releaseContinuation: CheckedContinuation<Void, Never>?

    init(value: Data? = nil) { self.value = value }

    func load() async throws -> Data? { value }
    func clear() async throws { value = nil }
    func blockNextReplace() { shouldBlockNextReplace = true }
    func waitUntilReplaceBlocked() async {
        if blockedContinuation != nil { return }
        await withCheckedContinuation { blockedContinuation = $0 }
    }
    func releaseReplace() {
        releaseContinuation?.resume()
        releaseContinuation = nil
    }
    func replace(_ data: Data) async throws {
        if shouldBlockNextReplace {
            shouldBlockNextReplace = false
            blockedContinuation?.resume()
            blockedContinuation = nil
            await withCheckedContinuation { releaseContinuation = $0 }
        }
        value = data
    }
}

enum AuthTestData {
    static let baseURL = URL(string: "https://mewmo.test")!
    static let now = Date(timeIntervalSince1970: 1_750_000_000)

    static func response(_ status: Int, _ body: String = "{}") -> NativeAuthHTTPResponse {
        NativeAuthHTTPResponse(data: Data(body.utf8), statusCode: status)
    }

    static var loginJSON: String {
        "{\"accessToken\":\"access-one\",\"refreshToken\":\"refresh-one\",\"expiresIn\":900,\"refreshExpiresIn\":2592000,\"sessionId\":\"session-one\",\"user\":{\"id\":\"user-one\",\"email\":\"one@example.com\",\"name\":\"One\"}}"
    }

    static var refreshJSON: String {
        "{\"accessToken\":\"access-two\",\"refreshToken\":\"refresh-two\",\"expiresIn\":900,\"refreshExpiresIn\":2592000,\"sessionId\":\"session-one\"}"
    }

    static var secondLoginJSON: String {
        "{\"accessToken\":\"access-three\",\"refreshToken\":\"refresh-three\",\"expiresIn\":900,\"refreshExpiresIn\":2592000,\"sessionId\":\"session-two\",\"user\":{\"id\":\"user-two\",\"email\":\"two@example.com\",\"name\":\"Two\"}}"
    }

    static func controller(transport: MockNativeAuthTransport, store: any CredentialStore, leeway: TimeInterval = 60) -> AuthSessionController {
        AuthSessionController(baseURL: baseURL, transport: transport, credentialStore: store, clock: { now }, refreshLeeway: leeway)
    }

    static func login(_ controller: AuthSessionController, transport: MockNativeAuthTransport) async throws {
        await transport.enqueue(path: "/api/auth/native/login", response(200, loginJSON))
        _ = try await controller.login(NativeLoginRequest(email: "one@example.com", password: "password"))
    }
}
