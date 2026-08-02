# Lessons: ZOO-124 Agent URL clip and feed subscription

This file captures raw observations from this task. Keep evidence and uncertainty visible; a later curation pass promotes durable guidance into `.trellis/spec/`.

## Observations

- Moving Clip persistence behind one application command can accidentally widen the Web fetch-error catch around database failures. The route must map only typed capture errors and keep unexpected persistence errors on the existing 500 path.
- A Feed rollback call returning successfully is insufficient evidence of cleanup; the ownership-safe delete count must be non-zero. FeedEntry cleanup relies on the existing `FeedEntry.feed` cascade.
- Prompt-description assertions do not test model intent. The checked-in live eval now runs the production prompt and tool schemas through Pi AgentHarness with in-memory persistence, so positive and negative routing can be verified without polluting the development database.
