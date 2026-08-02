import Foundation

/// Owns the credential lifecycle. The actor coalesces all refreshes so a rotated refresh token is never raced locally.
public actor AuthSessionController {
    private let api: NativeAuthAPI
    private let credentialStore: any CredentialStore
    private let clock: @Sendable () -> Date
    private let refreshLeeway: TimeInterval
    private var session: StoredAuthSession?
    private var refreshTask: Task<StoredAuthSession, Error>?

    public init(baseURL: URL, transport: any NativeAuthTransport = URLSessionNativeAuthTransport(), credentialStore: any CredentialStore = SecurityCredentialStore(), clock: @escaping @Sendable () -> Date = Date.init, refreshLeeway: TimeInterval = 60) {
        self.api = NativeAuthAPI(baseURL: baseURL, transport: transport)
        self.credentialStore = credentialStore
        self.clock = clock
        self.refreshLeeway = refreshLeeway
    }

    public func restore() async throws -> AuthSessionSnapshot? {
        guard let data = try await credentialStore.load() else { return nil }
        guard let stored = try? JSONDecoder().decode(StoredAuthSession.self, from: data), stored.version == StoredAuthSession.version else {
            try? await credentialStore.clear()
            return nil
        }
        session = stored
        return stored.snapshot
    }

    @discardableResult
    public func login(_ input: NativeLoginRequest) async throws -> AuthSessionSnapshot {
        let stored = try await api.login(input, now: clock())
        try await persist(stored)
        return stored.snapshot
    }

    public func snapshot() -> AuthSessionSnapshot? { session?.snapshot }

    public func accessToken(forceRefresh: Bool = false) async throws -> String {
        let current = if let session { session } else { try await loadStored() }
        guard let current else { throw NativeAuthError.signedOut }
        if !forceRefresh, current.accessExpiresAt.timeIntervalSince(clock()) > refreshLeeway { return current.accessToken }
        return try await refresh(current).accessToken
    }

    public func fetchSession() async throws -> NativeSessionInfo {
        let token = try await accessToken()
        return try await api.session(accessToken: token)
    }

    /// Explicit logout always removes the local blob, including on offline/server failure.
    public func logout() async {
        let current = if let session { session } else { try? await loadStored() }
        if let current { _ = try? await api.logout(current) }
        session = nil
        refreshTask?.cancel()
        refreshTask = nil
        try? await credentialStore.clear()
    }

    func signOut() async {
        session = nil
        refreshTask?.cancel()
        refreshTask = nil
        try? await credentialStore.clear()
    }

    private func loadStored() async throws -> StoredAuthSession? {
        guard let data = try await credentialStore.load() else { return nil }
        guard let stored = try? JSONDecoder().decode(StoredAuthSession.self, from: data), stored.version == StoredAuthSession.version else {
            try? await credentialStore.clear()
            return nil
        }
        session = stored
        return stored
    }

    private func refresh(_ current: StoredAuthSession) async throws -> StoredAuthSession {
        if let refreshTask { return try await finishRefresh(refreshTask) }
        let api = api
        let now = clock()
        let task = Task { try await api.refresh(current, now: now) }
        refreshTask = task
        return try await finishRefresh(task)
    }

    private func finishRefresh(_ task: Task<StoredAuthSession, Error>) async throws -> StoredAuthSession {
        do {
            let rotated = try await task.value
            // Persist the complete replacement blob before exposing its new access token.
            try await persist(rotated)
            refreshTask = nil
            return rotated
        } catch let error as NativeAuthError {
            refreshTask = nil
            if case .server(let status, let code, _) = error, status == 401, code == .invalidRefresh { await signOut() }
            throw error
        } catch {
            refreshTask = nil
            throw error
        }
    }

    private func persist(_ stored: StoredAuthSession) async throws {
        let data = try JSONEncoder().encode(stored)
        try await credentialStore.replace(data)
        session = stored
    }
}

/// Adds bearer auth and performs at most one refresh/retry after a 401; no recursion or retry loop.
public struct AuthenticatedHTTPClient: Sendable {
    private let controller: AuthSessionController
    private let transport: any NativeAuthTransport

    public init(controller: AuthSessionController, transport: any NativeAuthTransport) {
        self.controller = controller
        self.transport = transport
    }

    public func send(_ request: URLRequest) async throws -> NativeAuthHTTPResponse {
        let first = try await transport.send(authorize(request, token: try await controller.accessToken()))
        guard first.statusCode == 401 else { return first }
        let retry = try await transport.send(authorize(request, token: try await controller.accessToken(forceRefresh: true)))
        guard retry.statusCode != 401 else {
            await controller.signOut()
            throw NativeAuthError.signedOut
        }
        return retry
    }

    private func authorize(_ request: URLRequest, token: String) -> URLRequest {
        var request = request
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        return request
    }
}
