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
}
