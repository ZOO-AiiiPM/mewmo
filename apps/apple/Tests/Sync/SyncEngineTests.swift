import Foundation
import XCTest

final class SyncEngineTests: XCTestCase {
    func testPullPersistsFixtureRecordsAndCursor() async throws {
        let (store, engine, transport) = try await makeEngine()
        await transport.enqueue(path: "/api/sync/pull", response(200, try fixtureResponse("pull-incremental", key: "expectedResponse")))

        await engine.synchronize(trigger: .launch)

        let note = try await store.note(id: "note-1", userId: "user-1")
        let state = try await store.syncState(userId: "user-1")
        let diagnostics = await engine.diagnostics()
        XCTAssertEqual(note?.title, "Morning notes")
        XCTAssertEqual(state?.cursor, "mewmo-sync-v1:{\"feed\":{\"updatedAt\":\"2026-07-03T12:30:00.000Z\",\"id\":\"feed-1\"},\"note\":{\"updatedAt\":\"2026-07-03T10:30:00.000Z\",\"id\":\"note-1\"}}")
        XCTAssertEqual(diagnostics.phase, .succeeded)
        XCTAssertEqual(diagnostics.pulledRecords, 2)
    }

    func testTombstoneFixtureBecomesHiddenLocalRecord() async throws {
        let (store, engine, transport) = try await makeEngine()
        await transport.enqueue(path: "/api/sync/pull", response(200, try fixtureResponse("pull-tombstones", key: "expectedResponse")))

        await engine.synchronize(trigger: .manual)

        let hidden = try await store.note(id: "note-deleted", userId: "user-1", includeDeleted: false)
        let tombstone = try await store.note(id: "note-deleted", userId: "user-1", includeDeleted: true)
        XCTAssertNil(hidden)
        XCTAssertNotNil(tombstone?.deletedAt)
    }

    func testPaginationFixtureAdvancesCursorOnlyAfterEveryPageLands() async throws {
        let (store, engine, transport) = try await makeEngine()
        await transport.enqueue(path: "/api/sync/pull", response(200, try fixtureResponse("pull-pagination", key: "expectedResponsePage1")))
        await transport.enqueue(path: "/api/sync/pull", response(200, try fixtureResponse("pull-pagination", key: "expectedResponsePage2")))

        await engine.synchronize(trigger: .launch)

        let notes = try await store.listNotes(userId: "user-1")
        let state = try await store.syncState(userId: "user-1")
        let pullCount = await transport.count("/api/sync/pull")
        XCTAssertEqual(notes.map(\.id), ["note-c", "note-b", "note-a"])
        XCTAssertEqual(state?.cursor, "mewmo-sync-v1:{\"note\":{\"updatedAt\":\"2026-07-01T10:00:00.000Z\",\"id\":\"note-c\"}}")
        XCTAssertEqual(pullCount, 2)
    }

    func testCanonicalFixtureMutationsPreserveIDAndStableClientMutationID() async throws {
        let (store, engine, transport) = try await makeEngine()
        var fixture = try fixtureObject("push-mutations-composite")
        var request = try XCTUnwrap(fixture["request"] as? [String: Any])
        var mutations = try XCTUnwrap(request["mutations"] as? [[String: Any]])
        mutations[0]["clientMutationId"] = "payload-must-not-win"
        request["mutations"] = mutations
        fixture["request"] = request

        let expected = try fixtureData(try XCTUnwrap(fixture["expectedResponse"]))
        for (index, mutation) in mutations.enumerated() {
            try await store.enqueueMutation(
                mutationId: "m\(index + 1)",
                entityKind: try XCTUnwrap(mutation["entity"] as? String),
                op: try XCTUnwrap(mutation["op"] as? String),
                expectedVersion: [0, 2, 1, 0, 0][index],
                payloadJSON: String(decoding: try fixtureData(mutation), as: UTF8.self),
                userId: "user-1"
            )
        }
        await transport.enqueue(path: "/api/sync/push", response(200, expected))
        await transport.enqueue(path: "/api/sync/pull", response(200, emptyPullResponse()))

        await engine.synchronize(trigger: .manual)

        let requestBody = await transport.requestBody(path: "/api/sync/push")
        let body = try XCTUnwrap(requestBody)
        let sent = try XCTUnwrap(try JSONSerialization.jsonObject(with: body) as? [String: Any])
        let sentMutations = try XCTUnwrap(sent["mutations"] as? [[String: Any]])
        XCTAssertEqual(sentMutations.map { $0["clientMutationId"] as? String }, ["m1", "m2", "m3", "m4", "m5"])
        XCTAssertEqual(sentMutations.map { $0["id"] as? String }, ["note-c", "note-u", "note-d", "clip-c", "entry-1"])
        XCTAssertEqual((sentMutations[1]["data"] as? [String: Any])?["expectedVersion"] as? Int, 2)
        XCTAssertEqual((sentMutations[2]["data"] as? [String: Any])?["expectedVersion"] as? Int, 1)
        XCTAssertEqual((sentMutations[4]["data"] as? [String: Any])?.isEmpty, true)
        let remaining = try await store.listPendingMutations(userId: "user-1")
        XCTAssertTrue(remaining.isEmpty)
    }

