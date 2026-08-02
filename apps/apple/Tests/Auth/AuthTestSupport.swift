import Foundation

actor MockNativeAuthTransport: NativeAuthTransport {
    private var responses: [String: [NativeAuthHTTPResponse]] = [:]
    private var counts: [String: Int] = [:]
    private var authorizationValues: [String] = []

    func enqueue(path: String, _ response: NativeAuthHTTPResponse) {
        responses[path, default: []].append(response)
    }

    func send(_ request: URLRequest) async throws -> NativeAuthHTTPResponse {
        let path = request.url?.path ?? ""
        counts[path, default: 0] += 1
        if let authorization = request.value(forHTTPHeaderField: "Authorization") { authorizationValues.append(authorization) }
        guard !responses[path, default: []].isEmpty else { throw URLError(.badServerResponse) }
        return responses[path]!.removeFirst()
    }

    func count(_ path: String) -> Int { counts[path, default: 0] }
    func headers() -> [String] { authorizationValues }
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

    static func controller(transport: MockNativeAuthTransport, store: InMemoryCredentialStore, leeway: TimeInterval = 60) -> AuthSessionController {
        AuthSessionController(baseURL: baseURL, transport: transport, credentialStore: store, clock: { now }, refreshLeeway: leeway)
    }

    static func login(_ controller: AuthSessionController, transport: MockNativeAuthTransport) async throws {
        await transport.enqueue(path: "/api/auth/native/login", response(200, loginJSON))
        _ = try await controller.login(NativeLoginRequest(email: "one@example.com", password: "password"))
    }
}
