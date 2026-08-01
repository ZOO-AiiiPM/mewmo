import Foundation
import SwiftData

/// VersionedSchema V1（ZOO-91）：全部本地持久化模型只在一份 schema 里登记。
///
/// `versionIdentifier` 用主版本号 `1`，与 sync contract 的 `contractVersion: 1` 对齐
/// （但不是同一个东西 —— 这是 SwiftData 本地 store 自身的迁移版本）。
enum MewmoSchemaV1: VersionedSchema {
    static var versionIdentifier: Schema.Version {
        Schema.Version(1, 0, 0)
    }

    static var models: [any PersistentModel.Type] {
        [
            MewmoNote.self,
            MewmoClip.self,
            MewmoFeed.self,
            MewmoFeedEntry.self,
            MewmoSyncState.self,
            MewmoPendingMutation.self,
        ]
    }
}
