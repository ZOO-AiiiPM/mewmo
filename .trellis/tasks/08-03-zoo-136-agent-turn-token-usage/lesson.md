# Lessons: ZOO-136 Agent 每轮展示 Token 消耗

This file captures raw observations from this task. Keep evidence and uncertainty visible; a later curation pass promotes durable guidance into `.trellis/spec/`.

## Observations

- `turn.completed.usage` is only the final assistant generation. Whole-turn accounting must aggregate all `AiUsageEvent` rows by the owned `turnId`.
- The stable shared SSE event cannot be changed in this task; the existing trailing `result` payload reconciles the settled total into both successful and failed terminal rows.
- Cached idempotent turns need a fresh usage aggregate because older persisted output may contain only final-generation usage or no whole-turn total.
