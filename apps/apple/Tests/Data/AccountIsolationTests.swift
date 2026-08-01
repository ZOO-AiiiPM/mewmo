import Foundation
import XCTest

/// 账号隔离：同一个容器里，user A 的实体、cursor、outbox 不能被 user B 查询或修改。
final class AccountIsolationTests: XCTestCase {
    func testEntitiesAreIsolatedByUserId() async throws {
        let (_, store) = try DataTestSupport.inMemoryStore()

        _ = try await store.upsertNote(DataTestSupport.note(id: "note-1", version: 1, userId: "user-a"))
        _ = try await store.upsertNote(DataTestSupport.note(id: "note-2", version: 1, userId: "user-b"))
        _ = try await store.upsertClip(DataTestSupport.clip(id: "clip-1", userId: "user-a"))
        _ = try await store.upsertFeed(DataTestSupport.feed(id: "feed-1", userId: "user-a"))
        _ = try await store.upsertFeedEntry(DataTestSupport.feedEntry(id: "entry-1", userId: "user-a"))

        // A 看不到 B
        let aNotes = try await store.listNotes(userId: "user-a")
        XCTAssertEqual(aNotes.map(\.id), ["note-1"])
        let bNoteFromA = try await store.note(id: "note-2", userId: "user-a")
        XCTAssertNil(bNoteFromA)
        let aClips = try await store.listClips(userId: "user-a")
        XCTAssertEqual(aClips.count, 1)
        let aFeeds = try await store.listFeeds(userId: "user-a")
        XCTAssertEqual(aFeeds.count, 1)
        let aEntries = try await store.listFeedEntries(userId: "user-a")
        XCTAssertEqual(aEntries.count, 1)

        // B 看不到 A
        let bNotes = try await store.listNotes(userId: "user-b")
        XCTAssertEqual(bNotes.map(\.id), ["note-2"])
        let aNoteFromB = try await store.note(id: "note-1", userId: "user-b")
        XCTAssertNil(aNoteFromB)
    }

    func testCannotModifyOtherUsersData() async throws {
        let (_, store) = try DataTestSupport.inMemoryStore()

        _ = try await store.upsertNote(DataTestSupport.note(id: "shared", version: 1, userId: "user-a", title: "A's"))

        // B 无法读取 A 的实体（先验证不可见，因此后续修改无从谈起）
        let sharedFromB = try await store.note(id: "shared", userId: "user-b")
        XCTAssertNil(sharedFromB)

        // A 的 tombstone：B 无法对 A 的记录放碑也不会误删
        let modifiedByB = try await store.softDeleteNote(id: "shared", userId: "user-b", version: 2, deletedAt: Date())
        XCTAssertFalse(modifiedByB)
        let sharedFromA = try await store.note(id: "shared", userId: "user-a")
        XCTAssertEqual(sharedFromA?.title, "A's")
    }

    func testSyncStateIsolatedByUser() async throws {
        let (_, store) = try DataTestSupport.inMemoryStore()

        _ = try await store.saveSyncState(
            SyncStateSnapshot(scope: "pull", contractVersion: 1, cursor: "cursor-a", userId: "user-a")
        )

        let stateA = try await store.syncState(userId: "user-a")
        XCTAssertNotNil(stateA)
        let stateB = try await store.syncState(userId: "user-b")
        XCTAssertNil(stateB)

        // B 写入自己的 cursor 不影响 A
        _ = try await store.saveSyncState(
            SyncStateSnapshot(scope: "pull", contractVersion: 1, cursor: "cursor-b", userId: "user-b")
        )
        let stateAAfter = try await store.syncState(userId: "user-a")
        XCTAssertEqual(stateAAfter?.cursor, "cursor-a")
        let stateBAfter = try await store.syncState(userId: "user-b")
        XCTAssertEqual(stateBAfter?.cursor, "cursor-b")
    }

    func testOutboxIsolatedByUser() async throws {
        let (_, store) = try DataTestSupport.inMemoryStore()

        _ = try await store.enqueueMutation(
            mutationId: "m-a", entityKind: "note", op: "create", expectedVersion: 0, payloadJSON: "{}", userId: "user-a"
        )
        _ = try await store.enqueueMutation(
            mutationId: "m-b", entityKind: "note", op: "update", expectedVersion: 1, payloadJSON: "{}", userId: "user-b"
        )

        let outboxA = try await store.listPendingMutations(userId: "user-a")
        XCTAssertEqual(outboxA.map(\.mutationId), ["m-a"])
        let outboxB = try await store.listPendingMutations(userId: "user-b")
        XCTAssertEqual(outboxB.map(\.mutationId), ["m-b"])

        // A ack 只会删 A 的，不影响 B
        let ackedA = try await store.ackMutation(mutationId: "m-a", userId: "user-a")
        XCTAssertTrue(ackedA)
        let outboxAAfterAck = try await store.listPendingMutations(userId: "user-a")
        XCTAssertEqual(outboxAAfterAck.count, 0)
        let outboxBAfterAck = try await store.listPendingMutations(userId: "user-b")
        XCTAssertEqual(outboxBAfterAck.count, 1)
    }
}
