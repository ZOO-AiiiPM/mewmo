import Foundation
import SwiftData

// MARK: - Actor-isolated local store (ZOO-91)
//
// `LocalStore` 用 `@ModelActor` 把 `ModelContext` 隔离在单个 actor executor 后，
// Swift 6 严格并发下 `@Model` 对象不会跨 actor 泄漏。所有公共方法「进出」都接收/返回
// `Sendable` snapshot，只有 actor 内部才短暂接触 `@Model` 实例。
//
// 账号隔离双层保证：
//   1. production 每个账号一个独立 store URL（`LocalDataContainer.account`）；
//   2. 每个查询/写入都在 predicate 里**显式带 `userId`**（requirement 2），
//      即使容器配置错误也不会让 A 用户读到/改到 B 用户数据。
//
// 版本规则（与 sync protocol 一致）：
//   - incoming version < local   → 拒绝，不回滚、不覆盖（返回 nil）；
//   - incoming version == local  → 幂等（写入同版本权威数据，不改变最终状态）；
//   - incoming version >  local   → 覆盖为最新快照。
//   - `deletedAt` 非空即 tombstone：默认列表排除，显式 fetch 可取回且 version 保留。

@ModelActor
public actor LocalStore {
    // MARK: - Notes

    /// 默认列表：过滤 tombstone，按 updatedAt 降序 + id 确定性 tie-breaker。
    public func listNotes(userId: String, includeDeleted: Bool = false) throws -> [NoteSnapshot] {
        let desc = FetchDescriptor<MewmoNote>(
            predicate: #Predicate<MewmoNote> { $0.userId == userId && (includeDeleted || $0.deletedAt == nil) },
            sortBy: [
                SortDescriptor(\MewmoNote.updatedAt, order: .reverse),
                SortDescriptor(\MewmoNote.id, order: .forward),
            ]
        )
        return try modelContext.fetch(desc).map(NoteSnapshot.init)
    }

    public func note(id: String, userId: String, includeDeleted: Bool = true) throws -> NoteSnapshot? {
        try first(MewmoNote.self, predicate: #Predicate {
            $0.id == id && $0.userId == userId && (includeDeleted || $0.deletedAt == nil)
        }).map(NoteSnapshot.init)
    }

    /// 版本单调 upsert。返回 `nil` 表示因版本过旧被拒绝；返回最新快照表示已落库。
    @discardableResult
    public func upsertNote(_ snapshot: NoteSnapshot) throws -> NoteSnapshot? {
        let targetID = snapshot.id
        let targetUser = snapshot.userId
        let existing = try first(MewmoNote.self, predicate: #Predicate {
            $0.id == targetID && $0.userId == targetUser
        })
        guard let existing else {
            let model = makeNote(from: snapshot)
            modelContext.insert(model)
            try modelContext.save()
            return NoteSnapshot(model)
        }
        guard snapshot.version >= existing.version else { return nil }
        apply(snapshot, to: existing)
        try modelContext.save()
        return NoteSnapshot(existing)
    }

    public func softDeleteNote(id: String, userId: String, version: Int, deletedAt: Date) throws -> Bool {
        guard
            let existing = try first(MewmoNote.self, predicate: #Predicate {
                $0.id == id && $0.userId == userId && $0.deletedAt == nil
            }),
            version >= existing.version
        else { return false }
        existing.deletedAt = deletedAt
        existing.version = version
        existing.updatedAt = deletedAt
        try modelContext.save()
        return true
    }

    // MARK: - Clips

    public func listClips(userId: String, includeDeleted: Bool = false) throws -> [ClipSnapshot] {
        let desc = FetchDescriptor<MewmoClip>(
            predicate: #Predicate<MewmoClip> { $0.userId == userId && (includeDeleted || $0.deletedAt == nil) },
            sortBy: [
                SortDescriptor(\MewmoClip.updatedAt, order: .reverse),
                SortDescriptor(\MewmoClip.id, order: .forward),
            ]
        )
        return try modelContext.fetch(desc).map(ClipSnapshot.init)
    }

    public func clip(id: String, userId: String, includeDeleted: Bool = true) throws -> ClipSnapshot? {
        try first(MewmoClip.self, predicate: #Predicate {
            $0.id == id && $0.userId == userId && (includeDeleted || $0.deletedAt == nil)
        }).map(ClipSnapshot.init)
    }

    @discardableResult
    public func upsertClip(_ snapshot: ClipSnapshot) throws -> ClipSnapshot? {
        let targetID = snapshot.id
        let targetUser = snapshot.userId
        let existing = try first(MewmoClip.self, predicate: #Predicate {
            $0.id == targetID && $0.userId == targetUser
        })
        guard let existing else {
            let model = makeClip(from: snapshot)
            modelContext.insert(model)
            try modelContext.save()
            return ClipSnapshot(model)
        }
        guard snapshot.version >= existing.version else { return nil }
        apply(snapshot, to: existing)
        try modelContext.save()
        return ClipSnapshot(existing)
    }

    public func softDeleteClip(id: String, userId: String, version: Int, deletedAt: Date) throws -> Bool {
        guard
            let existing = try first(MewmoClip.self, predicate: #Predicate {
                $0.id == id && $0.userId == userId && $0.deletedAt == nil
            }),
            version >= existing.version
        else { return false }
        existing.deletedAt = deletedAt
        existing.version = version
        existing.updatedAt = deletedAt
        try modelContext.save()
        return true
    }

    // MARK: - Feeds

    public func listFeeds(userId: String, includeDeleted: Bool = false) throws -> [FeedSnapshot] {
        let desc = FetchDescriptor<MewmoFeed>(
            predicate: #Predicate<MewmoFeed> { $0.userId == userId && (includeDeleted || $0.deletedAt == nil) },
            sortBy: [
                SortDescriptor(\MewmoFeed.updatedAt, order: .reverse),
                SortDescriptor(\MewmoFeed.id, order: .forward),
            ]
        )
        return try modelContext.fetch(desc).map(FeedSnapshot.init)
    }

    public func feed(id: String, userId: String, includeDeleted: Bool = true) throws -> FeedSnapshot? {
        try first(MewmoFeed.self, predicate: #Predicate {
            $0.id == id && $0.userId == userId && (includeDeleted || $0.deletedAt == nil)
        }).map(FeedSnapshot.init)
    }

    @discardableResult
    public func upsertFeed(_ snapshot: FeedSnapshot) throws -> FeedSnapshot? {
        let targetID = snapshot.id
        let targetUser = snapshot.userId
        let existing = try first(MewmoFeed.self, predicate: #Predicate {
            $0.id == targetID && $0.userId == targetUser
        })
        guard let existing else {
            let model = makeFeed(from: snapshot)
            modelContext.insert(model)
            try modelContext.save()
            return FeedSnapshot(model)
        }
        guard snapshot.version >= existing.version else { return nil }
        apply(snapshot, to: existing)
        try modelContext.save()
        return FeedSnapshot(existing)
    }

    public func softDeleteFeed(id: String, userId: String, version: Int, deletedAt: Date) throws -> Bool {
        guard
            let existing = try first(MewmoFeed.self, predicate: #Predicate {
                $0.id == id && $0.userId == userId && $0.deletedAt == nil
            }),
            version >= existing.version
        else { return false }
        existing.deletedAt = deletedAt
        existing.version = version
        existing.updatedAt = deletedAt
        try modelContext.save()
        return true
    }

    // MARK: - Feed entries

    public func listFeedEntries(userId: String, includeDeleted: Bool = false) throws -> [FeedEntrySnapshot] {
        let desc = FetchDescriptor<MewmoFeedEntry>(
            predicate: #Predicate<MewmoFeedEntry> { $0.userId == userId && (includeDeleted || $0.deletedAt == nil) },
            sortBy: [
                SortDescriptor(\MewmoFeedEntry.updatedAt, order: .reverse),
                SortDescriptor(\MewmoFeedEntry.id, order: .forward),
            ]
        )
        return try modelContext.fetch(desc).map(FeedEntrySnapshot.init)
    }

    public func feedEntry(id: String, userId: String, includeDeleted: Bool = true) throws -> FeedEntrySnapshot? {
        try first(MewmoFeedEntry.self, predicate: #Predicate {
            $0.id == id && $0.userId == userId && (includeDeleted || $0.deletedAt == nil)
        }).map(FeedEntrySnapshot.init)
    }

    @discardableResult
    public func upsertFeedEntry(_ snapshot: FeedEntrySnapshot) throws -> FeedEntrySnapshot? {
        let targetID = snapshot.id
        let targetUser = snapshot.userId
        let existing = try first(MewmoFeedEntry.self, predicate: #Predicate {
            $0.id == targetID && $0.userId == targetUser
        })
        guard let existing else {
            let model = makeFeedEntry(from: snapshot)
            modelContext.insert(model)
            try modelContext.save()
            return FeedEntrySnapshot(model)
        }
        guard snapshot.version >= existing.version else { return nil }
        apply(snapshot, to: existing)
        try modelContext.save()
        return FeedEntrySnapshot(existing)
    }

    public func softDeleteFeedEntry(id: String, userId: String, version: Int, deletedAt: Date) throws -> Bool {
        guard
            let existing = try first(MewmoFeedEntry.self, predicate: #Predicate {
                $0.id == id && $0.userId == userId && $0.deletedAt == nil
            }),
            version >= existing.version
        else { return false }
        existing.deletedAt = deletedAt
        existing.version = version
        existing.updatedAt = deletedAt
        try modelContext.save()
        return true
    }

    // MARK: - Sync state (opaque cursor + contractVersion, 原样持久化)

    public func syncState(userId: String, scope: String = "pull") throws -> SyncStateSnapshot? {
        try first(MewmoSyncState.self, predicate: #Predicate {
            $0.scope == scope && $0.userId == userId
        }).map(SyncStateSnapshot.init)
    }

    @discardableResult
    public func saveSyncState(_ snapshot: SyncStateSnapshot, scope: String = "pull") throws -> SyncStateSnapshot {
        let targetUser = snapshot.userId
        if let existing = try first(MewmoSyncState.self, predicate: #Predicate {
            $0.scope == scope && $0.userId == targetUser
        }) {
            existing.contractVersion = snapshot.contractVersion
            existing.cursor = snapshot.cursor
            existing.updatedAt = snapshot.updatedAt
        } else {
            modelContext.insert(
                MewmoSyncState(
                    scope: scope,
                    contractVersion: snapshot.contractVersion,
                    cursor: snapshot.cursor,
                    userId: snapshot.userId,
                    updatedAt: snapshot.updatedAt
                )
            )
        }
        try modelContext.save()
        return snapshot
    }

    // MARK: - Durable outbox（FIFO + 精确 ack + 幂等入队）

    public func listPendingMutations(userId: String) throws -> [PendingMutationSnapshot] {
        let desc = FetchDescriptor<MewmoPendingMutation>(
            predicate: #Predicate<MewmoPendingMutation> { $0.userId == userId },
            sortBy: [SortDescriptor(\MewmoPendingMutation.seq)]
        )
        return try modelContext.fetch(desc).map(PendingMutationSnapshot.init)
    }

    /// 入队一条 outbox mutation。同 `mutationId` 已存在则幂等跳过（返回已存在项）。
    /// FIFO：每用户 `seq` 从 1 单调递增，`listPendingMutations` 按 seq 升序返回。
    @discardableResult
    public func enqueueMutation(
        mutationId: String,
        entityKind: String,
        op: String,
        expectedVersion: Int,
        payloadJSON: String,
        userId: String
    ) throws -> PendingMutationSnapshot {
        if let existing = try first(MewmoPendingMutation.self, predicate: #Predicate {
            $0.mutationId == mutationId && $0.userId == userId
        }) {
            return PendingMutationSnapshot(existing)
        }
        let nextSeq = (try listPendingMutations(userId: userId).map(\.seq).max() ?? 0) + 1
        let model = MewmoPendingMutation(
            queueKey: "\(userId)#\(nextSeq)",
            mutationId: mutationId,
            seq: nextSeq,
            entityKind: entityKind,
            op: op,
            expectedVersion: expectedVersion,
            payloadJSON: payloadJSON,
            userId: userId
        )
        modelContext.insert(model)
        try modelContext.save()
        return PendingMutationSnapshot(model)
    }

    /// ack：精确删除一条 mutation（按 mutationId）。返回是否删到。
    @discardableResult
    public func ackMutation(mutationId: String, userId: String) throws -> Bool {
        guard let existing = try first(MewmoPendingMutation.self, predicate: #Predicate {
            $0.mutationId == mutationId && $0.userId == userId
        }) else { return false }
        modelContext.delete(existing)
        try modelContext.save()
        return true
    }

    // MARK: - Canonical fixture landing（ZOO-91 验收：pull fixtures 可 decode 并落库）

    /// 把一次 pull 响应按版本规则落到四类实体；返回实际落库个数。
    @discardableResult
    public func applyPull(_ response: SyncPullResponseDTO) throws -> PullApplyResult {
        var result = PullApplyResult()
        for dto in response.records.note {
            if let snap = dto.snapshot(), try upsertNote(snap) != nil { result.notes += 1 }
        }
        for dto in response.records.clip {
            if try upsertClip(dto.snapshot()) != nil { result.clips += 1 }
        }
        for dto in response.records.feed {
            if try upsertFeed(dto.snapshot()) != nil { result.feeds += 1 }
        }
        for dto in response.records.feed_entry {
            if try upsertFeedEntry(dto.snapshot()) != nil { result.feedEntries += 1 }
        }
        return result
    }

    // MARK: - predicate helper

    /// 抓取单条模型（fetchLimit=1）。调用方传字面量 `#Predicate { ... }`。
    private func first<M: PersistentModel>(_ type: M.Type, predicate: Predicate<M>?) throws -> M? {
        var descriptor = FetchDescriptor<M>(predicate: predicate)
        descriptor.fetchLimit = 1
        return try modelContext.fetch(descriptor).first
    }

    // MARK: - snapshot → model construction / application

    private func makeNote(from s: NoteSnapshot) -> MewmoNote {
        MewmoNote(
            id: s.id, version: s.version, slug: s.slug, title: s.title,
            content: s.content, summary: s.summary, pinned: s.pinned,
            userId: s.userId, createdAt: s.createdAt, updatedAt: s.updatedAt, deletedAt: s.deletedAt
        )
    }

    private func makeClip(from s: ClipSnapshot) -> MewmoClip {
        MewmoClip(
            id: s.id, version: s.version, url: s.url, normalizedURL: s.normalizedURL,
            title: s.title, content: s.content, summary: s.summary,
            faviconURL: s.faviconURL, coverImageURL: s.coverImageURL, excerpt: s.excerpt,
            sourceName: s.sourceName, author: s.author, publishedAt: s.publishedAt,
            fetchStatus: s.fetchStatus, fetchError: s.fetchError,
            fetchStartedAt: s.fetchStartedAt, fetchedAt: s.fetchedAt,
            userId: s.userId, createdAt: s.createdAt, updatedAt: s.updatedAt, deletedAt: s.deletedAt
        )
    }

    private func makeFeed(from s: FeedSnapshot) -> MewmoFeed {
        MewmoFeed(
            id: s.id, version: s.version, url: s.url, type: s.type, title: s.title,
            feedDescription: s.feedDescription, faviconURL: s.faviconURL,
            refreshInterval: s.refreshInterval,
            lastFetchStartedAt: s.lastFetchStartedAt, lastFetchStatus: s.lastFetchStatus,
            lastFetchError: s.lastFetchError, lastFetchCount: s.lastFetchCount,
            lastFetchedAt: s.lastFetchedAt, lastSeenEntryURL: s.lastSeenEntryURL,
            userId: s.userId, createdAt: s.createdAt, updatedAt: s.updatedAt, deletedAt: s.deletedAt
        )
    }

    private func makeFeedEntry(from s: FeedEntrySnapshot) -> MewmoFeedEntry {
        MewmoFeedEntry(
            id: s.id, version: s.version, feedId: s.feedId, title: s.title, url: s.url,
            content: s.content, summary: s.summary, coverImageURL: s.coverImageURL,
            excerpt: s.excerpt, sourceName: s.sourceName, author: s.author,
            publishedAt: s.publishedAt, readAt: s.readAt,
            userId: s.userId, createdAt: s.createdAt, updatedAt: s.updatedAt, deletedAt: s.deletedAt
        )
    }

    private func apply(_ s: NoteSnapshot, to m: MewmoNote) {
        m.version = s.version
        m.slug = s.slug
        m.title = s.title
        m.content = s.content
        m.summary = s.summary
        m.pinned = s.pinned
        m.createdAt = s.createdAt
        m.updatedAt = s.updatedAt
        m.deletedAt = s.deletedAt
    }

    private func apply(_ s: ClipSnapshot, to m: MewmoClip) {
        m.version = s.version
        m.url = s.url
        m.normalizedURL = s.normalizedURL
        m.title = s.title
        m.content = s.content
        m.summary = s.summary
        m.faviconURL = s.faviconURL
        m.coverImageURL = s.coverImageURL
        m.excerpt = s.excerpt
        m.sourceName = s.sourceName
        m.author = s.author
        m.publishedAt = s.publishedAt
        m.fetchStatus = s.fetchStatus
        m.fetchError = s.fetchError
        m.fetchStartedAt = s.fetchStartedAt
        m.fetchedAt = s.fetchedAt
        m.createdAt = s.createdAt
        m.updatedAt = s.updatedAt
        m.deletedAt = s.deletedAt
    }

    private func apply(_ s: FeedSnapshot, to m: MewmoFeed) {
        m.version = s.version
        m.url = s.url
        m.type = s.type
        m.title = s.title
        m.feedDescription = s.feedDescription
        m.faviconURL = s.faviconURL
        m.refreshInterval = s.refreshInterval
        m.lastFetchStartedAt = s.lastFetchStartedAt
        m.lastFetchStatus = s.lastFetchStatus
        m.lastFetchError = s.lastFetchError
        m.lastFetchCount = s.lastFetchCount
        m.lastFetchedAt = s.lastFetchedAt
        m.lastSeenEntryURL = s.lastSeenEntryURL
        m.createdAt = s.createdAt
        m.updatedAt = s.updatedAt
        m.deletedAt = s.deletedAt
    }

    private func apply(_ s: FeedEntrySnapshot, to m: MewmoFeedEntry) {
        m.version = s.version
        m.feedId = s.feedId
        m.title = s.title
        m.url = s.url
        m.content = s.content
        m.summary = s.summary
        m.coverImageURL = s.coverImageURL
        m.excerpt = s.excerpt
        m.sourceName = s.sourceName
        m.author = s.author
        m.publishedAt = s.publishedAt
        m.readAt = s.readAt
        m.createdAt = s.createdAt
        m.updatedAt = s.updatedAt
        m.deletedAt = s.deletedAt
    }
}

/// `applyPull` 的落库计数（Sendable）。
public struct PullApplyResult: Sendable, Equatable {
    public var notes: Int = 0
    public var clips: Int = 0
    public var feeds: Int = 0
    public var feedEntries: Int = 0

    public init() {}
}
