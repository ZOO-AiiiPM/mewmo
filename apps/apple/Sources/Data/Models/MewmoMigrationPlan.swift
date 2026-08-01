import Foundation
import SwiftData

/// V1-first `SchemaMigrationPlan`（ZOO-91）。
///
/// 首版只有 V1 schema，**没有人为构造的空迁移 stage**（PRD 明确禁止假 V2）。
/// `stages: []` 合法：从空 store 直接按 version 1 建立表结构，并为后续 V2/V3
/// 迁移预留唯一入口。production store 打开时显式引用本 plan。
enum MewmoMigrationPlan: SchemaMigrationPlan {
    static var schemas: [any VersionedSchema.Type] {
        [MewmoSchemaV1.self]
    }

    static var stages: [MigrationStage] {
        []
    }
}
