import Foundation

public struct NativeAuthHTTPResponse: Sendable {
    public let data: Data
    public let statusCode: Int
}

public protocol NativeAuthTransport: Sendable {
    func send(_ request: URLRequest) async throws -> NativeAuthHTTPResponse
}

/// Production transport. Tests inject `NativeAuthTransport` rather than intercepting global URL loading.
public struct URLSessionNativeAuthTransport: NativeAuthTransport {
    private let session: URLSession

    public init(session: URLSession = .shared) {
        self.session = session
    }

    public func send(_ request: URLRequest) async throws -> NativeAuthHTTPResponse {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        return NativeAuthHTTPResponse(data: data, statusCode: http.statusCode)
    }
}

struct NativeAuthAPI: Sendable {
    let baseURL: URL
    let transport: any NativeAuthTransport
    private let encoder = JSONEncoder()
    private let decoder: JSONDecoder

    init(baseURL: URL, transport: any NativeAuthTransport) {
        self.baseURL = baseURL
        self.transport = transport
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.decoder = decoder
    }

    func login(_ input: NativeLoginRequest, now: Date) async throws -> StoredAuthSession {
        let response: LoginResponse = try await request(.login, method: "POST", body: input)
        return StoredAuthSession(
            version: StoredAuthSession.version,
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            sessionId: response.sessionId,
            user: response.user,
            accessExpiresAt: now.addingTimeInterval(TimeInterval(response.expiresIn)),
            refreshExpiresAt: now.addingTimeInterval(TimeInterval(response.refreshExpiresIn))
        )
    }

    func refresh(_ session: StoredAuthSession, now: Date) async throws -> StoredAuthSession {
        let response: RefreshResponse = try await request(.refresh, method: "POST", body: RefreshRequest(refreshToken: session.refreshToken))
        return StoredAuthSession(
            version: StoredAuthSession.version,
            accessToken: response.accessToken,
            refreshToken: response.refreshToken,
            sessionId: response.sessionId,
            user: session.user,
            accessExpiresAt: now.addingTimeInterval(TimeInterval(response.expiresIn)),
            refreshExpiresAt: now.addingTimeInterval(TimeInterval(response.refreshExpiresIn))
        )
    }

    func logout(_ session: StoredAuthSession) async throws {
        var request = try makeRequest(.logout, method: "POST", body: RefreshRequest(refreshToken: session.refreshToken))
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        _ = try await perform(request, endpoint: .logout, expected: [204])
    }

    func session(accessToken: String) async throws -> NativeSessionInfo {
        var request = try makeRequest(.session, method: "GET", body: Optional<Int>.none)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        let data = try await perform(request, endpoint: .session, expected: [200])
        return try decode(SessionResponse.self, from: data, endpoint: .session).session
    }

    private func request<Response: Decodable, Body: Encodable>(_ endpoint: NativeAuthEndpoint, method: String, body: Body) async throws -> Response {
        let request = try makeRequest(endpoint, method: method, body: body)
        let data = try await perform(request, endpoint: endpoint, expected: [200])
        return try decode(Response.self, from: data, endpoint: endpoint)
    }

    private func makeRequest<Body: Encodable>(_ endpoint: NativeAuthEndpoint, method: String, body: Body) throws -> URLRequest {
        let relative = endpoint.rawValue.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        var request = URLRequest(url: baseURL.appendingPathComponent(relative))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if method != "GET" {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(body)
        }
        return request
    }

    private func perform(_ request: URLRequest, endpoint: NativeAuthEndpoint, expected: Set<Int>) async throws -> Data {
        let response: NativeAuthHTTPResponse
        do {
            response = try await transport.send(request)
        } catch {
            throw NativeAuthError.transport(endpoint: endpoint)
        }
        guard expected.contains(response.statusCode) else {
            throw NativeAuthError.server(statusCode: response.statusCode, code: decodeErrorCode(response.data), endpoint: endpoint)
        }
        return response.data
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data, endpoint: NativeAuthEndpoint) throws -> T {
        do { return try decoder.decode(type, from: data) }
        catch { throw NativeAuthError.invalidResponse(endpoint: endpoint) }
    }

    private func decodeErrorCode(_ data: Data) -> NativeAuthErrorCode {
        (try? decoder.decode(ServerError.self, from: data))?.nativeCode ?? .unknown
    }
}

private struct LoginResponse: Codable { let accessToken: String; let refreshToken: String; let expiresIn: Int; let refreshExpiresIn: Int; let sessionId: String; let user: NativeAuthUser }
private struct RefreshResponse: Codable { let accessToken: String; let refreshToken: String; let expiresIn: Int; let refreshExpiresIn: Int; let sessionId: String }
private struct RefreshRequest: Codable { let refreshToken: String }
private struct SessionResponse: Codable { let session: NativeSessionInfo }
private struct ServerError: Codable {
    let code: String?
    var nativeCode: NativeAuthErrorCode { NativeAuthErrorCode(rawValue: code ?? "") ?? .unknown }
}
