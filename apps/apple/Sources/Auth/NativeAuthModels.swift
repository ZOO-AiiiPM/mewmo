import Foundation
#if os(iOS)
import UIKit
#endif

/// Native auth JSON mirrors `docs/contracts/native-auth.md`; token-bearing values stay internal.
public enum NativePlatform: String, Codable, Sendable {
    case macos
    case ios
    case ipados

    public static var current: Self {
        #if os(macOS)
        .macos
        #elseif os(iOS)
        UIDevice.current.userInterfaceIdiom == .pad ? .ipados : .ios
        #else
        .ios
        #endif
    }
}

public struct NativeAuthUser: Codable, Sendable, Equatable {
    public let id: String
    public let email: String
    public let name: String?
}

public struct NativeLoginRequest: Codable, Sendable {
    public let email: String
    public let password: String
    public let deviceId: String?
    public let deviceName: String?
    public let platform: NativePlatform

    public init(email: String, password: String, deviceId: String? = nil, deviceName: String? = nil, platform: NativePlatform = .current) {
        self.email = email
        self.password = password
        self.deviceId = deviceId
        self.deviceName = deviceName
        self.platform = platform
    }
}

public struct NativeSessionInfo: Codable, Sendable, Equatable {
    public let id: String
    public let deviceId: String
    public let platform: NativePlatform
    public let deviceName: String?
    public let createdAt: Date
    public let updatedAt: Date
    public let lastUsedAt: Date
}

public struct AuthSessionSnapshot: Sendable, Equatable {
    public let sessionId: String
    public let user: NativeAuthUser
    public let accessExpiresAt: Date
    public let refreshExpiresAt: Date
}

public enum NativeAuthEndpoint: String, Sendable, Equatable {
    case login = "/api/auth/native/login"
    case refresh = "/api/auth/native/refresh"
    case logout = "/api/auth/native/logout"
    case session = "/api/auth/native/session"
}

public enum NativeAuthErrorCode: String, Sendable, Equatable {
    case invalidRequest = "invalid_request"
    case invalidCredentials = "invalid_credentials"
    case invalidRefresh = "invalid_refresh"
    case unauthorized
    case rateLimited = "rate_limited"
    case unknown
}

/// Deliberately contains only endpoint/status/code; never attach response bodies or credentials.
public enum NativeAuthError: Error, Sendable, Equatable {
    case signedOut
    case server(statusCode: Int, code: NativeAuthErrorCode, endpoint: NativeAuthEndpoint)
    case transport(endpoint: NativeAuthEndpoint)
    case invalidResponse(endpoint: NativeAuthEndpoint)
}

struct StoredAuthSession: Codable, Sendable, Equatable {
    static let version = 1

    let version: Int
    let accessToken: String
    let refreshToken: String
    let sessionId: String
    let user: NativeAuthUser
    let accessExpiresAt: Date
    let refreshExpiresAt: Date

    var snapshot: AuthSessionSnapshot {
        AuthSessionSnapshot(sessionId: sessionId, user: user, accessExpiresAt: accessExpiresAt, refreshExpiresAt: refreshExpiresAt)
    }
}
