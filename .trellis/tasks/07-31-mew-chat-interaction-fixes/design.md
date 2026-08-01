# ZOO-84 Technical Design

## Boundaries

`ChatInput` owns draft, Deep Thinking toggle, Deep Insight selection and stop/send pointer safety. `AgentSidebar` maps those UI choices into store send options. The conversation store owns optimistic transcript state and replace semantics. Authenticated Web routes validate ownership and input. The DB repository atomically truncates the persisted session suffix and resets the active leaf used to rebuild model context. Agent request contracts and runtime map `thinking: true` to a non-off thinking level.

The two enhanced modes remain orthogonal: Deep Thinking changes model reasoning for one turn; Deep Insight selects a Skill prompt. A request may carry either or both without one rewriting the other.

## Replace data flow

1. Edit/regenerate identifies a persisted `turnId`; optimistic-only rows remain refill/retry operations and do not call truncate.
2. Before sending replacement content, the client calls the authenticated truncate route for the active chat and target turn.
3. The repository verifies user/chat/turn ownership, locates the target user entry sequence, deletes the suffix in one transaction, and moves `activeLeafId` to the last surviving entry.
4. Only after a successful truncate does the client remove the local suffix and send the replacement request.
5. Any truncate error or zero-owned result leaves the draft/transcript recoverable and blocks append. This protects model context correctness over convenience.

## Interaction contracts

- Stop is a `type=button` action. A guard spans the DOM swap from stop to submit so a late click cannot submit, while a later deliberate click or keyboard send remains valid.
- Deep Thinking is local boolean state, serializes only when enabled, and resets after a successful send initiation.
- Deep Insight keeps `skillId=deep-insight`; without page context it uses a workspace-oriented prompt and does not manufacture an attachment.
- Hero animation is CSS-only on the stable empty-session container and has a reduced-motion override.

## Compatibility and rollback

No schema migration is expected. Existing general requests that omit `thinking`, `skillId`, or replacement metadata retain current behavior. The branch is based on legacy integration commit `ad543ecf`; rollback is dropping the ZOO-84 branch/PR, not resetting any shared checkout. Merge stays blocked until stacked PR dependencies and independent acceptance are resolved.

## Risks

- The baseline combines open PRs #57-#61, so merge conflicts and duplicated changes are likely if their heads move.
- Client-side stop does not guarantee server-side generation cancellation; this task only guarantees the UI contract unless a compatible abort endpoint already exists.
- Timestamp-based suffix deletion must be reviewed for stable ordering; sequence-based deletion is authoritative for session entries.
