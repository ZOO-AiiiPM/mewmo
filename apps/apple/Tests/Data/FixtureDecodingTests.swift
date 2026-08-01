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

    /// ZOO-114: 服务器 pull 返回完整 Prisma camelCase 记录，Clip/Feed 全字段
    /// DTO→snapshot→落库→snapshot round-trip 均不丢字段。
    func testFullClipAndFeedFieldsDecodeAndLandInStore() async throws {
        let (_, store) = try DataTestSupport.inMemoryStore()
        let json = """
        {
          "contractVersion": 1,
          "cursor": "",
          "nextCursor": "",
          "hasMore": false,
          "limit": 200,
          "records": {
            "note": [],
            "clip": [{
              "id": "clip-full",
              "version": 3,
              "url": "https://example.com/x",
              "normalizedUrl": "https://example.com/x",
              "title": "Full clip",
              "content": "body",
              "favicon": "https://example.com/f.ico",
              "coverImage": "https://example.com/c.jpg",
              "excerpt": "ex",
              "sourceName": "src",
              "author": "au",
              "publishedAt": "2026-07-01T01:00:00.000Z",
              "fetchStatus": "success",
              "fetchError": null,
              "fetchStartedAt": "2026-07-01T00:50:00.000Z",
              "fetchedAt": "2026-07-01T01:00:00.000Z",
              "createdAt": "2026-07-01T00:00:00.000Z",
              "updatedAt": "2026-07-01T01:00:00.000Z",
              "deletedAt": null,
              "userId": "user-1"
            }],
            "feed": [{
              "id": "feed-full",
              "version": 2,
              "url": "https://example.com/feed.xml",
              "type": "article",
              "title": "Full feed",
              "description": "desc",
              "favicon": "https://example.com/f.ico",
              "refreshInterval": 7200,
              "lastFetchStartedAt": "2026-07-03T12:10:00.000Z",
              "lastFetchStatus": "success",
              "lastFetchError": null,
              "lastFetchCount": 5,
              "lastFetchedAt": "2026-07-03T12:30:00.000Z",
              "lastSeenEntryUrl": "https://example.com/last",
              "createdAt": "2026-07-02T08:00:00.000Z",
              "updatedAt": "2026-07-03T12:30:00.000Z",
              "deletedAt": null,
              "userId": "user-1"
            }],
            "feed_entry": []
          }
        }
        """
        let data = try XCTUnwrap(json.data(using: .utf8))
        let response = try JSONDecoder().decode(SyncPullResponseDTO.self, from: data)

        // DTO decode → snapshot 完整
        let clipDTO = try XCTUnwrap(response.records.clip.first)
        XCTAssertEqual(clipDTO.normalizedUrl, "https://example.com/x")
        XCTAssertEqual(clipDTO.fetchStatus, "success")
        XCTAssertEqual(clipDTO.fetchStartedAt, "2026-07-01T00:50:00.000Z")
        let clipSnap = clipDTO.snapshot()
        XCTAssertEqual(clipSnap.normalizedURL, "https://example.com/x")
        XCTAssertEqual(clipSnap.faviconURL, "https://example.com/f.ico")
        XCTAssertEqual(clipSnap.fetchStartedAt, DataTestSupport.iso("2026-07-01T00:50:00.000Z"))
        XCTAssertEqual(clipSnap.fetchedAt, DataTestSupport.iso("2026-07-01T01:00:00.000Z"))

        let feedDTO = try XCTUnwrap(response.records.feed.first)
        let feedSnap = feedDTO.snapshot()
        XCTAssertEqual(feedSnap.faviconURL, "https://example.com/f.ico")
        XCTAssertEqual(feedSnap.refreshInterval, 7200)
        XCTAssertEqual(feedSnap.lastFetchStatus, "success")
        XCTAssertEqual(feedSnap.lastFetchCount, 5)
        XCTAssertEqual(feedSnap.lastFetchedAt, DataTestSupport.iso("2026-07-03T12:30:00.000Z"))
        XCTAssertEqual(feedSnap.lastSeenEntryURL, "https://example.com/last")

        // 落库 round-trip 完整
        _ = try await store.applyPull(response)
        let storedClip = try await store.clip(id: "clip-full", userId: "user-1")
        XCTAssertEqual(storedClip?.normalizedURL, "https://example.com/x")
        XCTAssertEqual(storedClip?.fetchStatus, "success")
        XCTAssertEqual(storedClip?.fetchStartedAt, DataTestSupport.iso("2026-07-01T00:50:00.000Z"))
        XCTAssertEqual(storedClip?.fetchedAt, DataTestSupport.iso("2026-07-01T01:00:00.000Z"))

        let storedFeed = try await store.feed(id: "feed-full", userId: "user-1")
        XCTAssertEqual(storedFeed?.faviconURL, "https://example.com/f.ico")
        XCTAssertEqual(storedFeed?.refreshInterval, 7200)
        XCTAssertEqual(storedFeed?.lastFetchStartedAt, DataTestSupport.iso("2026-07-03T12:10:00.000Z"))
        XCTAssertEqual(storedFeed?.lastFetchStatus, "success")
        XCTAssertEqual(storedFeed?.lastFetchCount, 5)
        XCTAssertEqual(storedFeed?.lastFetchedAt, DataTestSupport.iso("2026-07-03T12:30:00.000Z"))
        XCTAssertEqual(storedFeed?.lastSeenEntryURL, "https://example.com/last")
    }
}
