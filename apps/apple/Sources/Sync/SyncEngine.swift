import Foundation
import Network

public enum SyncTrigger: String, Sendable, Equatable {
    case launch
    case foreground
    case networkRecovery
    case manual
}

public enum SyncPhase: String, Sendable, Equatable {
    case idle
    case syncing
    case succeeded
    case retryableFailure
    case authenticationRequired
}

/// Sanitized diagnostics only. Credentials, request bodies, and server response bodies never leave the transport layer.
public enum SyncFailureCode: String, Sendable, Equatable {
    case authentication
    case transport
    case server
    case decoding
    case unsupportedContract
    case unexpectedAccount
    case outboxInvalid
}

public struct SyncDiagnostics: Sendable, Equatable {
    public var phase: SyncPhase = .idle
    public var lastTrigger: SyncTrigger?
    public var lastErrorCode: SyncFailureCode?
    public var lastSuccessAt: Date?
    public var pulledRecords = 0
    public var pushedMutations = 0
    public var skippedRuns = 0

    public init() {}
}

/// Coordinates the existing v1 sync contract with local SwiftData state.
///
/// This actor deliberately owns no credentials and does not expose raw error strings. AuthenticatedHTTPClient
/// remains the sole bearer-token owner, while LocalStore remains the sole SwiftData owner.
public actor SyncEngine {
    private static let contractVersion = 1
    private static let pushBatchSize = 50

    private let baseURL: URL
    private let userId: String
    private let localStore: LocalStore
    private let httpClient: AuthenticatedHTTPClient
    private var isSynchronizing = false
    private var state = SyncDiagnostics()

    public init(
        baseURL: URL,
        userId: String,
        localStore: LocalStore,
        httpClient: AuthenticatedHTTPClient
    ) {
        self.baseURL = baseURL
        self.userId = userId
        self.localStore = localStore
        self.httpClient = httpClient
    }

    /// Runs a best-effort sync. Failures stay visible in diagnostics and leave unacknowledged outbox rows durable.
    public func synchronize(trigger: SyncTrigger) async {
        guard !isSynchronizing else {
            state.skippedRuns += 1
            return
        }

        isSynchronizing = true
        state.phase = .syncing
        state.lastTrigger = trigger
        state.lastErrorCode = nil
        defer { isSynchronizing = false }

        var firstError: Error?
        var pushed = 0
        var pulled = 0

        do {
            pushed = try await pushOutbox()
        } catch {
            firstError = error
        }

        do {
            pulled = try await pullPages()
        } catch {
            firstError = firstError ?? error
        }

        state.pushedMutations = pushed
        state.pulledRecords = pulled
        guard let firstError else {
            state.phase = .succeeded
            state.lastSuccessAt = Date()
            return
        }

        let code = failureCode(for: firstError)
        state.lastErrorCode = code
        state.phase = code == .authentication ? .authenticationRequired : .retryableFailure
    }

    public func diagnostics() -> SyncDiagnostics { state }

    private func pullPages() async throws -> Int {
        var cursor = try await localStore.syncState(userId: userId)?.cursor
        var total = 0

        while true {
            let request = try makeRequest(
                path: "api/sync/pull",
                body: SyncPullRequest(contractVersion: Self.contractVersion, cursor: cursor)
            )
            let response = try await sendAndDecode(request, as: SyncPullResponseDTO.self)
            guard response.contractVersion <= Self.contractVersion else { throw SyncEngineError.unsupportedContract }
            try validateAccount(response)

            let result = try await localStore.applyPull(response)
            total += result.notes + result.clips + result.feeds + result.feedEntries

            let nextCursor = response.nextCursor.isEmpty ? cursor : response.nextCursor
            _ = try await localStore.saveSyncState(
                SyncStateSnapshot(
                    scope: "pull",
                    contractVersion: response.contractVersion,
                    cursor: nextCursor,
                    userId: userId
                )
            )

            guard response.hasMore else { return total }
            guard let nextCursor, nextCursor != cursor else { throw SyncEngineError.stalledCursor }
            cursor = nextCursor
        }
    }

    private func pushOutbox() async throws -> Int {
        var acknowledged = 0

        while true {
            let pending = try await localStore.listPendingMutations(userId: userId)
            guard !pending.isEmpty else { return acknowledged }
            let batch = Array(pending.prefix(Self.pushBatchSize))
            acknowledged += try await push(batch)
        }
    }

    private func push(_ batch: [PendingMutationSnapshot]) async throws -> Int {
        let mutations = try batch.map(canonicalMutation(from:))
        let request = try makeRequest(
            path: "api/sync/push",
            body: SyncPushRequest(contractVersion: Self.contractVersion, mutations: mutations)
        )
        let response = try await sendAndDecode(request, as: SyncPushResponse.self)
        guard response.contractVersion <= Self.contractVersion else { throw SyncEngineError.unsupportedContract }

        var resolvedIndexes = Set<Int>()
        var acknowledged = 0

        for applied in response.applied {
            let pending = try pendingMutation(for: applied.index, in: batch, resolvedIndexes: &resolvedIndexes)
            guard applied.clientMutationId == nil || applied.clientMutationId == pending.mutationId else {
                throw SyncEngineError.invalidPushResponse
            }
            guard try await localStore.ackMutation(mutationId: pending.mutationId, userId: userId) else {
                throw SyncEngineError.invalidPushResponse
            }
            acknowledged += 1
        }

        var hasUnresolvedErrors = false
        for failure in response.errors {
            let pending = try pendingMutation(for: failure.index, in: batch, resolvedIndexes: &resolvedIndexes)
            guard failure.clientMutationId == nil || failure.clientMutationId == pending.mutationId else {
                throw SyncEngineError.invalidPushResponse
            }

            if failure.code == "version_conflict", let record = failure.record {
                try await applyConflict(record, entity: pending.entityKind)
                guard try await localStore.ackMutation(mutationId: pending.mutationId, userId: userId) else {
                    throw SyncEngineError.invalidPushResponse
                }
                acknowledged += 1
            } else {
                hasUnresolvedErrors = true
            }
        }

        guard resolvedIndexes.count == batch.count else { throw SyncEngineError.invalidPushResponse }
        if hasUnresolvedErrors { throw SyncEngineError.pushRejected }
        return acknowledged
    }

    private func pendingMutation(
        for index: Int,
        in batch: [PendingMutationSnapshot],
        resolvedIndexes: inout Set<Int>
    ) throws -> PendingMutationSnapshot {
        guard batch.indices.contains(index), resolvedIndexes.insert(index).inserted else {
            throw SyncEngineError.invalidPushResponse
        }
        return batch[index]
    }

    private func canonicalMutation(from pending: PendingMutationSnapshot) throws -> SyncWireMutation {
        let data = Data(pending.payloadJSON.utf8)
        let decoded: SyncWireMutation
        do {
            decoded = try JSONDecoder().decode(SyncWireMutation.self, from: data)
        } catch {
            throw SyncEngineError.outboxInvalid
        }

        guard decoded.entity == pending.entityKind, decoded.op == pending.op else {
            throw SyncEngineError.outboxInvalid
        }

        let needsIdentifier = ["update", "delete", "mark_read", "mark_unread"].contains(decoded.op)
        if needsIdentifier {
            guard let id = decoded.id, !id.isEmpty, decoded.data.expectedVersion == pending.expectedVersion else {
                throw SyncEngineError.outboxInvalid
            }
        }

        return SyncWireMutation(
            entity: decoded.entity,
            op: decoded.op,
            id: decoded.id,
            data: decoded.data,
            clientMutationId: pending.mutationId
        )
    }

    private func applyConflict(_ record: SyncJSONValue, entity: String) async throws {
        let decoder = JSONDecoder()
        let data = try JSONEncoder().encode(record)

        switch entity {
        case "note":
            if let decoded = try? decoder.decode(NotePullDTO.self, from: data), let snapshot = decoded.snapshot() {
                guard snapshot.userId == userId else { throw SyncEngineError.unexpectedAccount }
                _ = try await localStore.upsertNote(snapshot)
                return
            }
        case "clip":
            if let decoded = try? decoder.decode(ClipPullDTO.self, from: data) {
                let snapshot = decoded.snapshot()
                guard snapshot.userId == userId else { throw SyncEngineError.unexpectedAccount }
                _ = try await localStore.upsertClip(snapshot)
                return
            }
        case "feed":
            if let decoded = try? decoder.decode(FeedPullDTO.self, from: data) {
                let snapshot = decoded.snapshot()
                guard snapshot.userId == userId else { throw SyncEngineError.unexpectedAccount }
                _ = try await localStore.upsertFeed(snapshot)
                return
            }
        case "feed_entry":
            if let decoded = try? decoder.decode(FeedEntryPullDTO.self, from: data) {
                let snapshot = decoded.snapshot()
                guard snapshot.userId == userId else { throw SyncEngineError.unexpectedAccount }
                _ = try await localStore.upsertFeedEntry(snapshot)
                return
            }
        default:
            throw SyncEngineError.outboxInvalid
        }

        // ZOO-89 conflict fixtures intentionally use a compact record. Preserve local fields the compact
        // representation cannot authoritatively express while applying the server's version and tombstone.
        let metadata = try decoder.decode(SyncConflictMetadata.self, from: data)
        guard metadata.userId == userId else { throw SyncEngineError.unexpectedAccount }
        let deletedAt = metadata.deletedAt.flatMap(SyncISO8601.parse)

        switch entity {
        case "note":
            guard var snapshot = try await localStore.note(id: metadata.id, userId: userId) else { throw SyncEngineError.decoding }
            snapshot.version = metadata.version
            snapshot.updatedAt = metadata.updatedAt.flatMap(SyncISO8601.parse) ?? snapshot.updatedAt
            snapshot.deletedAt = deletedAt
            _ = try await localStore.upsertNote(snapshot)
        case "clip":
            guard var snapshot = try await localStore.clip(id: metadata.id, userId: userId) else { throw SyncEngineError.decoding }
            snapshot.version = metadata.version
            snapshot.updatedAt = metadata.updatedAt.flatMap(SyncISO8601.parse) ?? snapshot.updatedAt
            snapshot.deletedAt = deletedAt
            _ = try await localStore.upsertClip(snapshot)
        case "feed":
            guard var snapshot = try await localStore.feed(id: metadata.id, userId: userId) else { throw SyncEngineError.decoding }
            snapshot.version = metadata.version
            snapshot.updatedAt = metadata.updatedAt.flatMap(SyncISO8601.parse) ?? snapshot.updatedAt
            snapshot.deletedAt = deletedAt
            _ = try await localStore.upsertFeed(snapshot)
        case "feed_entry":
            guard var snapshot = try await localStore.feedEntry(id: metadata.id, userId: userId) else { throw SyncEngineError.decoding }
            snapshot.version = metadata.version
            snapshot.updatedAt = metadata.updatedAt.flatMap(SyncISO8601.parse) ?? snapshot.updatedAt
            snapshot.deletedAt = deletedAt
            _ = try await localStore.upsertFeedEntry(snapshot)
        default:
            throw SyncEngineError.outboxInvalid
        }
    }

    private func validateAccount(_ response: SyncPullResponseDTO) throws {
        let users = response.records.note.map(\.userId)
            + response.records.clip.map(\.userId)
            + response.records.feed.map(\.userId)
            + response.records.feed_entry.map(\.userId)
        guard users.allSatisfy({ $0 == userId }) else { throw SyncEngineError.unexpectedAccount }
    }

    private func makeRequest<Body: Encodable>(path: String, body: Body) throws -> URLRequest {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        return request
    }

    private func sendAndDecode<Response: Decodable>(_ request: URLRequest, as type: Response.Type) async throws -> Response {
        let response = try await httpClient.send(request)
        guard (200..<300).contains(response.statusCode) else { throw SyncEngineError.server }
        do {
            return try JSONDecoder().decode(type, from: response.data)
        } catch {
            throw SyncEngineError.decoding
        }
    }

    private func failureCode(for error: Error) -> SyncFailureCode {
        if let error = error as? SyncEngineError {
            switch error {
            case .unsupportedContract: return .unsupportedContract
            case .unexpectedAccount: return .unexpectedAccount
            case .outboxInvalid: return .outboxInvalid
            case .decoding, .invalidPushResponse, .stalledCursor: return .decoding
            case .server, .pushRejected: return .server
            }
        }
        if let error = error as? NativeAuthError {
            switch error {
            case .signedOut: return .authentication
            case .transport: return .transport
            case .server, .invalidResponse: return .authentication
            }
        }
        return error is URLError ? .transport : .decoding
    }
}

