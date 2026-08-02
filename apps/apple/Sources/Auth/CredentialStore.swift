import Foundation
import Security

/// The one production credential record is a versioned Codable blob, atomically replaced on refresh rotation.
public protocol CredentialStore: Sendable {
    func load() async throws -> Data?
    func replace(_ data: Data) async throws
    func clear() async throws
}

public final class SecurityCredentialStore: CredentialStore, @unchecked Sendable {
    private let service: String
    private let account: String

    public init(service: String = "app.mewmo.native-auth", account: String = "session") {
        self.service = service
        self.account = account
    }

    public func load() async throws -> Data? {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else {
            throw CredentialStoreError.keychain(status: status)
        }
        return data
    }

    public func replace(_ data: Data) async throws {
        let identity: [CFString: Any] = [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: account]
        let attributes: [CFString: Any] = [kSecValueData: data, kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        let updateStatus = SecItemUpdate(identity as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else { throw CredentialStoreError.keychain(status: updateStatus) }
        var item = identity
        item.merge(attributes) { _, new in new }
        item[kSecAttrSynchronizable] = kCFBooleanFalse
        let addStatus = SecItemAdd(item as CFDictionary, nil)
        guard addStatus == errSecSuccess else { throw CredentialStoreError.keychain(status: addStatus) }
    }

    public func clear() async throws {
        let query: [CFString: Any] = [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: account]
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw CredentialStoreError.keychain(status: status) }
    }
}

public enum CredentialStoreError: Error, Sendable, Equatable {
    case keychain(status: OSStatus)
}

public actor InMemoryCredentialStore: CredentialStore {
    private var value: Data?
    public init(value: Data? = nil) { self.value = value }
    public func load() async throws -> Data? { value }
    public func replace(_ data: Data) async throws { value = data }
    public func clear() async throws { value = nil }
}