    func testRetryRetainsOutboxAndReusesMutationID() async throws {
        let (store, engine, transport) = try await makeEngine()
        let payload = try fixtureMutation("push-create-idempotent", key: "firstPush", index: 0)
        try await store.enqueueMutation(mutationId: "m-1", entityKind: "note", op: "create", expectedVersion: 0, payloadJSON: payload, userId: "user-1")
        await transport.enqueue(path: "/api/sync/push", response(500))
        await transport.enqueue(path: "/api/sync/pull", response(200, emptyPullResponse()))

        await engine.synchronize(trigger: .manual)
        let afterFailure = try await store.listPendingMutations(userId: "user-1")
        let failureDiagnostics = await engine.diagnostics()
        XCTAssertEqual(afterFailure.map(\.mutationId), ["m-1"])
        XCTAssertEqual(failureDiagnostics.lastErrorCode, .server)

        await transport.enqueue(path: "/api/sync/push", response(200, try fixtureResponse("push-create-idempotent", key: "expectedFirstResponse")))
        await transport.enqueue(path: "/api/sync/pull", response(200, emptyPullResponse()))
        await engine.synchronize(trigger: .networkRecovery)

        let bodies = await transport.requestBodies(path: "/api/sync/push")
        XCTAssertEqual(bodies.count, 2)
        XCTAssertEqual(try clientMutationID(in: bodies[0]), "m-1")
        XCTAssertEqual(try clientMutationID(in: bodies[1]), "m-1")
        let afterRetry = try await store.listPendingMutations(userId: "user-1")
        XCTAssertTrue(afterRetry.isEmpty)
    }

    func testOutboxPushesInBoundedBatches() async throws {
        let (store, engine, transport) = try await makeEngine()
        let seed = try fixtureMutation("push-create-idempotent", key: "firstPush", index: 0)
        for index in 0..<51 {
            let mutationId = "batch-\(index)"
            let payload = try canonicalCreatePayload(seed, id: "note-batch-\(index)", payloadMutationID: "payload-\(index)")
            try await store.enqueueMutation(
                mutationId: mutationId,
                entityKind: "note",
                op: "create",
                expectedVersion: 0,
                payloadJSON: payload,
                userId: "user-1"
            )
        }
        await transport.enqueue(path: "/api/sync/push", response(200, try appliedResponse(ids: (0..<50).map { "batch-\($0)" })))
        await transport.enqueue(path: "/api/sync/push", response(200, try appliedResponse(ids: ["batch-50"])))
        await transport.enqueue(path: "/api/sync/pull", response(200, emptyPullResponse()))

        await engine.synchronize(trigger: .manual)

        let bodies = await transport.requestBodies(path: "/api/sync/push")
        let remaining = try await store.listPendingMutations(userId: "user-1")
        XCTAssertEqual(try mutationCount(in: bodies[0]), 50)
        XCTAssertEqual(try mutationCount(in: bodies[1]), 1)
        XCTAssertTrue(remaining.isEmpty)
    }

