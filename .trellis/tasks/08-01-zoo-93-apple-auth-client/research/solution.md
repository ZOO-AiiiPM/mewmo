# Solution Research

- Apple Security.framework: adopted as the platform-native Keychain API, isolated behind `CredentialStore` for testability.
- Valet: 4,168 stars，5.1.0 发布于 2026-02-20；活跃且线程安全，但 macOS Keychain entitlement 与 unhosted test 要求增加当前范围不需要的集成面。
- KeychainAccess: 8,256 stars，但最新 tagged release 4.2.2 发布于 2021-03-01。
- Locksmith: 2,913 stars，最新 tagged release 2.0.8 发布于 2016-02-16。

Sources:

- https://developer.apple.com/documentation/security/keychain-services
- https://github.com/square/Valet
- https://github.com/kishikawakatsumi/KeychainAccess
- https://github.com/matthewpalmer/Locksmith
