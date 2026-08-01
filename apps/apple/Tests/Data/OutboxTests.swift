import Foundation
import XCTest

/// Durable outbox 原语：FIFO、精确 ack、幂等入队与重开持久性（不做网络 push/retry）。
final class OutboxTests: XCTestCase {
    func testOutboxFIFOOrdering() async throws {
        let (_, store) = try DataTestSupport.inMemoryStore()
        let user = "user-1"

        let first = try await store.enqueueMutation(mutationId: "m1", entityKind: "note", op: "create", expectedVersion: 0, payloadJSON: "1", userId: user)
        _ = try await store.enqueueMutation(mutationId: "m2", entityKind: "clip", op: "update", expectedVersion: 3, payloadJSON: "2", userId: user)
        let third = try await store.enqueueMutation(mutationId: "m3", entityKind: "feed", op: "delete", expectedVersion: 7, payloadJSON: "3", userId: user)

        XCTAssertEqual(first.seq, 1)
        XCTAssertEqual(third.seq, 3)

        let pending = try await store.listPendingMutations(userId: user)
        XCTAssertEqual(pending.map(\.mutationId), ["m1", "m2", "m3"]) // FIFO oldest-first
        XCTAssertEqual(pending.map(\.seq), [1, 2, 3])
        XCTAssertEqual(pending.map(\.op), ["create", "update", "delete"])
    }

    func testOutboxIdempotentEnqueue() async throws {
        let (_, store) = try DataTestSupport.inMemoryStore()
        let user = "user-1"

        let a = try await store.enqueueMutation(mutationId: "same", entityKind: "note", op: "create", expectedVersion: 0, payloadJSON: "{}", userId: user)
        let b = try await store.enqueueMutation(mutationId: "same", entityKind: "note", op: "create", expectedVersion: 0, payloadJSON: "{}", userId: user)

        // 同 mutationId 幂等：只入队一次
        XCTAssertEqual(a.seq, 1)
        XCTAssertEqual(b.seq, a.seq)
        let count = try await store.listPendingMutations(userId: user).count
        XCTAssertEqual(count, 1)
    }

    func testOutboxAckExactDeletion() async throws {
        let (_, store) = try DataTestSupport.inMemoryStore()
        let user = "user-1"

        _ = try await store.enqueueMutation(mutationId: "m1", entityKind: "note", op: "create", expectedVersion: 0, payloadJSON: "{}", userId: user)
        _ = try await store.enqueueMutation(mutationId: "m2", entityKind: "clip", op: "update", expectedVersion: 0, payloadJSON: "{}", userId: user)

        // ack 中间一条：精确删除，其余保留、顺序稳定
        let acked = try await store.ackMutation(mutationId: "m1", userId: user)
        XCTAssertTrue(acked)
        let remaining = try await store.listPendingMutations(userId: user)
        XCTAssertEqual(remaining.map(\.mutationId), ["m2"])

        // 重复 ack 已删除的返回 false
        let doubleAck = try await store.ackMutation(mutationId: "m1", userId: user)
        XCTAssertFalse(doubleAck)
    }

    func testOutboxSurvivesReopenOnDisk() async throws {
        let directory = FileManager.default
            .temporaryDirectory
            .appendingPathComponent("mewmo-outbox-\(UUID().uuidString)", isDirectory: true)
        defer {
            try? FileManager.default.removeItem(at: directory)
        }

        do {
            let (_, store) = try DataTestSupport.temporaryDiskStore(directory: directory)
            _ = try await store.enqueueMutation(mutationId: "m1", entityKind: "note", op: "create", expectedVersion: 0, payloadJSON: "{}", userId: "user-1")
            _ = try await store.enqueueMutation(mutationId: "m2", entityKind: "feed", op: "update", expectedVersion: 9, payloadJSON: "{}", userId: "user-1")
        }

        let (_, reopened) = try DataTestSupport.temporaryDiskStore(directory: directory)
        let pending = try await reopened.listPendingMutations(userId: "user-1")
        XCTAssertEqual(pending.map(\.mutationId), ["m1", "m2"])
        XCTAssertEqual(pending.map(\.seq), [1, 2])
        XCTAssertEqual(pending[1].expectedVersion, 9)

        // ack 后重开仍生效
        _ = try await reopened.ackMutation(mutationId: "m1", userId: "user-1")
        let (_, reopened2) = try DataTestSupport.temporaryDiskStore(directory: directory)
        let afterReopen = try await reopened2.listPendingMutations(userId: "user-1")
        XCTAssertEqual(afterReopen.map(\.mutationId), ["m2"])
    }
}
