import Foundation
import XCTest

/// repository 行为：四实体 CRUD、版本单调 upsert、同版本幂等重放与稳定排序。
final class RepositoryTests: XCTestCase {
    func testNoteCRUDAndStableOrdering() async throws {
        let (_, store) = try DataTestSupport.inMemoryStore()
        let a = DataTestSupport.note(id: "a", version: 1, title: "A", updatedAt: Date(timeIntervalSince1970: 10))
        let b = DataTestSupport.note(id: "b", version: 1, title: "B", updatedAt: Date(timeIntervalSince1970: 20))

        _ = try await store.upsertNote(a)
        _ = try await store.upsertNote(b)

        // 稳定排序：listNotes 按 updatedAt 降序 → b 在前
        let list = try await store.listNotes(userId: "user-1")
        XCTAssertEqual(list.map(\.id), ["b", "a"])
        XCTAssertEqual(list.map(\.title), ["B", "A"])

        // 删除 + 显式读取（tombstone 默认不可见）
        let softDeleted = try await store.softDeleteNote(id: "a", userId: "user-1", version: 1, deletedAt: Date(timeIntervalSince1970: 99))
        XCTAssertTrue(softDeleted)
        let visible = try await store.listNotes(userId: "user-1")
        XCTAssertEqual(visible.map(\.id), ["b"])
        let tombstoneReadable = try await store.note(id: "a", userId: "user-1", includeDeleted: true)
        XCTAssertEqual(tombstoneReadable?.id, "a")
        let hidden = try await store.note(id: "a", userId: "user-1", includeDeleted: false)
        XCTAssertNil(hidden)
    }

    func testClipFeedFeedEntryBasics() async throws {
        let (_, store) = try DataTestSupport.inMemoryStore()

        _ = try await store.upsertClip(DataTestSupport.clip(userId: "user-1"))
        let clips = try await store.listClips(userId: "user-1")
        XCTAssertEqual(clips.count, 1)
        let otherClips = try await store.listClips(userId: "other")
        XCTAssertEqual(otherClips.count, 0)

        _ = try await store.upsertFeed(DataTestSupport.feed(userId: "user-1"))
        let feed = try await store.feed(id: "feed-1", userId: "user-1")
        XCTAssertEqual(feed?.title, "Example feed")

        _ = try await store.upsertFeedEntry(DataTestSupport.feedEntry(userId: "user-1"))
        let entries = try await store.listFeedEntries(userId: "user-1")
        XCTAssertEqual(entries.count, 1)

        // tombstone 逐实体独立，Feed 删除不影响其 entry（无 cascade relationship）
        let feedSoftDeleted = try await store.softDeleteFeed(id: "feed-1", userId: "user-1", version: 1, deletedAt: Date())
        XCTAssertTrue(feedSoftDeleted)
        let entriesAfterFeedDelete = try await store.listFeedEntries(userId: "user-1")
        XCTAssertEqual(entriesAfterFeedDelete.count, 1)
    }

    func testVersionMonotonicity() async throws {
        let (_, store) = try DataTestSupport.inMemoryStore()

        // 初次落地 v1
        let insertedV1 = try await store.upsertNote(DataTestSupport.note(version: 1, title: "v1"))
        XCTAssertNotNil(insertedV1)
        let noteAfterInsert = try await store.note(id: "note-1", userId: "user-1")
        XCTAssertEqual(noteAfterInsert?.version, 1)
        XCTAssertEqual(noteAfterInsert?.title, "v1")

        // 更高版本覆盖
        let updatedV3 = try await store.upsertNote(DataTestSupport.note(version: 3, title: "v3"))
        XCTAssertNotNil(updatedV3)
        let noteAfterUpdate = try await store.note(id: "note-1", userId: "user-1")
        XCTAssertEqual(noteAfterUpdate?.version, 3)
        XCTAssertEqual(noteAfterUpdate?.title, "v3")

        // 旧版本拒绝（不覆盖不回滚，保留 title）
        let rejected = try await store.upsertNote(DataTestSupport.note(version: 2, title: "v2-old"))
        XCTAssertNil(rejected)
        let noteAfterReject = try await store.note(id: "note-1", userId: "user-1")
        XCTAssertEqual(noteAfterReject?.version, 3)
        XCTAssertEqual(noteAfterReject?.title, "v3")

        // 同版本重放幂等：状态不变
        let replayed = try await store.upsertNote(DataTestSupport.note(version: 3, title: "v3"))
        XCTAssertNotNil(replayed)
        let noteAfterReplay = try await store.note(id: "note-1", userId: "user-1")
        XCTAssertEqual(noteAfterReplay?.version, 3)
        XCTAssertEqual(noteAfterReplay?.title, "v3")
    }

    func testAllFourEntityUpsertsAreVersionGuarded() async throws {
        let (_, store) = try DataTestSupport.inMemoryStore()

        _ = try await store.upsertClip(DataTestSupport.clip(version: 2, userId: "user-1"))
        let rejectedClip = try await store.upsertClip(DataTestSupport.clip(version: 1, userId: "user-1"))
        XCTAssertNil(rejectedClip)
        let clip = try await store.clip(id: "clip-1", userId: "user-1")
        XCTAssertEqual(clip?.version, 2)

        _ = try await store.upsertFeed(DataTestSupport.feed(version: 2, userId: "user-1"))
        let rejectedFeed = try await store.upsertFeed(DataTestSupport.feed(version: 1, userId: "user-1"))
        XCTAssertNil(rejectedFeed)
        let feed = try await store.feed(id: "feed-1", userId: "user-1")
        XCTAssertEqual(feed?.version, 2)

        _ = try await store.upsertFeedEntry(DataTestSupport.feedEntry(version: 2, userId: "user-1"))
        let rejectedEntry = try await store.upsertFeedEntry(DataTestSupport.feedEntry(version: 1, userId: "user-1"))
        XCTAssertNil(rejectedEntry)
        let entry = try await store.feedEntry(id: "entry-1", userId: "user-1")
        XCTAssertEqual(entry?.version, 2)
    }
}