    func testPartialPushAcknowledgesOnlyAppliedMutation() async throws {
        let (store, engine, transport) = try await makeEngine()
        let payload = try fixtureMutation("push-create-idempotent", key: "firstPush", index: 0)
        try await store.enqueueMutation(mutationId: "m-applied", entityKind: "note", op: "create", expectedVersion: 0, payloadJSON: payload, userId: "user-1")
        try await store.enqueueMutation(mutationId: "m-retry", entityKind: "note", op: "create", expectedVersion: 0, payloadJSON: payload, userId: "user-1")
        await transport.enqueue(path: "/api/sync/push", response(200, try fixtureData([
            "contractVersion": 1,
            "applied": [["index": 0, "clientMutationId": "m-applied"]],
            "errors": [["index": 1, "clientMutationId": "m-retry", "code": "server_error"]],
        ])))
        await transport.enqueue(path: "/api/sync/pull", response(200, emptyPullResponse()))

        await engine.synchronize(trigger: .manual)

        let pending = try await store.listPendingMutations(userId: "user-1")
        let diagnostics = await engine.diagnostics()
        XCTAssertEqual(pending.map(\.mutationId), ["m-retry"])
        XCTAssertEqual(diagnostics.lastErrorCode, .server)
    }

    func testVersionConflictLandsServerRecordAndAcknowledgesStaleMutation() async throws {
        let (store, engine, transport) = try await makeEngine()
        _ = try await store.upsertNote(DataTestSupport.note(id: "note-1", version: 1, title: "stale"))
        let payload = try fixtureMutation("push-update-conflict", key: "stalePush", index: 0)
        try await store.enqueueMutation(mutationId: "m-stale", entityKind: "note", op: "update", expectedVersion: 1, payloadJSON: payload, userId: "user-1")
        await transport.enqueue(path: "/api/sync/push", response(200, try fixtureResponse("push-update-conflict", key: "expectedStaleResponse")))
        await transport.enqueue(path: "/api/sync/pull", response(200, emptyPullResponse()))

        await engine.synchronize(trigger: .manual)

        let conflictedNote = try await store.note(id: "note-1", userId: "user-1")
        let afterConflict = try await store.listPendingMutations(userId: "user-1")
        XCTAssertEqual(conflictedNote?.version, 3)
        XCTAssertTrue(afterConflict.isEmpty)
    }

    func testAppliedRecordUpdatesLocalVersionBeforeNextEdit() async throws {
        let (store, engine, transport) = try await makeEngine()
        _ = try await store.upsertNote(DataTestSupport.note(id: "note-1", version: 3, title: "Edited"))
        let payload = try fixtureMutation("push-update-conflict", key: "freshPush", index: 0)
        try await store.enqueueMutation(mutationId: "m-fresh", entityKind: "note", op: "update", expectedVersion: 3, payloadJSON: payload, userId: "user-1")
        await transport.enqueue(path: "/api/sync/push", response(200, try fixtureResponse("push-update-conflict", key: "expectedFreshResponse")))
        await transport.enqueue(path: "/api/sync/pull", response(200, emptyPullResponse()))

        await engine.synchronize(trigger: .manual)

        let note = try await store.note(id: "note-1", userId: "user-1")
        let pending = try await store.listPendingMutations(userId: "user-1")
        XCTAssertEqual(note?.version, 4)
        XCTAssertTrue(pending.isEmpty)
    }

