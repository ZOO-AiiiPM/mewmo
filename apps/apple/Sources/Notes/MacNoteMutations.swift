import Foundation

/// Local-first note commands. Persistence and FIFO delivery remain owned by LocalStore.
public enum MacNoteMutations {
    @discardableResult
    public static func create(store: LocalStore, userId: String, title: String = "Untitled") async throws -> NoteSnapshot {
        let now = Date()
        let id = UUID().uuidString
        let note = NoteSnapshot(
            id: id,
            version: 0,
            slug: "local-\(id)",
            title: title.isEmpty ? "Untitled" : title,
            userId: userId,
            createdAt: now,
            updatedAt: now
        )
        _ = try await store.upsertNote(note)
        try await enqueue(store: store, note: note, op: "create", expectedVersion: 0)
        return note
    }

    @discardableResult
    public static func update(
        store: LocalStore,
        note: NoteSnapshot,
        title: String,
        content: String,
        pinned: Bool
    ) async throws -> NoteSnapshot {
        var changed = note
        changed.title = title.isEmpty ? "Untitled" : title
        changed.content = content
        changed.pinned = pinned
        changed.updatedAt = Date()
        _ = try await store.upsertNote(changed)
        try await enqueue(store: store, note: changed, op: "update", expectedVersion: note.version)
        return changed
    }

    public static func delete(store: LocalStore, note: NoteSnapshot) async throws {
        let deletedAt = Date()
        guard try await store.softDeleteNote(
            id: note.id,
            userId: note.userId,
            version: note.version,
            deletedAt: deletedAt
        ) else {
            throw LocalStoreError.objectNotFound(note.id)
        }
        var tombstone = note
        tombstone.deletedAt = deletedAt
        tombstone.updatedAt = deletedAt
        try await enqueue(store: store, note: tombstone, op: "delete", expectedVersion: note.version)
    }

    private static func enqueue(
        store: LocalStore,
        note: NoteSnapshot,
        op: String,
        expectedVersion: Int
    ) async throws {
        let mutationID = UUID().uuidString
        let payload = NoteWireMutation(
            op: op,
            id: note.id,
            data: NoteWireData(note: note, expectedVersion: op == "create" ? nil : expectedVersion),
            clientMutationId: mutationID
        )
        let payloadJSON = String(decoding: try JSONEncoder().encode(payload), as: UTF8.self)
        _ = try await store.enqueueMutation(
            mutationId: mutationID,
            entityKind: "note",
            op: op,
            expectedVersion: expectedVersion,
            payloadJSON: payloadJSON,
            userId: note.userId
        )
    }
}

private struct NoteWireMutation: Encodable {
    let entity = "note"
    let op: String
    let id: String
    let data: NoteWireData
    let clientMutationId: String
}

private struct NoteWireData: Encodable {
    let title: String?
    let content: String?
    let pinned: Bool?
    let expectedVersion: Int?

    init(note: NoteSnapshot, expectedVersion: Int?) {
        self.expectedVersion = expectedVersion
        if expectedVersion == nil {
            title = note.title
            content = note.content
            pinned = note.pinned
        } else if note.deletedAt != nil {
            title = nil
            content = nil
            pinned = nil
        } else {
            title = note.title
            content = note.content
            pinned = note.pinned
        }
    }
}
