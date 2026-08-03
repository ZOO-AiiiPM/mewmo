# Implementation

- [x] Add an owner-scoped whole-turn usage aggregate to the application session service with single/multi-generation and cross-user tests.
- [x] Use that aggregate in the Agent completion response; remove final-message-only usage projection.
- [x] Include per-turn usage events in the owned chat query and project the same total into historical message metadata.
- [x] Carry `totalTokens` through live and persisted transcript adapters without showing it while streaming.
- [x] Render compact low-emphasis token text in `AssistantRow` and add focused behavior tests.
- [x] Run focused package tests, ownership regression, Web lint/typecheck/theme/diff check/build, then browser-check light and dark themes on an unused port.
- [ ] Stage owned files only, commit, push, and open the requested PR without merging.
