# Lessons: ZOO-93 Apple 认证客户端

This file captures raw observations from this task. Keep evidence and uncertainty visible; a later curation pass promotes durable guidance into `.trellis/spec/`.

## Observations

- None yet.
## Implementation note

- XcodeGen system frameworks must use `sdk: Security.framework`; declaring Security as a local `framework` makes Xcode attempt to embed a nonexistent workspace path in the unhosted test bundle.