/// Lifecycle adapter for an already-configured signed-in SyncEngine. App composition owns creation after local store
/// and authenticated session setup; scheduling always launches detached work so local reads never wait on network I/O.
@MainActor
public final class SyncLifecycleCoordinator {
    private let engine: SyncEngine
    private let monitor = NWPathMonitor()
    private var hasObservedPath = false
    private var wasReachable = false

    public init(engine: SyncEngine) {
        self.engine = engine
        monitor.pathUpdateHandler = { [weak self] path in
            let reachable = path.status == .satisfied
            Task { @MainActor [weak self] in
                self?.networkChanged(isReachable: reachable)
            }
        }
        monitor.start(queue: DispatchQueue(label: "app.mewmo.sync.reachability"))
    }

    deinit { monitor.cancel() }

    public func applicationDidLaunch() { schedule(.launch) }
    public func applicationDidEnterForeground() { schedule(.foreground) }
    public func networkDidRecover() { schedule(.networkRecovery) }

    private func networkChanged(isReachable: Bool) {
        defer {
            hasObservedPath = true
            wasReachable = isReachable
        }
        if hasObservedPath, isReachable, !wasReachable { networkDidRecover() }
    }

    private func schedule(_ trigger: SyncTrigger) {
        Task { await engine.synchronize(trigger: trigger) }
    }
}

