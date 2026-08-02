# Design

## Components

- `NativeAuthTransport`: URLSession-backed login/refresh/logout/session calls and stable server error decoding.
- `CredentialStore`: async load/replace/clear contract; production `SecurityCredentialStore`, tests use in-memory fake.
- `AuthSessionController`: actor owning session state, expiry policy, refresh single-flight and logout lifecycle.
- `AuthenticatedHTTPClient`: injects bearer header, handles one 401 refresh/retry, never logs secrets.

## Credential Atomicity

Access token, refresh token, expiries, sessionId and minimal user identity are encoded as one versioned blob under one Keychain item. A successful refresh performs one replace operation, preventing a new access token from being paired with the old refresh token after a crash or partial write.

## Refresh State Machine

`AuthSessionController` is an actor. At most one refresh `Task` exists; concurrent callers await it. Success replaces the stored blob before returning. `invalid_refresh` clears the store and publishes signed-out. Transient network/429/5xx errors keep the current session and surface retryable failure.

## Dependency Decision

Use Apple `Security.framework` directly. It is the platform Keychain API and avoids introducing a wrapper whose macOS integration requires extra entitlement/runtime behavior. Keep Security calls isolated behind `CredentialStore`; do not expose OSStatus or token data outside the adapter.

KeychainAccess is popular but its latest tagged release is from 2021. Valet 5.1.0 is current and robust, but its documented macOS/unhosted-test entitlement requirements add integration surface not needed for two small secrets. Locksmith's latest tagged release is from 2016.

## Contract Source

`docs/contracts/native-auth.md` and `apps/web/src/lib/native-auth-contract.ts` are authoritative. Client DTOs mirror JSON only; endpoint behavior is not reinterpreted.
