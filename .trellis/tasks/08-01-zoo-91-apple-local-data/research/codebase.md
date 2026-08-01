# Codebase Research

Baseline: `origin/main@ede90619`.

- `apps/apple/project.yml`: XcodeGen, macOS 14/iOS 17, Swift 6, shared Sources; currently no test target.
- `apps/apple/Makefile` and README: Apple verification runs locally on macOS and is outside pnpm/Turbo/Linux CI.
- `.trellis/spec/dev-apple.md`: planned local-first SwiftData architecture and shared fixtures requirement.
- `packages/sync/src/protocol.ts` and fixtures README: four entities, shared fields, opaque composite cursor and fixture semantics.
- `apps/web/src/app/api/sync/pull/route.ts`: ownership and full Prisma-row pull behavior.
- `packages/db/prisma/schema.prisma`: complete Note/Clip/Feed/FeedEntry fields.

Implementation cautions: pull and push fixtures have different completeness; dates include fractional seconds; SwiftData objects are non-Sendable; Feed/FeedEntry tombstones must not be collapsed by cascade deletion.
