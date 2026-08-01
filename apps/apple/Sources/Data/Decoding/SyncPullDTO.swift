import Foundation

// MARK: - Canonical pull fixture DTOs (ZOO-89 → ZOO-91)
//
// 直接消费 `packages/sync/src/fixtures/pull-*.json`（仓库内单一副本，不复制）。
// 这类 struct 只负责把平台无关 JSON 解码成可落库的 snapshot 输入：
// - 未知 JSON 字段被 Codable 默认忽略 → 前向兼容；
// - 业务字段大多可选（tombstone fixture 只有公共字段）；
// - 日期接受毫秒/非毫秒 ISO-8601。
//
// 注意：这里不是 sync contract 的“真相源”。`packages/sync/src/protocol.ts` 才是。
// 本文件只是客户端解码映射，字段语义以协议为准。

/// 兼容 `createdAt/updatedAt/deletedAt` 毫秒 ISO-8601（如 `2026-07-01T08:00:00.000Z`）。
public enum SyncISO8601 {
    /// 宽松解析：支持 `FractionalSeconds` 与无小数两种 ISO-8601，失败返回 nil。
    public static func parse(_ string: String) -> Date? {
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = iso.date(from: string) {
            return date
        }
        let noFraction = ISO8601DateFormatter()
        noFraction.formatOptions = [.withInternetDateTime]
        return noFraction.date(from: string)
    }
}

/// Pull response 顶层结构（对应 sync `SyncPullResponse<TRecord>`）。
public struct SyncPullResponseDTO: Decodable, Sendable {
    public var contractVersion: Int
    public var cursor: String
    public var nextCursor: String
    public var hasMore: Bool
    public var limit: Int
    public var records: PullRecordsDTO

    enum CodingKeys: String, CodingKey {
        case contractVersion
        case cursor
        case nextCursor
        case hasMore
        case limit
        case records
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        contractVersion = (try? c.decodeIfPresent(Int.self, forKey: .contractVersion)) ?? 1
        // `cursor` 与 `nextCursor` 是别名；两者都缺时回退为空串（表示无游标，全量同步）。
        let decodedCursor = try? c.decodeIfPresent(String.self, forKey: .cursor)
        let decodedNext = try? c.decodeIfPresent(String.self, forKey: .nextCursor)
        cursor = decodedCursor ?? decodedNext ?? ""
        nextCursor = decodedNext ?? decodedCursor ?? ""
        hasMore = (try? c.decodeIfPresent(Bool.self, forKey: .hasMore)) ?? false
        limit = (try? c.decodeIfPresent(Int.self, forKey: .limit)) ?? 200
        records = try c.decode(PullRecordsDTO.self, forKey: .records)
    }
}

public struct PullRecordsDTO: Decodable, Sendable {
    public var note: [NotePullDTO]
    public var clip: [ClipPullDTO]
    public var feed: [FeedPullDTO]
    public var feed_entry: [FeedEntryPullDTO]
}

// MARK: - Per-entity DTOs
//
// 公共字段（id/version/createdAt/updatedAt/deletedAt/userId）为必需；
// 业务字段全部可选，兼容 tombstone / 精简 fixture。未知字段自动忽略。

public struct NotePullDTO: Decodable, Sendable {
    public var id: String
    public var version: Int
    public var createdAt: String
    public var updatedAt: String
    public var deletedAt: String?
    public var userId: String
    public var slug: String?
    public var title: String?
    public var content: String?
    public var summary: String?
    public var pinned: Bool?

    public func snapshot() -> NoteSnapshot? {
        // 业务字段允许缺失（tombstone fixture 只有公共字段）：缺省回退。
        NoteSnapshot(
            id: id,
            version: version,
            slug: slug ?? id,
            title: title ?? "",
            content: content ?? "",
            summary: summary,
            pinned: pinned ?? false,
            userId: userId,
            createdAt: SyncISO8601.parse(createdAt) ?? Date(timeIntervalSince1970: 0),
            updatedAt: SyncISO8601.parse(updatedAt) ?? Date(timeIntervalSince1970: 0),
            deletedAt: deletedAt.flatMap(SyncISO8601.parse)
        )
    }
}

public struct ClipPullDTO: Decodable, Sendable {
    public var id: String
    public var version: Int
    public var createdAt: String
    public var updatedAt: String
    public var deletedAt: String?
    public var userId: String
    public var url: String?
    public var title: String?
    public var content: String?
    public var summary: String?
    public var favicon: String?
    public var coverImage: String?
    public var excerpt: String?
    public var sourceName: String?
    public var author: String?
    public var publishedAt: String?

    public func snapshot() -> ClipSnapshot {
        ClipSnapshot(
            id: id,
            version: version,
            url: url ?? "",
            title: title ?? "",
            content: content ?? "",
            summary: summary,
            faviconURL: favicon,
            coverImageURL: coverImage,
            excerpt: excerpt,
            sourceName: sourceName,
            author: author,
            publishedAt: publishedAt.flatMap(SyncISO8601.parse),
            userId: userId,
            createdAt: SyncISO8601.parse(createdAt) ?? Date(timeIntervalSince1970: 0),
            updatedAt: SyncISO8601.parse(updatedAt) ?? Date(timeIntervalSince1970: 0),
            deletedAt: deletedAt.flatMap(SyncISO8601.parse)
        )
    }
}

public struct FeedPullDTO: Decodable, Sendable {
    public var id: String
    public var version: Int
    public var createdAt: String
    public var updatedAt: String
    public var deletedAt: String?
    public var userId: String
    public var url: String?
    public var type: String?
    public var title: String?
    public var description: String?

    @available(*, deprecated, message: "use description")
    public var feedDescription: String? { description }

    public func snapshot() -> FeedSnapshot {
        FeedSnapshot(
            id: id,
            version: version,
            url: url ?? "",
            type: type ?? "article",
            title: title ?? "",
            feedDescription: description,
            userId: userId,
            createdAt: SyncISO8601.parse(createdAt) ?? Date(timeIntervalSince1970: 0),
            updatedAt: SyncISO8601.parse(updatedAt) ?? Date(timeIntervalSince1970: 0),
            deletedAt: deletedAt.flatMap(SyncISO8601.parse)
        )
    }
}

public struct FeedEntryPullDTO: Decodable, Sendable {
    public var id: String
    public var version: Int
    public var createdAt: String
    public var updatedAt: String
    public var deletedAt: String?
    public var userId: String
    public var feedId: String?
    public var title: String?
    public var url: String?
    public var content: String?
    public var summary: String?
    public var coverImage: String?
    public var excerpt: String?
    public var sourceName: String?
    public var author: String?
    public var publishedAt: String?
    public var readAt: String?

    public func snapshot() -> FeedEntrySnapshot {
        FeedEntrySnapshot(
            id: id,
            version: version,
            feedId: feedId ?? "",
            title: title ?? "",
            url: url ?? "",
            content: content ?? "",
            summary: summary,
            coverImageURL: coverImage,
            excerpt: excerpt,
            sourceName: sourceName,
            author: author,
            publishedAt: publishedAt.flatMap(SyncISO8601.parse),
            readAt: readAt.flatMap(SyncISO8601.parse),
            userId: userId,
            createdAt: SyncISO8601.parse(createdAt) ?? Date(timeIntervalSince1970: 0),
            updatedAt: SyncISO8601.parse(updatedAt) ?? Date(timeIntervalSince1970: 0),
            deletedAt: deletedAt.flatMap(SyncISO8601.parse)
        )
    }
}
