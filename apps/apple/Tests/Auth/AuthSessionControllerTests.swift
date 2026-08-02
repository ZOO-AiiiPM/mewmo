import XCTest

final class AuthSessionControllerTests: XCTestCase {
    func testLoginPersistsAndRestorePublishesSafeSnapshot() async throws {
        let transport = MockNativeAuthTransport()
        let store = InMemoryCredentialStore()
        let controller = AuthTestData.controller(transport: transport, store: store)

        try await AuthTestData.login(controller, transport: transport)
        let restored = AuthTestData.controller(transport: transport, store: store)
        let snapshot = try await restored.restore()

        XCTAssertEqual(snapshot?.sessionId, "session-one")
        XCTAssertEqual(snapshot?.user.id, "user-one")
        let stored = try await store.load()
        XCTAssertNotNil(stored)
    }

    func testRestoreClearsStaleMemoryForMissingOrCorruptBlob() async throws {
        let transport = MockNativeAuthTransport()
        let store = InMemoryCredentialStore()
        let controller = AuthTestData.controller(transport: transport, store: store)
        try await AuthTestData.login(controller, transport: transport)
        try await store.clear()

        let missing = try await controller.restore()
        let missingSnapshot = await controller.snapshot()
        XCTAssertNil(missing)
        XCTAssertNil(missingSnapshot)

        try await store.replace(Data("corrupt".utf8))
        let corrupt = try await controller.restore()
        let corruptSnapshot = await controller.snapshot()
        let clearedBlob = try await store.load()
        XCTAssertNil(corrupt)
        XCTAssertNil(corruptSnapshot)
        XCTAssertNil(clearedBlob)
    }

    func testFreshAccessDoesNotRefresh() async throws {
        let transport = MockNativeAuthTransport()
        let store = InMemoryCredentialStore()
        let controller = AuthTestData.controller(transport: transport, store: store)
        try await AuthTestData.login(controller, transport: transport)

        _ = try await controller.accessToken()

        let refreshCount = await transport.count("/api/auth/native/refresh")
        XCTAssertEqual(refreshCount, 0)
    }

    func testConcurrentRefreshIsSingleFlightAndReplacesBlob() async throws {
        let transport = MockNativeAuthTransport()
        let store = InMemoryCredentialStore()
        let controller = AuthTestData.controller(transport: transport, store: store, leeway: 1_000)
        try await AuthTestData.login(controller, transport: transport)
        await transport.enqueue(path: "/api/auth/native/refresh", AuthTestData.response(200, AuthTestData.refreshJSON))

        async let first = controller.accessToken()
        async let second = controller.accessToken()
        let tokens = try await [first, second]

        XCTAssertEqual(tokens, ["access-two", "access-two"])
        let refreshCount = await transport.count("/api/auth/native/refresh")
        XCTAssertEqual(refreshCount, 1)
        let snapshot = await controller.snapshot()
        XCTAssertEqual(snapshot?.sessionId, "session-one")
    }

    func testInvalidRefreshSignsOutButTransientFailuresKeepSession() async throws {
        let transport = MockNativeAuthTransport()
        let store = InMemoryCredentialStore()
        let controller = AuthTestData.controller(transport: transport, store: store, leeway: 1_000)
        try await AuthTestData.login(controller, transport: transport)

        await transport.enqueue(path: "/api/auth/native/refresh", AuthTestData.response(429, "{\"code\":\"rate_limited\"}"))
        do { _ = try await controller.accessToken() } catch { }
        let transientSnapshot = await controller.snapshot()
        XCTAssertNotNil(transientSnapshot)

        await transport.enqueue(path: "/api/auth/native/refresh", AuthTestData.response(401, "{\"code\":\"invalid_refresh\"}"))
        do { _ = try await controller.accessToken() } catch { }
        let signedOutSnapshot = await controller.snapshot()
        let clearedStore = try await store.load()
        XCTAssertNil(signedOutSnapshot)
        XCTAssertNil(clearedStore)
    }

    func testLogoutClearsLocalCredentialsWhenNetworkFails() async throws {
        let transport = MockNativeAuthTransport()
        let store = InMemoryCredentialStore()
        let controller = AuthTestData.controller(transport: transport, store: store)
        try await AuthTestData.login(controller, transport: transport)
        await transport.enqueue(path: "/api/auth/native/logout", AuthTestData.response(500, "{\"code\":\"unknown\"}"))

        await controller.logout()

        let signedOutSnapshot = await controller.snapshot()
        let clearedStore = try await store.load()
        XCTAssertNil(signedOutSnapshot)
        XCTAssertNil(clearedStore)
    }

