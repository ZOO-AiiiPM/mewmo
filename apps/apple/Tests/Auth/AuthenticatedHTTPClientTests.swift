import Foundation
import XCTest

final class AuthenticatedHTTPClientTests: XCTestCase {
    func test401RefreshesAndRetriesExactlyOnce() async throws {
        let transport = MockNativeAuthTransport()
        let store = InMemoryCredentialStore()
        let controller = AuthTestData.controller(transport: transport, store: store)
        try await AuthTestData.login(controller, transport: transport)
        await transport.enqueue(path: "/protected", AuthTestData.response(401))
        await transport.enqueue(path: "/api/auth/native/refresh", AuthTestData.response(200, AuthTestData.refreshJSON))
        await transport.enqueue(path: "/protected", AuthTestData.response(200, "ok"))
        let client = AuthenticatedHTTPClient(controller: controller, transport: transport)

        let result = try await client.send(URLRequest(url: AuthTestData.baseURL.appendingPathComponent("protected")))

        XCTAssertEqual(result.statusCode, 200)
        let protectedCount = await transport.count("/protected")
        let refreshCount = await transport.count("/api/auth/native/refresh")
        let headers = await transport.headers()
        XCTAssertEqual(protectedCount, 2)
        XCTAssertEqual(refreshCount, 1)
        XCTAssertEqual(headers.count, 2)
    }

    func testSecond401SignsOutWithoutAnotherRetry() async throws {
        let transport = MockNativeAuthTransport()
        let store = InMemoryCredentialStore()
        let controller = AuthTestData.controller(transport: transport, store: store)
        try await AuthTestData.login(controller, transport: transport)
        await transport.enqueue(path: "/protected", AuthTestData.response(401))
        await transport.enqueue(path: "/api/auth/native/refresh", AuthTestData.response(200, AuthTestData.refreshJSON))
        await transport.enqueue(path: "/protected", AuthTestData.response(401))
        let client = AuthenticatedHTTPClient(controller: controller, transport: transport)

        do {
            _ = try await client.send(URLRequest(url: AuthTestData.baseURL.appendingPathComponent("protected")))
            XCTFail("Expected signed-out result")
        } catch let error as NativeAuthError {
            XCTAssertEqual(error, .signedOut)
        }

        let protectedCount = await transport.count("/protected")
        XCTAssertEqual(protectedCount, 2)
        let snapshot = await controller.snapshot()
        XCTAssertNil(snapshot)
    }
}
