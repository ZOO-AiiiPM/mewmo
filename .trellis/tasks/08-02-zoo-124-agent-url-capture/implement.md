# ZOO-124 Implementation Plan

1. Extract the existing clip and feed creation behavior into an actor-scoped application service; retain Web route status/body behavior by calling it.
2. Add Agent application port/adapters and direct URL tools, with tool descriptions and prompt rules that require explicit save/subscribe intent.
3. Map successful and failed capture results to sanitized public summaries and preserve internal-only tool events.
4. Add focused service and Agent tool tests for ownership, duplicates, no-write failures, intent boundaries and event-safe outputs.
5. Run focused tests, then lint, TypeScript/build, theme and diff checks. Review the final diff before commit.

## Rollback Gate

If extraction changes Web API behavior or requires schema/shared-type changes, stop and restore the route to the prior direct code before reporting the blocker. Do not add a parallel persistence path.
