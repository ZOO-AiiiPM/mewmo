import Foundation
import Observation

@MainActor
@Observable
final class MacContentStore {
    private static let staleAfter: TimeInterval = 15 * 60

    private let localStore: LocalStore
    private let userId: String
    private let syncEngine: SyncEngine?
    private let pageSize: Int

    private(set) var clips: [ClipSnapshot] = []
    private(set) var feeds: [FeedSnapshot] = []
    private(set) var entries: [FeedEntrySnapshot] = []
    private(set) var hasMoreClips = false
    private(set) var hasMoreFeeds = false
    private(set) var hasMoreEntries = false
    private(set) var isLoading = true
    private(set) var isSynchronizing = false
    private(set) var loadFailed = false
    private(set) var syncFailure: SyncFailureCode?
    private(set) var lastSyncedAt: Date?
    private(set) var isStale = true

    var clipSearch = ""
    var entrySearch = ""
    var selectedClipID: String?
    var selectedFeedID: String?
    var selectedEntryID: String?

    init(localStore: LocalStore, userId: String, syncEngine: SyncEngine? = nil, pageSize: Int = 40) {
        self.localStore = localStore
        self.userId = userId
        self.syncEngine = syncEngine
        self.pageSize = pageSize
    }

    var filteredClips: [ClipSnapshot] {
        filter(clips, query: clipSearch) { "\($0.title) \($0.url) \($0.excerpt ?? "") \($0.sourceName ?? "")" }
    }

    var filteredEntries: [FeedEntrySnapshot] {
        filter(entries, query: entrySearch) { "\($0.title) \($0.url) \($0.excerpt ?? "") \($0.sourceName ?? "")" }
    }

    var selectedClip: ClipSnapshot? {
        clips.first { $0.id == selectedClipID }
    }

    var selectedFeed: FeedSnapshot? {
        feeds.first { $0.id == selectedFeedID }
    }

    var selectedEntry: FeedEntrySnapshot? {
        entries.first { $0.id == selectedEntryID }
    }

    func load() async {
        isLoading = true
        loadFailed = false
        defer { isLoading = false }

        do {
            try await updateSyncState()
            try await reloadClips(reset: true)
            try await reloadFeeds(reset: true)
            try await reloadEntries(reset: true)
        } catch {
            loadFailed = true
        }
    }

    func updateClipSearch(_ query: String) async {
        clipSearch = query
        do {
            try await reloadClips(reset: true)
        } catch {
            loadFailed = true
        }
    }

    func updateEntrySearch(_ query: String) async {
        entrySearch = query
        do {
            try await reloadEntries(reset: true)
        } catch {
            loadFailed = true
        }
    }

    func selectFeed(_ id: String?) async {
        selectedFeedID = id
        selectedEntryID = nil
        do {
            try await reloadEntries(reset: true)
        } catch {
            loadFailed = true
        }
    }

    func loadMoreClips() async {
        do {
            try await reloadClips(reset: false)
        } catch {
            loadFailed = true
        }
    }

    func loadMoreFeeds() async {
        do {
            try await reloadFeeds(reset: false)
        } catch {
            loadFailed = true
        }
    }

    func loadMoreEntries() async {
        do {
            try await reloadEntries(reset: false)
        } catch {
            loadFailed = true
        }
    }

    func synchronize(trigger: SyncTrigger = .manual) async {
        guard let syncEngine else { return }
        isSynchronizing = true
        await syncEngine.synchronize(trigger: trigger)
        let diagnostics = await syncEngine.diagnostics()
        syncFailure = diagnostics.lastErrorCode
        isSynchronizing = false
        await load()
    }

    func deleteSelectedClip() async {
        guard let clip = selectedClip else { return }

        do {
            let payload = try canonicalDeletePayload(for: clip)
            let deleted = try await localStore.softDeleteClipAndEnqueue(
                id: clip.id,
                userId: userId,
                version: clip.version,
                deletedAt: Date(),
                mutationId: UUID().uuidString,
                payloadJSON: payload
            )
            guard deleted else {
                loadFailed = true
                return
            }
            clips.removeAll { $0.id == clip.id }
            reconcileClipSelection()
            Task { await self.synchronize() }
        } catch {
            loadFailed = true
        }
    }

    private func reloadClips(reset: Bool) async throws {
        let query = clipSearch.trimmingCharacters(in: .whitespacesAndNewlines)
        let offset = reset ? 0 : clips.count
        let page = try await localStore.listClips(
            userId: userId,
            limit: query.isEmpty ? pageSize : nil,
            offset: offset
        )
        clips = reset ? page : clips + page
        hasMoreClips = query.isEmpty && page.count == pageSize
        reconcileClipSelection()
    }

    private func reloadFeeds(reset: Bool) async throws {
        let offset = reset ? 0 : feeds.count
        let page = try await localStore.listFeeds(userId: userId, limit: pageSize, offset: offset)
        feeds = reset ? page : feeds + page
        hasMoreFeeds = page.count == pageSize
        if selectedFeedID == nil || !feeds.contains(where: { $0.id == selectedFeedID }) {
            selectedFeedID = feeds.first?.id
        }
    }

    private func reloadEntries(reset: Bool) async throws {
        let query = entrySearch.trimmingCharacters(in: .whitespacesAndNewlines)
        let offset = reset ? 0 : entries.count
        let page = try await localStore.listFeedEntries(
            userId: userId,
            feedId: selectedFeedID,
            limit: query.isEmpty ? pageSize : nil,
            offset: offset
        )
        entries = reset ? page : entries + page
        hasMoreEntries = query.isEmpty && page.count == pageSize
        reconcileEntrySelection()
    }

    private func updateSyncState() async throws {
        let state = try await localStore.syncState(userId: userId)
        lastSyncedAt = state?.updatedAt
        isStale = state.map { Date().timeIntervalSince($0.updatedAt) > Self.staleAfter } ?? true
    }

    private func reconcileClipSelection() {
        if !filteredClips.contains(where: { $0.id == selectedClipID }) {
            selectedClipID = filteredClips.first?.id
        }
    }

    private func reconcileEntrySelection() {
        guard selectedEntryID != nil, !filteredEntries.contains(where: { $0.id == selectedEntryID }) else { return }
        selectedEntryID = filteredEntries.first?.id
    }

    private func filter<T>(_ values: [T], query: String, text: (T) -> String) -> [T] {
        let query = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return values }
        return values.filter { text($0).localizedCaseInsensitiveContains(query) }
    }

    private func canonicalDeletePayload(for clip: ClipSnapshot) throws -> String {
        let mutation = ClipDeleteMutation(id: clip.id, expectedVersion: clip.version)
        return String(decoding: try JSONEncoder().encode(mutation), as: UTF8.self)
    }
}

private struct ClipDeleteMutation: Encodable {
    let entity = "clip"
    let op = "delete"
    let id: String
    let data: ExpectedVersion

    init(id: String, expectedVersion: Int) {
        self.id = id
        data = ExpectedVersion(expectedVersion: expectedVersion)
    }
}

private struct ExpectedVersion: Encodable {
    let expectedVersion: Int
}
