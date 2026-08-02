import Foundation

/// Owns the credential lifecycle. The actor coalesces all refreshes so a rotated refresh token is never raced locally.
public actor AuthSessionController {
    private let api: NativeAuthAPI
    private let credentialStore: any CredentialStore
    private let clock: @Sendable () -> Date
    private let refreshLeeway: TimeInterval
    private var session: StoredAuthSession?
    private var refreshTask: Task<StoredAuthSession, Error>?
    private var refreshEpoch: UInt64?
    private var lifecycleEpoch: UInt64 = 0

    public init(baseURL: URL, transport: any NativeAuthTransport = URLSessionNativeAuthTransport(), credentialStore: any CredentialStore = SecurityCredentialStore(), clock: @escaping @Sendable () -> Date = Date.init, refreshLeeway: TimeInterval = 60) {
        self.api = NativeAuthAPI(baseURL: baseURL, transport: transport)
        self.credentialStore = credentialStore
        self.clock = clock
        self.refreshLeeway = refreshLeeway
    }

    public func restore() async throws -> AuthSessionSnapshot? {
        let epoch = invalidateLifecycle()
        guard let data = try await credentialStore.load() else { return nil }
        guard lifecycleEpoch == epoch else { return nil }
        guard let stored = try? JSONDecoder().decode(StoredAuthSession.self, from: data), stored.version == StoredAuthSession.version else {
            try? await credentialStore.clear()
            return nil
        }
        session = stored
        return stored.snapshot
    }

    @discardableResult
    public func login(_ input: NativeLoginRequest) async throws -> AuthSessionSnapshot {
        let epoch = lifecycleEpoch
        let stored = try await api.login(input, now: clock())
        guard try await persist(stored, expectedEpoch: epoch) else { throw NativeAuthError.signedOut }
        return stored.snapshot
    }

    public func snapshot() -> AuthSessionSnapshot? { session?.snapshot }

    public func accessToken(forceRefresh: Bool = false) async throws -> String {
        let current = if let session { session } else { try await loadStored() }
        guard let current else { throw NativeAuthError.signedOut }
        if !forceRefresh, current.accessExpiresAt.timeIntervalSince(clock()) > refreshLeeway { return current.accessToken }
        return try await refresh(current).accessToken
    }

    /// Resolves a rejected bearer without rotating again when another caller already did so.
    public func accessToken(afterUnauthorized rejectedAccessToken: String) async throws -> String {
        let current = if let session { session } else { try await loadStored() }
        guard let current else { throw NativeAuthError.signedOut }
        if current.accessToken != rejectedAccessToken { return current.accessToken }
        return try await refresh(current).accessToken
    }

    public func fetchSession() async throws -> NativeSessionInfo {
        let token = try await accessToken()
        return try await api.session(accessToken: token)
    }

    /// Explicit logout always removes the local blob, including on offline/server failure.
    public func logout() async {
        let current = if let session { session } else { try? await loadStored() }
        invalidateLifecycle()
        if let current { _ = try? await api.logout(current) }
        try? await credentialStore.clear()
    }

    func signOut() async {
        invalidateLifecycle()
        try? await credentialStore.clear()
    }

    private func loadStored() async throws -> StoredAuthSession? {
        let epoch = lifecycleEpoch
        guard let data = try await credentialStore.load() else { return nil }
        guard lifecycleEpoch == epoch else { return nil }
        guard let stored = try? JSONDecoder().decode(StoredAuthSession.self, from: data), stored.version == StoredAuthSession.version else {
            try? await credentialStore.clear()
            return nil
        }
        session = stored
        return stored
    }

    private func refresh(_ current: StoredAuthSession) async throws -> StoredAuthSession {
        if let refreshTask, let refreshEpoch { return try await finishRefresh(refreshTask, expectedEpoch: refreshEpoch) }
        let api = api
        let now = clock()
        let epoch = lifecycleEpoch
        let task = Task { try await api.refresh(current, now: now) }
        refreshTask = task
        refreshEpoch = epoch
        return try await finishRefresh(task, expectedEpoch: epoch)
    }

    private func finishRefresh(_ task: Task<StoredAuthSession, Error>, expectedEpoch: UInt64) async throws -> StoredAuthSession {
        do {
            let rotated = try await task.value
            // Persist the complete replacement blob before exposing its new access token.
            guard try await persist(rotated, expectedEpoch: expectedEpoch) else { throw NativeAuthError.signedOut }
            clearRefreshTask(for: expectedEpoch)
            return rotated
        } catch let error as NativeAuthError {
            clearRefreshTask(for: expectedEpoch)
            if case .server(let status, let code, _) = error, status == 401, code == .invalidRefresh, lifecycleEpoch == expectedEpoch {
                await signOut()
            }
            throw error
        } catch {
            clearRefreshTask(for: expectedEpoch)
            throw error
        }
    }

    /// Returns false when a newer lifecycle invalidated this write while the store call was suspended.
    private func persist(_ stored: StoredAuthSession, expectedEpoch: UInt64) async throws -> Bool {
        let data = try JSONEncoder().encode(stored)
        try await credentialStore.replace(data)
        guard lifecycleEpoch == expectedEpoch else {
            // A logout/sign-out won during the external store operation. Remove the late blob before returning.
            if session == nil { try? await credentialStore.clear() }
            return false
        }
        session = stored
        return true
    }

    @discardableResult
    private func invalidateLifecycle() -> UInt64 {
        lifecycleEpoch &+= 1
        session = nil
        refreshTask?.cancel()
        refreshTask = nil
        refreshEpoch = nil
        return lifecycleEpoch
    }

    private func clearRefreshTask(for epoch: UInt64) {
        guard refreshEpoch == epoch else { return }
        refreshTask = nil
        refreshEpoch = nil
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
        let token = try await controller.accessToken()
        let first = try await transport.send(authorize(request, token: token))
        guard first.statusCode == 401 else { return first }
        let retryToken = try await controller.accessToken(afterUnauthorized: token)
        let retry = try await transport.send(authorize(request, token: retryToken))
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
