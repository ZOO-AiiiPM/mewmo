import Foundation

// MARK: - `@Model` → Sendable snapshot conversions
//
// 这些 `init(_ model:)` 只用于 actor 内部把已 fetch 的 `@Model` 复制成值类型快照后再返回，
// 因此不会让 `@Model` 对象跨 actor 边界。属「接口边界单向投影」。
extension NoteSnapshot {
    init(_ model: MewmoNote) {
        self.init(
            id: model.id,
            version: model.version,
            slug: model.slug,
            title: model.title,
            content: model.content,
            summary: model.summary,
            pinned: model.pinned,
            userId: model.userId,
            createdAt: model.createdAt,
            updatedAt: model.updatedAt,
            deletedAt: model.deletedAt
        )
    }
}

extension ClipSnapshot {
    init(_ model: MewmoClip) {
        self.init(
            id: model.id,
            version: model.version,
            url: model.url,
            normalizedURL: model.normalizedURL,
            title: model.title,
            content: model.content,
            summary: model.summary,
            faviconURL: model.faviconURL,
            coverImageURL: model.coverImageURL,
            excerpt: model.excerpt,
            sourceName: model.sourceName,
            author: model.author,
            publishedAt: model.publishedAt,
            fetchStatus: model.fetchStatus,
            fetchError: model.fetchError,
            fetchStartedAt: model.fetchStartedAt,
            fetchedAt: model.fetchedAt,
            userId: model.userId,
            createdAt: model.createdAt,
            updatedAt: model.updatedAt,
            deletedAt: model.deletedAt
        )
    }
}

extension FeedSnapshot {
    init(_ model: MewmoFeed) {
        self.init(
            id: model.id,
            version: model.version,
            url: model.url,
            type: model.type,
            title: model.title,
            feedDescription: model.feedDescription,
            faviconURL: model.faviconURL,
            refreshInterval: model.refreshInterval,
            lastFetchStartedAt: model.lastFetchStartedAt,
            lastFetchStatus: model.lastFetchStatus,
            lastFetchError: model.lastFetchError,
            lastFetchCount: model.lastFetchCount,
            lastFetchedAt: model.lastFetchedAt,
            lastSeenEntryURL: model.lastSeenEntryURL,
            userId: model.userId,
            createdAt: model.createdAt,
            updatedAt: model.updatedAt,
            deletedAt: model.deletedAt
        )
    }
}

extension FeedEntrySnapshot {
    init(_ model: MewmoFeedEntry) {
        self.init(
            id: model.id,
            version: model.version,
            feedId: model.feedId,
            title: model.title,
            url: model.url,
            content: model.content,
            summary: model.summary,
            coverImageURL: model.coverImageURL,
            excerpt: model.excerpt,
            sourceName: model.sourceName,
            author: model.author,
            publishedAt: model.publishedAt,
            readAt: model.readAt,
            userId: model.userId,
            createdAt: model.createdAt,
            updatedAt: model.updatedAt,
            deletedAt: model.deletedAt
        )
    }
}

extension SyncStateSnapshot {
    init(_ model: MewmoSyncState) {
        self.init(
            scope: model.scope,
            contractVersion: model.contractVersion,
            cursor: model.cursor,
            userId: model.userId,
            updatedAt: model.updatedAt
        )
    }
}

extension PendingMutationSnapshot {
    init(_ model: MewmoPendingMutation) {
        self.init(
            mutationId: model.mutationId,
            seq: model.seq,
            entityKind: model.entityKind,
            op: model.op,
            expectedVersion: model.expectedVersion,
            payloadJSON: model.payloadJSON,
            userId: model.userId,
            createdAt: model.createdAt
        )
    }
}
