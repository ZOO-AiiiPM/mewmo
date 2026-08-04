# Design

## Data flow

`AiUsageEvent(turnId)` remains the only accounting source. The application session service performs an owner-scoped aggregate over the four billable token columns. The Agent completion adapter projects only `totalTokens` into its public response. The chat repository applies the same sum while projecting persisted turns into message metadata. Both paths feed the existing transcript adapter and `AssistantRow`.

## Contracts

- Turn total: `sum(inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens)` across all matching usage events.
- The aggregate first verifies the actor owns the Turn; foreign or missing turns remain not-found.
- A zero-row aggregate becomes absent usage, not zero.
- Terminal rows may carry `totalTokens`; streaming rows never do.
- The UI formats totals below 1000 as integers and larger totals as compact English notation with at most one decimal.

## Compatibility and safety

No schema or provider changes are required. Existing detailed internal usage records remain intact. The browser projection adds only the whole-turn total and does not expose cost, model, provider, purpose, or runtime metadata. Rollback is a code-only revert.
