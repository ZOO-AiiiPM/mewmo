import Foundation
import SwiftData
import XCTest

/// 测试辅助：提供 in-memory / 临时磁盘容器，并封装 `LocalStore` 的同步调用。
///
/// 由于 `LocalStore` 是 actor，测试里大量 `await store.upsert(...)` 直接穿透 actor 边界。
/// 本 helper 只为收敛「建容器 + 建 actor」的样板。
enum DataTestSupport {
    static func inMemoryStore() throws -> (ModelContainer, LocalStore) {
        let container = try LocalDataContainer.inMemory()
        let store = try LocalStore(modelContainer: container)
        return (container, store)
    }

    static func temporaryDiskStore(directory: URL) throws -> (ModelContainer, LocalStore) {
        let container = try LocalDataContainer.temporaryDisk(directory: directory)
        let store = try LocalStore(modelContainer: container)
        return (container, store)
    }

    /// 构造一条典型 note snapshot。
    static func note(
        id: String = "note-1",
        version: Int = 1,
        userId: String = "user-1",
        title: String = "Morning notes",
        slug: String = "morning-notes",
        deletedAt: Date? = nil,
        updatedAt: Date = iso("2026-07-03T10:30:00.000Z")
    ) -> NoteSnapshot {
        NoteSnapshot(
            id: id,
            version: version,
            slug: slug,
            title: title,
            content: "# Hi",
            pinned: false,
            userId: userId,
            createdAt: iso("2026-07-01T08:00:00.000Z"),
            updatedAt: updatedAt,
            deletedAt: deletedAt
        )
    }

    static func clip(
        id: String = "clip-1",
        version: Int = 1,
        userId: String = "user-1",
        updatedAt: Date = iso("2026-07-01T00:00:00.000Z")
    ) -> ClipSnapshot {
        ClipSnapshot(
            id: id, version: version, url: "https://example.com/a",
            normalizedURL: "https://example.com/a",
            title: "Clip title", content: "body",
            faviconURL: "https://example.com/favicon.ico",
            coverImageURL: "https://example.com/cover.jpg",
            excerpt: "excerpt",
            sourceName: "source",
            author: "author",
            publishedAt: iso("2026-07-01T01:00:00.000Z"),
            fetchStatus: "fetched",
            fetchError: nil,
            fetchStartedAt: iso("2026-07-01T00:50:00.000Z"),
            fetchedAt: iso("2026-07-01T01:00:00.000Z"),
            userId: userId,
            createdAt: iso("2026-07-01T00:00:00.000Z"),
            updatedAt: updatedAt
        )
    }

    static func feed(
        id: String = "feed-1",
        version: Int = 1,
        userId: String = "user-1",
        updatedAt: Date = iso("2026-07-03T12:30:00.000Z")
    ) -> FeedSnapshot {
        FeedSnapshot(
            id: id, version: version, url: "https://example.com/feed.xml",
            type: "article", title: "Example feed",
            feedDescription: "desc", faviconURL: "https://example.com/favicon.ico",
            refreshInterval: 7200,
            lastFetchStartedAt: iso("2026-07-03T12:10:00.000Z"),
            lastFetchStatus: "success",
            lastFetchError: nil,
            lastFetchCount: 5,
            lastFetchedAt: iso("2026-07-03T12:30:00.000Z"),
            lastSeenEntryURL: "https://example.com/last",
            userId: userId,
            createdAt: iso("2026-07-02T08:00:00.000Z"),
            updatedAt: updatedAt
        )
    }

    static func feedEntry(id: String = "entry-1", version: Int = 1, userId: String = "user-1", feedId: String = "feed-1") -> FeedEntrySnapshot {
        FeedEntrySnapshot(
            id: id, version: version, feedId: feedId, title: "Entry", url: "https://example.com/1",
            userId: userId, createdAt: iso("2026-07-02T09:00:00.000Z"),
            updatedAt: iso("2026-07-02T09:00:00.000Z")
        )
    }

    static func iso(_ value: String) -> Date {
        SyncISO8601.parse(value) ?? Date(timeIntervalSince1970: 0)
    }
}
