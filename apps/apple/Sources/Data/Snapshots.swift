import Foundation

// MARK: - Sendable value snapshots
//
// `@Model` 对象不是 Sendable，绝不能跨 actor 泄漏。`LocalStore` 只在接口边界返回
// 下列 `Sendable` struct；UI / SyncEngine 只能消费这些 snapshot。所有字段为 let，
// 天然满足 `Sendable`（Foundation 的按值语义类型如 String/Date/Data/URL 不可变拷贝）。

/// 四类同步实体的公共标识字段。
public struct SyncIdentitySnapshot: Sendable, Equatable {
    public var id: String
    public var version: Int
    public var createdAt: Date
    public var updatedAt: Date
    public var deletedAt: Date?
    public var userId: String

    public init(
        id: String,
        version: Int,
        createdAt: Date,
        updatedAt: Date,
        deletedAt: Date? = nil,
        userId: String
    ) {
        self.id = id
        self.version = version
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.deletedAt = deletedAt
        self.userId = userId
    }
}

public struct NoteSnapshot: Sendable, Equatable {
    public var id: String
    public var version: Int
    public var slug: String
    public var title: String
    public var content: String
    public var summary: String?
    public var pinned: Bool
    public var userId: String
    public var createdAt: Date
    public var updatedAt: Date
    public var deletedAt: Date?

    public init(
        id: String,
        version: Int,
        slug: String,
        title: String,
        content: String = "",
        summary: String? = nil,
        pinned: Bool = false,
        userId: String,
        createdAt: Date,
        updatedAt: Date,
        deletedAt: Date? = nil
    ) {
        self.id = id
        self.version = version
        self.slug = slug
        self.title = title
        self.content = content
        self.summary = summary
        self.pinned = pinned
        self.userId = userId
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.deletedAt = deletedAt
    }
}

public struct ClipSnapshot: Sendable, Equatable {
    public var id: String
    public var version: Int
    public var url: String
    public var normalizedURL: String?
    public var title: String
    public var content: String
    public var summary: String?
    public var faviconURL: String?
    public var coverImageURL: String?
    public var excerpt: String?
    public var sourceName: String?
    public var author: String?
    public var publishedAt: Date?
    public var fetchStatus: String
    public var fetchError: String?
    public var fetchStartedAt: Date?
    public var fetchedAt: Date?
    public var userId: String
    public var createdAt: Date
    public var updatedAt: Date
    public var deletedAt: Date?

    public init(
        id: String,
        version: Int,
        url: String,
        normalizedURL: String? = nil,
        title: String,
        content: String = "",
        summary: String? = nil,
        faviconURL: String? = nil,
        coverImageURL: String? = nil,
        excerpt: String? = nil,
        sourceName: String? = nil,
        author: String? = nil,
        publishedAt: Date? = nil,
        fetchStatus: String = "idle",
        fetchError: String? = nil,
        fetchStartedAt: Date? = nil,
        fetchedAt: Date? = nil,
        userId: String,
        createdAt: Date,
        updatedAt: Date,
        deletedAt: Date? = nil
    ) {
        self.id = id
        self.version = version
        self.url = url
        self.normalizedURL = normalizedURL
        self.title = title
        self.content = content
        self.summary = summary
        self.faviconURL = faviconURL
        self.coverImageURL = coverImageURL
        self.excerpt = excerpt
        self.sourceName = sourceName
        self.author = author
        self.publishedAt = publishedAt
        self.fetchStatus = fetchStatus
        self.fetchError = fetchError
        self.fetchStartedAt = fetchStartedAt
        self.fetchedAt = fetchedAt
        self.userId = userId
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.deletedAt = deletedAt
    }

    public var identity: SyncIdentitySnapshot {
        SyncIdentitySnapshot(
            id: id, version: version, createdAt: createdAt,
            updatedAt: updatedAt, deletedAt: deletedAt, userId: userId)
    }
}

public struct FeedSnapshot: Sendable, Equatable {
    public var id: String
    public var version: Int
    public var url: String
    public var type: String
    public var title: String
    public var feedDescription: String?
    public var faviconURL: String?
    public var refreshInterval: Int
    public var lastFetchStartedAt: Date?
    public var lastFetchStatus: String
    public var lastFetchError: String?
    public var lastFetchCount: Int
    public var lastFetchedAt: Date?
    public var lastSeenEntryURL: String?
    public var userId: String
    public var createdAt: Date
    public var updatedAt: Date
    public var deletedAt: Date?

