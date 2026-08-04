import Foundation
import XCTest

final class MacNoteMutationsTests: XCTestCase {
    func testCreateUpdateDeleteAreLocalFirstAndQueueCanonicalMutations() async throws {
        let (_, store) = try DataTestSupport.inMemoryStore()
        let created = try await MacNoteMutations.create(store: store, userId: "user-1", title: "Draft")
        let updated = try await MacNoteMutations.update(
            store: store, note: created, title: "Edited", content: "# Markdown", pinned: true
        )
        try await MacNoteMutations.delete(store: store, note: updated)

        let visibleNotes = try await store.listNotes(userId: "user-1")
        XCTAssertEqual(visibleNotes, [])
        let tombstone = try await store.note(id: created.id, userId: "user-1")
        XCTAssertNotNil(tombstone?.deletedAt)

        let mutations = try await store.listPendingMutations(userId: "user-1")
        XCTAssertEqual(mutations.map(\.op), ["create", "update", "delete"])
        XCTAssertTrue(mutations.allSatisfy { $0.entityKind == "note" })
        XCTAssertTrue(mutations.allSatisfy { $0.payloadJSON.contains("clientMutationId") })
        XCTAssertTrue(mutations[1].payloadJSON.contains("expectedVersion"))
    }
}
