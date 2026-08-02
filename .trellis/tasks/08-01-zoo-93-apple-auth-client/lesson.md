# Lessons: ZOO-93 Apple 认证客户端

This file captures raw observations from this task. Keep evidence and uncertainty visible; a later curation pass promotes durable guidance into `.trellis/spec/`.

## Observations

- A client-side refresh single-flight must be keyed to the rejected access token: a delayed 401 for an earlier bearer must reuse an already-rotated current token rather than rotate again.
- Actor isolation does not make an awaited credential-store write lifecycle-safe; invalidate an epoch before logout/sign-out cleanup and recheck it after the store call before publishing refreshed credentials.
- An epoch guard alone cannot repair a stale write that finishes after a newer login. Route all credential mutations through one FIFO queue, make login a lifecycle transition, and let the later clear/replace be the final store operation.
- Check lifecycle epoch before starting a credential write as well as after it returns. Clear local credentials before awaiting logout/login network calls so a suspended lifecycle cannot reload an old blob.
## Implementation note

- XcodeGen system frameworks must use `sdk: Security.framework`; declaring Security as a local `framework` makes Xcode attempt to embed a nonexistent workspace path in the unhosted test bundle.