    public init(
        id: String,
        version: Int,
        url: String,
        type: String = "article",
        title: String,
        feedDescription: String? = nil,
        faviconURL: String? = nil,
        refreshInterval: Int = 3600,
        lastFetchStartedAt: Date? = nil,
        lastFetchStatus: String = "idle",
        lastFetchError: String? = nil,
        lastFetchCount: Int = 0,
        lastFetchedAt: Date? = nil,
        lastSeenEntryURL: String? = nil,
        userId: String,
        createdAt: Date,
        updatedAt: Date,
        deletedAt: Date? = nil
    ) {
        self.id = id
        self.version = version
        self.url = url
        self.type = type
        self.title = title
        self.feedDescription = feedDescription
        self.faviconURL = faviconURL
        self.refreshInterval = refreshInterval
        self.lastFetchStartedAt = lastFetchStartedAt
        self.lastFetchStatus = lastFetchStatus
        self.lastFetchError = lastFetchError
        self.lastFetchCount = lastFetchCount
        self.lastFetchedAt = lastFetchedAt
        self.lastSeenEntryURL = lastSeenEntryURL
        self.userId = userId
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.deletedAt = deletedAt
    }

    public var identity: SyncIdentitySnapshot {
        SyncIdentitySnapshot(
            id: id, version: version, createdAt: createdAt,
            updatedAt: updatedAt, deletedAt: deletedAt, userId: userId)
    }
}

public struct FeedEntrySnapshot: Sendable, Equatable {
    public var id: String
    public var version: Int
    public var feedId: String
    public var title: String
    public var url: String
    public var content: String
    public var summary: String?
    public var coverImageURL: String?
    public var excerpt: String?
    public var sourceName: String?
    public var author: String?
    public var publishedAt: Date?
    public var readAt: Date?
    public var userId: String
    public var createdAt: Date
    public var updatedAt: Date
    public var deletedAt: Date?

    public init(
        id: String,
        version: Int,
        feedId: String,
        title: String,
        url: String,
        content: String = "",
        summary: String? = nil,
        coverImageURL: String? = nil,
        excerpt: String? = nil,
        sourceName: String? = nil,
        author: String? = nil,
        publishedAt: Date? = nil,
        readAt: Date? = nil,
        userId: String,
        createdAt: Date,
        updatedAt: Date,
        deletedAt: Date? = nil
    ) {
        self.id = id
        self.version = version
        self.feedId = feedId
        self.title = title
        self.url = url
        self.content = content
        self.summary = summary
        self.coverImageURL = coverImageURL
        self.excerpt = excerpt
        self.sourceName = sourceName
        self.author = author
        self.publishedAt = publishedAt
        self.readAt = readAt
        self.userId = userId
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.deletedAt = deletedAt
    }

    public var identity: SyncIdentitySnapshot {
        SyncIdentitySnapshot(
            id: id, version: version, createdAt: createdAt,
            updatedAt: updatedAt, deletedAt: deletedAt, userId: userId)
    }
}

public struct SyncStateSnapshot: Sendable, Equatable {
    public var scope: String
    public var contractVersion: Int
    public var cursor: String?
    public var userId: String
    public var updatedAt: Date

    public init(
        scope: String,
        contractVersion: Int,
        cursor: String?,
        userId: String,
        updatedAt: Date = .init()
    ) {
        self.scope = scope
        self.contractVersion = contractVersion
        self.cursor = cursor
        self.userId = userId
        self.updatedAt = updatedAt
    }
}

public struct PendingMutationSnapshot: Sendable, Equatable {
    public var mutationId: String
    /// 每用户递增，决定 FIFO 顺序。
    public var seq: Int
    public var entityKind: String
    public var op: String
    public var expectedVersion: Int
    public var payloadJSON: String
    public var userId: String
    public var createdAt: Date

    public init(
        mutationId: String,
        seq: Int,
        entityKind: String,
        op: String,
        expectedVersion: Int = 0,
        payloadJSON: String,
        userId: String,
        createdAt: Date = .init()
    ) {
        self.mutationId = mutationId
        self.seq = seq
        self.entityKind = entityKind
        self.op = op
        self.expectedVersion = expectedVersion
        self.payloadJSON = payloadJSON
        self.userId = userId
        self.createdAt = createdAt
    }
}
