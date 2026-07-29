# Prompt And Payload Inventory

- Agent base: `apps/agent/prompts/system.zh.md`; preset Skill: `apps/agent/prompts/skills/deep-insight.zh.md`.
- Effective system prompt combines base, page context, and Skill inventory.
- Pi exposes provider input via `before_provider_payload`, assistant output via `message_end`, and authoritative post-hook Tool IO via `tool_execution_start`/`tool_execution_end`.
- Workflow adapters already hold generation system/user, embedding values/vectors, and retriever IO but omit them from observability.
- Full Production business payload is explicitly approved; credentials remain masked.
