import Foundation
import XCTest

final class MacContentStoreTests: XCTestCase {
    func testClipPaginationAndSearchUseLocalStore() async throws {
        let (_, store) = try DataTestSupport.inMemoryStore()
        for (id, title, time) in [
            ("clip-1", "First clip", 1.0),
            ("clip-2", "Second clip", 2.0),
            ("clip-3", "Third clip", 3.0),
        ] {
            var clip = DataTestSupport.clip(id: id)
            clip.title = title
            clip.updatedAt = Date(timeIntervalSince1970: time)
            _ = try await store.upsertClip(clip)
        }

        let content = await MainActor.run { MacContentStore(localStore: store, userId: "user-1", pageSize: 2) }
        await content.load()
        let firstPage = await MainActor.run { content.clips.map(\.id) }
        let hasMore = await MainActor.run { content.hasMoreClips }
        XCTAssertEqual(firstPage, ["clip-3", "clip-2"])
        XCTAssertTrue(hasMore)

        await content.loadMoreClips()
        let allClips = await MainActor.run { content.clips.map(\.id) }
        XCTAssertEqual(allClips, ["clip-3", "clip-2", "clip-1"])

        await content.updateClipSearch("third")
        let searchedClips = await MainActor.run { content.filteredClips.map(\.id) }
        XCTAssertEqual(searchedClips, ["clip-3"])
    }

    func testDeletingSelectedClipWritesTombstoneAndCanonicalOutboxMutation() async throws {
        let (_, store) = try DataTestSupport.inMemoryStore()
        let clip = DataTestSupport.clip(id: "clip-delete", version: 7)
        _ = try await store.upsertClip(clip)

        let content = await MainActor.run { MacContentStore(localStore: store, userId: "user-1") }
        await content.load()
        await content.deleteSelectedClip()

        let deleted = try await store.clip(id: clip.id, userId: "user-1")
        XCTAssertNotNil(deleted?.deletedAt)
        let isEmpty = await MainActor.run { content.clips.isEmpty }
        XCTAssertTrue(isEmpty)

        let pending = try await store.listPendingMutations(userId: "user-1")
        let mutation = try XCTUnwrap(pending.first)
        let payload = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(mutation.payloadJSON.utf8)) as? [String: Any])
        XCTAssertEqual(mutation.entityKind, "clip")
        XCTAssertEqual(mutation.op, "delete")
        XCTAssertEqual(mutation.expectedVersion, 7)
        XCTAssertEqual(payload["id"] as? String, clip.id)
        XCTAssertEqual((payload["data"] as? [String: Any])?["expectedVersion"] as? Int, 7)
    }

    func testFeedSelectionPaginatesEntriesAndProjectsFreshSyncState() async throws {
        let (_, store) = try DataTestSupport.inMemoryStore()
        var feedA = DataTestSupport.feed(id: "feed-a")
        feedA.updatedAt = Date(timeIntervalSince1970: 1)
        var feedB = DataTestSupport.feed(id: "feed-b")
        feedB.updatedAt = Date(timeIntervalSince1970: 2)
        _ = try await store.upsertFeed(feedA)
        _ = try await store.upsertFeed(feedB)

        for id in ["entry-1", "entry-2"] {
            var entry = DataTestSupport.feedEntry(id: id, feedId: "feed-b")
            entry.updatedAt = Date(timeIntervalSince1970: id == "entry-1" ? 1 : 2)
            _ = try await store.upsertFeedEntry(entry)
        }
        _ = try await store.saveSyncState(
            SyncStateSnapshot(scope: "pull", contractVersion: 1, cursor: "cursor", userId: "user-1", updatedAt: Date())
        )

        let content = await MainActor.run { MacContentStore(localStore: store, userId: "user-1", pageSize: 1) }
        await content.load()
        await content.selectFeed("feed-b")

        let selectedFeedID = await MainActor.run { content.selectedFeedID }
        let selectedEntryID = await MainActor.run { content.selectedEntryID }
        let firstEntryPage = await MainActor.run { content.entries.map(\.id) }
        let hasMoreEntries = await MainActor.run { content.hasMoreEntries }
        let isStale = await MainActor.run { content.isStale }
        XCTAssertEqual(selectedFeedID, "feed-b")
        XCTAssertNil(selectedEntryID)
        XCTAssertEqual(firstEntryPage, ["entry-2"])
        XCTAssertTrue(hasMoreEntries)
        XCTAssertFalse(isStale)

        await content.loadMoreEntries()
        let allEntries = await MainActor.run { content.entries.map(\.id) }
        XCTAssertEqual(allEntries, ["entry-2", "entry-1"])
    }
}
