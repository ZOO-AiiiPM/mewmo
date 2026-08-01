import Foundation
import SwiftData

// MARK: - Syncable entity models (SwiftData persisted, account-scoped)

/// SwiftData `@Model` 实体共享一组同步字段（ZOO-91）。
///
/// 本文件只声明持久化存储模型，不承载网络/同步逻辑。所有实体按 `userId` 隔离，
/// 派生 Layer（`LocalStore`）在查询时显式过滤 `userId`，`@Model` 对象本身不跨 actor 泄漏。
///
/// 与服务器 Prisma 字段比例对齐，但仅保留客户端离线首屏所需 + 同步元数据字段。
/// Feed ↔ FeedEntry 首版使用标量 `feed_id`，**不建立 cascade relationship**：
/// tombstone 按实体独立到达，级联删除会把未 tombstone 的 entry 一并带掉。
/// 图片类字段一律存来源 URL 字符串，不把二进制写入 SwiftData。

@Model
final class MewmoNote {
    @Attribute(.unique) var id: String
    var version: Int
    var slug: String
    var title: String
    var content: String
    var summary: String?
    var pinned: Bool
    var userId: String
    var createdAt: Date
    var updatedAt: Date
    var deletedAt: Date?

    init(
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

@Model
final class MewmoClip {
    @Attribute(.unique) var id: String
    var version: Int
    var url: String
    var normalizedURL: String?
    var title: String
    var content: String
    var summary: String?
    var faviconURL: String?
    var coverImageURL: String?
    var excerpt: String?
    var sourceName: String?
    var author: String?
    var publishedAt: Date?
    var fetchStatus: String
    var fetchError: String?
    var fetchStartedAt: Date?
    var fetchedAt: Date?
    var userId: String
    var createdAt: Date
    var updatedAt: Date
    var deletedAt: Date?

    init(
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
}

@Model
final class MewmoFeed {
    @Attribute(.unique) var id: String
    var version: Int
    var url: String
    var type: String
    var title: String
    var feedDescription: String?
    var faviconURL: String?
    var refreshInterval: Int
    var lastFetchStartedAt: Date?
    var lastFetchStatus: String
    var lastFetchError: String?
    var lastFetchCount: Int
    var lastFetchedAt: Date?
    var lastSeenEntryURL: String?
    var userId: String
    var createdAt: Date
    var updatedAt: Date
    var deletedAt: Date?

    init(
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
}

@Model
final class MewmoFeedEntry {
    @Attribute(.unique) var id: String
    var version: Int
    var feedId: String
    var title: String
    var url: String
    var content: String
    var summary: String?
    var coverImageURL: String?
    var excerpt: String?
    var sourceName: String?
    var author: String?
    var publishedAt: Date?
    var readAt: Date?
    var userId: String
    var createdAt: Date
    var updatedAt: Date
    var deletedAt: Date?

    init(
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
}

// MARK: - Local sync metadata + durable outbox

/// 每用户本地同步状态：原样持久化 opaque cursor 与 contractVersion（ZOO-91）。
/// cursor 只存不解析/不重建 —— 解析和 keyset 语义归属服务端 sync 协议。
///
/// 每用户一行（`userId + scope`）；唯一约束由 repository 层保证（查询/写入都显式按
/// `scope + userId` 过滤、找不到才 insert）。**不能把 `scope` 单独设为 unique**：
/// 多个账号共用 `scope == "pull"`，单独 unique 会把不同用户的状态互相覆盖（账号隔离必备）。
@Model
final class MewmoSyncState {
    var scope: String
    var contractVersion: Int
    var cursor: String?
    var userId: String
    var updatedAt: Date

    init(
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

/// Durable outbox 原语：本地离线变更的稳定持久化信封（ZOO-91）。
///
/// 只负责持久化与 FIFO 排序，不实现网络 push/retry/conflict loop（ZOO-95 拥有传输层）。
/// 每次入队分配单调递增的 `seq`，ack 精确删除一条；同一条 `mutationId` 幂等入队。
@Model
final class MewmoPendingMutation {
    // queueKey = `userId#seq`，每用户内排序稳定、天然唯一。
    // 幂等由 repository 层的 mutationId 检查保证，因此这里不设 @Attribute(.unique)
    // （对 CoreData 保留名 `entity`/`entityName` 的字段也会触发注册崩溃，见 lesson）。
    var queueKey: String
    /// 调用方提供的稳定 mutation id（幂等依据）。
    var mutationId: String
    /// 每用户独立递增，决定 FIFO 顺序。
    var seq: Int
    /// 服务端 push 需要的稳定标识（note/clip/feed/feed_entry）。
    var entityKind: String
    /// 服务端操作：create/update/delete/mark_read/mark_unread。
    var op: String
    /// 乐观并发版本（服务端 CAS）；`0` 表示 create/未指定（版本实际从 1 起）。
    var expectedVersion: Int
    /// 原始 mutation JSON payload（如 `data` 字段原样保存，字符串形式）。
    var payloadJSON: String
    var userId: String
    var createdAt: Date

    init(
        queueKey: String,
        mutationId: String,
        seq: Int,
        entityKind: String,
        op: String,
        expectedVersion: Int,
        payloadJSON: String,
        userId: String,
        createdAt: Date = .init()
    ) {
        self.queueKey = queueKey
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
