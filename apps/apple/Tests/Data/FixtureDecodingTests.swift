import Foundation
import XCTest

/// 消费仓库内 canonical `packages/sync/src/fixtures/` 的 pull fixtures（不复制第二份）。
/// - 验证 incremental / pagination / tombstone 三种 pull 可 decode；
/// - 验证毫秒 ISO-8601 解析与未知字段前向兼容；
/// - 验证 decode 后可按版本规则落库。
final class FixtureDecodingTests: XCTestCase {
    /// 从 test bundle 读取 canonical fixture（路径 = 测试 target 的 resources）。
    private func fixture(_ name: String) throws -> Data {
        guard let url = Bundle(for: Self.self).url(forResource: name, withExtension: "json") else {
            throw XCTSkip("fixture \(name).json not bundled")
        }
        return try Data(contentsOf: url)
    }

    func testDecodeIncrementalPull() throws {
        let jsonData = try fixture("pull-incremental")
        // 顶层是 description + requestEmpty + expectedResponse；真实响应在 expectedResponse。
        let top = try XCTUnwrap(JSONSerialization.jsonObject(with: jsonData) as? [String: Any])
        let responseData = try JSONSerialization.data(withJSONObject: top["expectedResponse"] as Any)
        let response = try JSONDecoder().decode(SyncPullResponseDTO.self, from: responseData)

        XCTAssertEqual(response.contractVersion, 1)
        XCTAssertFalse(response.hasMore)
        XCTAssertEqual(response.limit, 200)
        XCTAssertTrue(response.cursor.hasPrefix("mewmo-sync-v1:"))
        // cursor 与 nextCursor 别名一致
        XCTAssertEqual(response.cursor, response.nextCursor)

        // note 实体带业务字段
        let note = try XCTUnwrap(response.records.note.first)
        XCTAssertEqual(note.id, "note-1")
        XCTAssertEqual(note.userId, "user-1")
        XCTAssertEqual(note.title, "Morning notes")
        // 未知业务字段（decode 后 snapshot 映射仍成功）
        XCTAssertNotNil(note.snapshot())

        // feed 实体
        let feed = try XCTUnwrap(response.records.feed.first)
        XCTAssertEqual(feed.title, "Example feed")
        XCTAssertNotNil(feed.snapshot())
    }

    /// 从 fixture 顶层手动抽取 `expectedResponsePage1` 再解码（模拟真实分页第一页响应）。
    func testDecodePaginationResponsePage() throws {
        let jsonData = try fixture("pull-pagination")
        let top = try XCTUnwrap(JSONSerialization.jsonObject(with: jsonData) as? [String: Any])
        let pageData = try JSONSerialization.data(withJSONObject: top["expectedResponsePage1"] as Any)
        let response = try JSONDecoder().decode(SyncPullResponseDTO.self, from: pageData)

        XCTAssertTrue(response.hasMore)
        let notes = response.records.note
        XCTAssertEqual(notes.map(\.id), ["note-a", "note-b"])
    }

    func testDecodeTombstonesPull() throws {
        let json = try fixture("pull-tombstones")
        let top = try XCTUnwrap(JSONSerialization.jsonObject(with: json) as? [String: Any])
        let responseData = try JSONSerialization.data(withJSONObject: top["expectedResponse"] as Any)
        let response = try JSONDecoder().decode(SyncPullResponseDTO.self, from: responseData)

        let tomb = try XCTUnwrap(response.records.note.first)
        XCTAssertNotNil(tomb.deletedAt)
        XCTAssertNotNil(tomb.snapshot()?.deletedAt) // 毫秒日期正确解析为 Date
    }

    /// 未知字段前向兼容：额外字段不应导致 decode 失败。
    func testUnknownFieldsAreTolerated() throws {
        let json = """
        {
          "contractVersion": 1,
          "cursor": "mewmo-sync-v1:{}",
          "nextCursor": "mewmo-sync-v1:{}",
          "hasMore": false,
          "limit": 200,
          "records": {
            "note": [{
              "id": "n1", "version": 1,
              "createdAt": "2026-07-01T08:00:00Z",
              "updatedAt": "2026-07-01T08:00:00Z",
              "deletedAt": null,
              "userId": "u1",
              "title": "x",
              "futureField": { "a": 1 },
              "anotherUnknown": "ok"
            }],
            "clip": [], "feed": [], "feed_entry": []
          }
        }
        """
        let data = try XCTUnwrap(json.data(using: .utf8))
        let response = try JSONDecoder().decode(SyncPullResponseDTO.self, from: data)
        XCTAssertEqual(try XCTUnwrap(response.records.note.first).id, "n1")
    }

    func testMillisecondAndNonFractionalISO8601() throws {
        // 毫秒（withFractionalSeconds）
        XCTAssertNotNil(SyncISO8601.parse("2026-07-01T08:00:00.000Z"))
        // 无小数秒
        XCTAssertNotNil(SyncISO8601.parse("2026-07-01T08:00:00Z"))
        // 有小数秒但非 3 位
        XCTAssertNotNil(SyncISO8601.parse("2026-07-01T08:00:00.12345Z"))
        // 非法输入
        XCTAssertNil(SyncISO8601.parse("not-a-date"))
    }

    /// decode 后通过 `applyPull` 落库（ZOO-91 验收：fixtures 可 decode 并落库）。
    func testIncrementalFixtureLandsInStore() async throws {
        let (_, store) = try DataTestSupport.inMemoryStore()
        let jsonData = try fixture("pull-incremental")
        let top = try XCTUnwrap(JSONSerialization.jsonObject(with: jsonData) as? [String: Any])
        let responseData = try JSONSerialization.data(withJSONObject: top["expectedResponse"] as Any)
        let response = try JSONDecoder().decode(SyncPullResponseDTO.self, from: responseData)

        let result = try await store.applyPull(response)

        // incremental fixture 有 1 个 note + 1 个 feed
        XCTAssertEqual(result.notes, 1)
        XCTAssertEqual(result.feeds, 1)

        let note = try await store.note(id: "note-1", userId: "user-1")
        XCTAssertEqual(note?.title, "Morning notes")
        XCTAssertEqual(note?.version, 1)
        let feed = try await store.feed(id: "feed-1", userId: "user-1")
        XCTAssertEqual(feed?.title, "Example feed")
        XCTAssertEqual(feed?.version, 2)

        // 落库后 cursor 原样解析（客户端不解析/不重建 opaque composite cursor）
        XCTAssertTrue(response.cursor.hasPrefix("mewmo-sync-v1:"))
    }

    /// tombstone fixture 落库后为不可见 tombstone，但可显式读取（版本保留）。
    func testTombstoneFixtureLandsAsHiddenTombstone() async throws {
        let (_, store) = try DataTestSupport.inMemoryStore()
        let json = try fixture("pull-tombstones")
        let top = try XCTUnwrap(JSONSerialization.jsonObject(with: json) as? [String: Any])
        let responseData = try JSONSerialization.data(withJSONObject: top["expectedResponse"] as Any)
        let response = try JSONDecoder().decode(SyncPullResponseDTO.self, from: responseData)

        _ = try await store.applyPull(response)

        let visible = try await store.listNotes(userId: "user-1")
        XCTAssertEqual(visible.count, 0)
        let tomb = try await store.note(id: "note-deleted", userId: "user-1", includeDeleted: true)
        XCTAssertNotNil(tomb?.deletedAt)
        XCTAssertEqual(tomb?.version, 3)
    }
}