    func testInvalidAndMismatchedOutboxRowsStayQueuedWithoutSending() async throws {
        let (store, engine, transport) = try await makeEngine()
        try await store.enqueueMutation(mutationId: "broken", entityKind: "note", op: "update", expectedVersion: 1, payloadJSON: "{}", userId: "user-1")
        await transport.enqueue(path: "/api/sync/pull", response(200, emptyPullResponse()))

        await engine.synchronize(trigger: .manual)

        let brokenRows = try await store.listPendingMutations(userId: "user-1")
        let firstPushCount = await transport.count("/api/sync/push")
        let brokenDiagnostics = await engine.diagnostics()
        XCTAssertEqual(brokenRows.map(\.mutationId), ["broken"])
        XCTAssertEqual(firstPushCount, 0)
        XCTAssertEqual(brokenDiagnostics.lastErrorCode, .outboxInvalid)

        _ = try await store.ackMutation(mutationId: "broken", userId: "user-1")
        let mismatched = try fixtureMutation("push-update-conflict", key: "stalePush", index: 0)
        try await store.enqueueMutation(mutationId: "mismatch", entityKind: "clip", op: "update", expectedVersion: 1, payloadJSON: mismatched, userId: "user-1")
        await transport.enqueue(path: "/api/sync/pull", response(200, emptyPullResponse()))

        await engine.synchronize(trigger: .manual)

        let mismatchRows = try await store.listPendingMutations(userId: "user-1")
        let secondPushCount = await transport.count("/api/sync/push")
        let mismatchDiagnostics = await engine.diagnostics()
        XCTAssertEqual(mismatchRows.map(\.mutationId), ["mismatch"])
        XCTAssertEqual(secondPushCount, 0)
        XCTAssertEqual(mismatchDiagnostics.lastErrorCode, .outboxInvalid)

        _ = try await store.ackMutation(mutationId: "mismatch", userId: "user-1")
        try await store.enqueueMutation(mutationId: "version-mismatch", entityKind: "note", op: "update", expectedVersion: 2, payloadJSON: mismatched, userId: "user-1")
        await transport.enqueue(path: "/api/sync/pull", response(200, emptyPullResponse()))

        await engine.synchronize(trigger: .manual)

        let versionMismatchRows = try await store.listPendingMutations(userId: "user-1")
        let finalPushCount = await transport.count("/api/sync/push")
        XCTAssertEqual(versionMismatchRows.map(\.mutationId), ["version-mismatch"])
        XCTAssertEqual(finalPushCount, 0)
    }

    func testSingleInstanceMutexAndLifecycleTriggerStayTokenFree() async throws {
        let (_, engine, transport) = try await makeEngine()
        await transport.enqueue(path: "/api/sync/pull", response(200, emptyPullResponse()))
        await transport.blockNextResponse(path: "/api/sync/pull")

        let first = Task { await engine.synchronize(trigger: .launch) }
        await transport.waitUntilRequested(path: "/api/sync/pull")
        let coordinator = await MainActor.run { SyncLifecycleCoordinator(engine: engine) }
        await MainActor.run { coordinator.applicationDidEnterForeground() }
        await transport.releaseBlockedResponse(path: "/api/sync/pull")
        _ = await first.value

        await transport.enqueue(path: "/api/sync/pull", response(200, emptyPullResponse()))
        await transport.blockNextResponse(path: "/api/sync/pull")
        await MainActor.run { coordinator.networkDidRecover() }
        await transport.waitUntilRequested(path: "/api/sync/pull", atLeast: 2)
        await transport.releaseBlockedResponse(path: "/api/sync/pull")

        let diagnostics = await engine.diagnostics()
        XCTAssertEqual(diagnostics.skippedRuns, 1)
        XCTAssertFalse(String(describing: diagnostics).contains("access-one"))
    }

    private func makeEngine() async throws -> (LocalStore, SyncEngine, SyncTestTransport) {
        let (_, store) = try DataTestSupport.inMemoryStore()
        let transport = SyncTestTransport()
        let controller = AuthSessionController(
            baseURL: AuthTestData.baseURL,
            transport: transport,
            credentialStore: InMemoryCredentialStore(),
            clock: { AuthTestData.now }
        )
        await transport.enqueue(path: "/api/auth/native/login", response(200, Data(AuthTestData.loginJSON.utf8)))
        _ = try await controller.login(NativeLoginRequest(email: "one@example.com", password: "password"))
        return (
            store,
            SyncEngine(
                baseURL: AuthTestData.baseURL,
                userId: "user-1",
                localStore: store,
                httpClient: AuthenticatedHTTPClient(controller: controller, transport: transport)
            ),
            transport
        )
    }

    private func response(_ status: Int, _ data: Data = Data("{}".utf8)) -> NativeAuthHTTPResponse {
        NativeAuthHTTPResponse(data: data, statusCode: status)
    }

    private func fixtureObject(_ name: String) throws -> [String: Any] {
        try XCTUnwrap(try JSONSerialization.jsonObject(with: fixtureData(name)) as? [String: Any])
    }

