import Foundation
import SwiftData

/// SwiftData 本地容器工厂（ZOO-91）。
///
/// 职责：
/// - 提供 in-memory / 临时磁盘（测试用）与按账号隔离的 production 磁盘容器；
/// - production 容器**必须**显式引用 V1 schema + `MewmoMigrationPlan`；
/// - store 打开失败向上抛错，**绝不静默删除或重建用户数据**。
///
/// 账号隔离：每个账号使用独立 store URL，避免 schema 里需要多账号复合主键。
/// repository 仍须在查询时显式校验 `userId`（双保险，见 `LocalStore`）。
public enum LocalDataContainer {
    /// 创建不与磁盘交互的纯内存容器（单元测试默认形态）。
    public static func inMemory() throws -> ModelContainer {
        let schema = Schema(versionedSchema: MewmoSchemaV1.self)
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
        return try ModelContainer(for: schema, configurations: [config])
    }

    /// 创建落在系统临时目录、但独立命名的磁盘容器（测试“重开持久性”用）。
    /// 调用方负责在测试尾声删除目录（`directory` 参数）。
    public static func temporaryDisk(directory: URL) throws -> ModelContainer {
        let url = try diskStoreURL(directory: directory, accountID: nil)
        return try container(at: url)
    }

    /// 创建按账号隔离的 production 磁盘容器。`storeURL` 由调用方（composition root）
    /// 提供，通常基于 Keychain/账号 id 推导；本层不碰认证与 Keychain。
    public static func account(storeURL: URL) throws -> ModelContainer {
        try container(at: storeURL)
    }

    // MARK: - internals

    /// 从 V1 schema + migration plan 建立磁盘容器。显式传 `MewmoMigrationPlan`，
    /// 保证 V1 入口是唯一建立路径（不落入隐式自动迁移）。
    static func container(at url: URL) throws -> ModelContainer {
        let schema = Schema(versionedSchema: MewmoSchemaV1.self)
        let config = ModelConfiguration(schema: schema, url: url)
        let container = try ModelContainer(
            for: schema,
            migrationPlan: MewmoMigrationPlan.self,
            configurations: [config]
        )
        return container
    }

    /// 账号磁盘 store 的文件 URL。
    public static func diskStoreURL(directory: URL, accountID: String?) throws -> URL {
        try FileManager.default.createDirectory(
            at: directory, withIntermediateDirectories: true
        )
        let fileName = accountID.map { "mewmo-\($0).store" } ?? "mewmo-test.store"
        return directory.appendingPathComponent(fileName)
    }
}

/// 本地数据层错误（ZOO-91）。store 打开/读取失败必须可向上传递。
public enum LocalStoreError: Error, Sendable, Equatable {
    case storeOpenFailed(label: String)
    case objectNotFound(String)
}