    func testBlockedRefreshCannotRestoreSessionAfterLogoutWins() async throws {
        let transport = MockNativeAuthTransport()
        let store = BlockingCredentialStore()
        let controller = AuthTestData.controller(transport: transport, store: store)
        try await AuthTestData.login(controller, transport: transport)
        await store.blockNextReplace()
        await transport.enqueue(path: "/api/auth/native/refresh", AuthTestData.response(200, AuthTestData.refreshJSON))

        let refresh = Task { try? await controller.accessToken(forceRefresh: true) }
        await store.waitUntilReplaceBlocked()
        let logout = Task { await controller.logout() }
        await controller.waitUntilCredentialOperationsQueued(atLeast: 4)
        await store.releaseReplace()
        _ = await logout.value
        _ = await refresh.value

        let snapshot = await controller.snapshot()
        let blob = try await store.load()
        XCTAssertNil(snapshot)
        XCTAssertNil(blob)
    }

    func testBlockedRefreshAndDelayedLogoutClearCannotOverwriteLaterLoginBlob() async throws {
        let transport = MockNativeAuthTransport()
        let rawStore = BlockingCredentialStore()
        let controller = AuthTestData.controller(transport: transport, store: rawStore)
        try await AuthTestData.login(controller, transport: transport)
        await rawStore.blockNextReplace()
        await transport.enqueue(path: "/api/auth/native/refresh", AuthTestData.response(200, AuthTestData.refreshJSON))

        let staleRefresh = Task { try? await controller.accessToken(forceRefresh: true) }
        await rawStore.waitUntilReplaceBlocked()
        let logout = Task { await controller.logout() }
        await controller.waitUntilCredentialOperationsQueued(atLeast: 4)
        await transport.enqueue(path: "/api/auth/native/login", AuthTestData.response(200, AuthTestData.secondLoginJSON))
        let loginB = Task {
            try await controller.login(NativeLoginRequest(email: "two@example.com", password: "password"))
        }
        await controller.waitUntilCredentialOperationsQueued(atLeast: 5)
        await rawStore.releaseReplace()

        _ = await staleRefresh.value
        _ = await logout.value
        let loginSnapshot = try await loginB.value
        let snapshot = await controller.snapshot()
        let persisted = try await rawStore.load()
        let stored = try JSONDecoder().decode(StoredAuthSession.self, from: try XCTUnwrap(persisted))
        XCTAssertEqual(snapshot?.user.id, loginSnapshot.user.id)
        XCTAssertEqual(snapshot?.sessionId, loginSnapshot.sessionId)
        XCTAssertEqual(stored.user.id, loginSnapshot.user.id)
        XCTAssertEqual(stored.sessionId, loginSnapshot.sessionId)
    }

    func testLateRefreshResponseCannotOverwriteAlreadyPersistedLoginB() async throws {
        let transport = MockNativeAuthTransport()
        let rawStore = InMemoryCredentialStore()
        let controller = AuthTestData.controller(transport: transport, store: rawStore)
        try await AuthTestData.login(controller, transport: transport)
        await transport.enqueue(path: "/api/auth/native/refresh", AuthTestData.response(200, AuthTestData.refreshJSON))
        await transport.blockNextResponse(path: "/api/auth/native/refresh")

        let staleRefresh = Task { try? await controller.accessToken(forceRefresh: true) }
        await transport.waitUntilRequested(path: "/api/auth/native/refresh")
        await transport.enqueue(path: "/api/auth/native/login", AuthTestData.response(200, AuthTestData.secondLoginJSON))
        let loginB = try await controller.login(NativeLoginRequest(email: "two@example.com", password: "password"))
        await transport.releaseBlockedResponse(path: "/api/auth/native/refresh")
        _ = await staleRefresh.value

        let snapshot = await controller.snapshot()
        let persisted = try await rawStore.load()
        let stored = try JSONDecoder().decode(StoredAuthSession.self, from: try XCTUnwrap(persisted))
        XCTAssertEqual(snapshot?.user.id, loginB.user.id)
        XCTAssertEqual(stored.user.id, loginB.user.id)
        XCTAssertEqual(stored.sessionId, loginB.sessionId)
    }

    func testAccessTokenCannotReloadCredentialsDuringDelayedLogoutRequest() async throws {
        let transport = MockNativeAuthTransport()
        let rawStore = InMemoryCredentialStore()
        let controller = AuthTestData.controller(transport: transport, store: rawStore)
        try await AuthTestData.login(controller, transport: transport)
        await transport.enqueue(path: "/api/auth/native/logout", AuthTestData.response(204))
        await transport.blockNextResponse(path: "/api/auth/native/logout")

        let logout = Task { await controller.logout() }
        await transport.waitUntilRequested(path: "/api/auth/native/logout")
        do {
            _ = try await controller.accessToken()
            XCTFail("Expected signed-out result")
        } catch let error as NativeAuthError {
            XCTAssertEqual(error, .signedOut)
        }
        let snapshotDuringLogout = await controller.snapshot()
        let blobDuringLogout = try await rawStore.load()
        XCTAssertNil(snapshotDuringLogout)
        XCTAssertNil(blobDuringLogout)

        await transport.releaseBlockedResponse(path: "/api/auth/native/logout")
        _ = await logout.value
    }
}