private enum SyncEngineError: Error {
    case server
    case decoding
    case unsupportedContract
    case unexpectedAccount
    case outboxInvalid
    case invalidPushResponse
    case pushRejected
    case stalledCursor
}

private struct SyncPullRequest: Encodable {
    let contractVersion: Int
    let cursor: String?

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(contractVersion, forKey: .contractVersion)
        try container.encodeIfPresent(cursor, forKey: .cursor)
    }

    private enum CodingKeys: String, CodingKey { case contractVersion, cursor }
}

private struct SyncPushRequest: Encodable {
    let contractVersion: Int
    let mutations: [SyncWireMutation]
}

private struct SyncPushResponse: Decodable {
    let contractVersion: Int
    let applied: [SyncAppliedMutation]
    let errors: [SyncPushError]

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        contractVersion = (try? container.decodeIfPresent(Int.self, forKey: .contractVersion)) ?? 1
        applied = (try? container.decodeIfPresent([SyncAppliedMutation].self, forKey: .applied)) ?? []
        errors = (try? container.decodeIfPresent([SyncPushError].self, forKey: .errors)) ?? []
    }

    private enum CodingKeys: String, CodingKey { case contractVersion, applied, errors }
}

private struct SyncAppliedMutation: Decodable {
    let index: Int
    let clientMutationId: String?
}

