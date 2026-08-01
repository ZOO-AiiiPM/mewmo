import Foundation
import XCTest

/// Tombstone 语义：默认列表不可见、显式可读、version/记录被保留，且后续更高版本可恢复。
final class TombstoneTests: XCTestCase {
    func testTombstoneHiddenByDefaultAndReadableExplicitly() async throws {
        let (_, store) = try DataTestSupport.inMemoryStore()
        let user = "user-1"

        _ = try await store.upsertNote(DataTestSupport.note(id: "n1", version: 2, userId: user, title: "alive"))

        let tombAt = DataTestSupport.iso("2026-07-04T11:00:00.000Z")
        let softDeleted = try await store.softDeleteNote(id: "n1", userId: user, version: 3, deletedAt: tombAt)
        XCTAssertTrue(softDeleted)

        // 默认列表排除
        let visible = try await store.listNotes(userId: user)
        XCTAssertEqual(visible.count, 0)
        let hidden = try await store.note(id: "n1", userId: user, includeDeleted: false)
        XCTAssertNil(hidden)

        // 显式 fetch 可取回，且记录/version 保留
        let tomb = try await store.note(id: "n1", userId: user, includeDeleted: true)
        XCTAssertNotNil(tomb)
        XCTAssertEqual(tomb?.id, "n1")
        XCTAssertEqual(tomb?.version, 3)
        XCTAssertNotNil(tomb?.deletedAt)
    }

    func testNewerUpsertRevivesTombstone() async throws {
        let (_, store) = try DataTestSupport.inMemoryStore()
        let user = "user-1"

        _ = try await store.upsertNote(DataTestSupport.note(id: "n1", version: 2, userId: user, title: "v2"))
        _ = try await store.softDeleteNote(id: "n1", userId: user, version: 3, deletedAt: Date())

        // 更新的远端记录（没有 tombstone）覆盖 → 恢复可见
        _ = try await store.upsertNote(DataTestSupport.note(id: "n1", version: 4, userId: user, title: "revived"))
        let visible = try await store.listNotes(userId: user)
        XCTAssertEqual(visible.map(\.id), ["n1"])
        let revived = try await store.note(id: "n1", userId: user, includeDeleted: false)
        XCTAssertNil(revived?.deletedAt)
        let version = try await store.note(id: "n1", userId: user)
        XCTAssertEqual(version?.version, 4)
    }

    func testOlderVersionCannotTombstoneOrRevive() async throws {
        let (_, store) = try DataTestSupport.inMemoryStore()
        let user = "user-1"

        _ = try await store.upsertNote(DataTestSupport.note(id: "n1", version: 5, userId: user, title: "v5"))

        // 旧版本 tombstone 请求被拒绝
        let oldTombstone = try await store.softDeleteNote(id: "n1", userId: user, version: 3, deletedAt: Date())
        XCTAssertFalse(oldTombstone)
        let stillVisible = try await store.listNotes(userId: user)
        XCTAssertEqual(stillVisible.count, 1)

        // 已 tombstone（v6）后，旧版本 upsert 不能复活
        let newerTombstone = try await store.softDeleteNote(id: "n1", userId: user, version: 6, deletedAt: Date())
        XCTAssertTrue(newerTombstone)
        let afterTombstone = try await store.listNotes(userId: user)
        XCTAssertEqual(afterTombstone.count, 0)
        let reviveAttempt = try await store.upsertNote(DataTestSupport.note(id: "n1", version: 5, userId: user))
        XCTAssertNil(reviveAttempt)
        let stillTombstoned = try await store.listNotes(userId: user)
        XCTAssertEqual(stillTombstoned.count, 0)
    }
}