    private func fixtureData(_ name: String) throws -> Data {
        guard let url = Bundle(for: Self.self).url(forResource: name, withExtension: "json") else {
            throw XCTSkip("fixture \(name).json not bundled")
        }
        return try Data(contentsOf: url)
    }

    private func fixtureResponse(_ fixture: String, key: String) throws -> Data {
        try fixtureData(try XCTUnwrap(fixtureObject(fixture)[key]))
    }

    private func fixtureMutation(_ fixture: String, key: String, index: Int) throws -> String {
        let top = try fixtureObject(fixture)
        let request = try XCTUnwrap(top[key] as? [String: Any])
        let mutations = try XCTUnwrap(request["mutations"] as? [Any])
        return String(decoding: try fixtureData(try XCTUnwrap(mutations[index])), as: UTF8.self)
    }

    private func fixtureData(_ object: Any) throws -> Data {
        try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
    }

    private func emptyPullResponse() -> Data {
        Data("""
        {"contractVersion":1,"cursor":"mewmo-sync-v1:{}","nextCursor":"mewmo-sync-v1:{}","hasMore":false,"limit":50,"records":{"note":[],"clip":[],"feed":[],"feed_entry":[]}}
        """.utf8)
    }

    private func clientMutationID(in data: Data) throws -> String? {
        let body = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        let mutations = try XCTUnwrap(body["mutations"] as? [[String: Any]])
        return mutations.first?["clientMutationId"] as? String
    }

    private func canonicalCreatePayload(_ seed: String, id: String, payloadMutationID: String) throws -> String {
        var mutation = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(seed.utf8)) as? [String: Any])
        mutation["id"] = id
        mutation["clientMutationId"] = payloadMutationID
        return String(decoding: try fixtureData(mutation), as: UTF8.self)
    }

    private func appliedResponse(ids: [String]) throws -> Data {
        let applied = ids.enumerated().map { index, id in ["index": index, "clientMutationId": id] }
        return try JSONSerialization.data(withJSONObject: ["contractVersion": 1, "applied": applied, "errors": []])
    }

    private func mutationCount(in data: Data) throws -> Int {
        let body = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        return try XCTUnwrap(body["mutations"] as? [Any]).count
    }
}

private actor SyncTestTransport: NativeAuthTransport {
    private var responses: [String: [NativeAuthHTTPResponse]] = [:]
    private var bodies: [String: [Data]] = [:]
    private var counts: [String: Int] = [:]
    private var blockedPaths: Set<String> = []
    private var blockContinuations: [String: [CheckedContinuation<Void, Never>]] = [:]
    private var requestContinuations: [String: [CheckedContinuation<Void, Never>]] = [:]

    func enqueue(path: String, _ response: NativeAuthHTTPResponse) {
        responses[path, default: []].append(response)
    }

    func blockNextResponse(path: String) { blockedPaths.insert(path) }

    func waitUntilRequested(path: String, atLeast target: Int = 1) async {
        while counts[path, default: 0] < target {
            await withCheckedContinuation { requestContinuations[path, default: []].append($0) }
        }
    }

    func releaseBlockedResponse(path: String) {
        let continuations = blockContinuations.removeValue(forKey: path) ?? []
        continuations.forEach { $0.resume() }
    }

    func send(_ request: URLRequest) async throws -> NativeAuthHTTPResponse {
        let path = request.url?.path ?? ""
        counts[path, default: 0] += 1
        if let body = request.httpBody { bodies[path, default: []].append(body) }
        let requestWaiters = requestContinuations.removeValue(forKey: path) ?? []
        requestWaiters.forEach { $0.resume() }
        guard let response = responses[path]?.isEmpty == false ? responses[path]!.removeFirst() : nil else {
            throw URLError(.badServerResponse)
        }
        if blockedPaths.remove(path) != nil {
            await withCheckedContinuation { blockContinuations[path, default: []].append($0) }
        }
        return response
    }

    func count(_ path: String) -> Int { counts[path, default: 0] }
    func requestBody(path: String) -> Data? { bodies[path]?.last }
    func requestBodies(path: String) -> [Data] { bodies[path] ?? [] }
}