private struct SyncPushError: Decodable {
    let index: Int
    let clientMutationId: String?
    let code: String
    let record: SyncJSONValue?
}

private struct SyncConflictMetadata: Decodable {
    let id: String
    let version: Int
    let userId: String
    let updatedAt: String?
    let deletedAt: String?
}

private struct SyncWireMutation: Codable, Sendable {
    let entity: String
    let op: String
    let id: String?
    let data: SyncJSONValue
    let clientMutationId: String?
}

private indirect enum SyncJSONValue: Codable, Sendable {
    case object([String: SyncJSONValue])
    case array([SyncJSONValue])
    case string(String)
    case integer(Int)
    case number(Double)
    case boolean(Bool)
    case null

    var expectedVersion: Int? {
        guard case let .object(object) = self else { return nil }
        switch object["expectedVersion"] {
        case let .integer(value): return value
        case let .number(value) where value.rounded() == value: return Int(value)
        default: return nil
        }
    }

    init(from decoder: Decoder) throws {
        if let container = try? decoder.singleValueContainer() {
            if container.decodeNil() { self = .null; return }
            if let value = try? container.decode(Bool.self) { self = .boolean(value); return }
            if let value = try? container.decode(Int.self) { self = .integer(value); return }
            if let value = try? container.decode(Double.self) { self = .number(value); return }
            if let value = try? container.decode(String.self) { self = .string(value); return }
        }
        if var container = try? decoder.unkeyedContainer() {
            var values: [SyncJSONValue] = []
            while !container.isAtEnd { values.append(try container.decode(SyncJSONValue.self)) }
            self = .array(values)
            return
        }
        let container = try decoder.container(keyedBy: SyncCodingKey.self)
        var values: [String: SyncJSONValue] = [:]
        for key in container.allKeys { values[key.stringValue] = try container.decode(SyncJSONValue.self, forKey: key) }
        self = .object(values)
    }

    func encode(to encoder: Encoder) throws {
        switch self {
        case let .object(value):
            var container = encoder.container(keyedBy: SyncCodingKey.self)
            for (key, child) in value { try container.encode(child, forKey: SyncCodingKey(key)) }
        case let .array(value):
            var container = encoder.unkeyedContainer()
            for child in value { try container.encode(child) }
        case let .string(value):
            var container = encoder.singleValueContainer(); try container.encode(value)
        case let .integer(value):
            var container = encoder.singleValueContainer(); try container.encode(value)
        case let .number(value):
            var container = encoder.singleValueContainer(); try container.encode(value)
        case let .boolean(value):
            var container = encoder.singleValueContainer(); try container.encode(value)
        case .null:
            var container = encoder.singleValueContainer(); try container.encodeNil()
        }
    }
}

private struct SyncCodingKey: CodingKey {
    let stringValue: String
    let intValue: Int?

    init(_ stringValue: String) { self.stringValue = stringValue; intValue = nil }
    init?(stringValue: String) { self.init(stringValue) }
    init?(intValue: Int) { return nil }
}
