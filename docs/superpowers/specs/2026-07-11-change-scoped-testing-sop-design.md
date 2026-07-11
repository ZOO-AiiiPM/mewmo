# Change-Scoped Testing SOP Design

## Purpose

Mewmo needs a testing workflow that proves each change without repeatedly paying for unrelated suites. Test scope follows the behavior and boundaries changed by the work; runtime is a consequence of that scope, not a separate fast/slow classification. Production releases retain a fixed minimum gate because deployability and live availability cannot be inferred from a narrow feature test.

This design also closes four reliability gaps exposed by the latest release: unit and integration tests were mixed behind one command, CI did not reproduce local prerequisites, assertions were tied to obsolete implementation text, and theme compliance existed as prose without executable checks.

## Sources of Truth

`agent.md` defines project policy and explains which evidence each change requires. `package.json` provides deterministic commands that implement those policies. Test files define behavior contracts. GitHub Actions runs the same self-contained project commands in a clean remote environment. Vercel proves that a production artifact built and deployed; it does not replace CI, API integration tests, or browser acceptance.

Existing process skills keep their current responsibilities: TDD governs test-first behavior, systematic debugging governs failure investigation, verification-before-completion prevents unsupported completion claims, and web deployment governs release observation. Mewmo will not add a testing skill yet because duplicating project rules across `agent.md`, scripts, and a skill would increase token cost and create conflicting sources of truth.

## Test Selection

Before running tests, identify the user behavior, modules, runtime boundaries, data boundaries, and environments touched by the diff. Select the smallest set of checks that can disprove regressions in those areas. Do not run a suite merely because it is available, and do not omit a relevant suite merely because it is expensive.

Pure logic changes require focused unit tests. API changes additionally require authentication, ownership, validation, persistence, and error-path integration evidence. UI behavior changes require component or static-contract coverage plus browser interaction. Visual changes require browser acceptance in both themes and relevant viewport sizes. Cache and performance changes require cache-hit, refresh, failure fallback, isolation, mutation consistency, and request-behavior evidence. CI changes require local execution of the same command followed by observation of the remote run.

When a diff crosses more than one boundary, combine the corresponding checks. Final reporting must state what ran, why it was relevant, what did not run, and why it was unrelated or unavailable. A generic statement that "tests pass" is insufficient because it hides the tested scope.

## Stable Project Commands

Project scripts will expose validation domains instead of forcing agents to rebuild shell exclusion lists:

- `test:unit` runs self-contained Node, Vitest, and package tests without Web, database, Redis, test accounts, or external network dependencies.
- `test:integration` runs API integration tests through a harness that prepares dependencies, starts Web, waits for readiness, creates isolated fixtures, runs tests, cleans data, and stops owned processes.
- `test:theme` scans application UI for disallowed theme-dependent hard-coded colors against a centralized allowlist.
- `test:e2e` runs browser scenarios when a browser harness is established; until then, the same acceptance steps remain explicit manual evidence.
- `test` aliases the deterministic self-contained test domain so it behaves consistently on any clean machine.
- `verify` runs the minimum local release checks that are universally required: lint, self-contained tests, theme policy checks, and production build. Feature-specific integration or browser checks run in addition when the diff requires them.

CI calls these scripts rather than embedding file-selection logic. The repository therefore has one executable definition for each domain. Environment-only values such as `TZ=Asia/Shanghai` remain in CI configuration when they describe the remote runner rather than test selection.

## Integration-Test Isolation

The current `clips-api`, `feeds-api`, `notes-api`, and `sync-api` files are integration tests even though they live under `tests/unit`. They will move to a dedicated integration location or be selected exclusively by the integration harness.

Integration tests cannot assume that `localhost:3000`, a fixed account, or old database records already exist. The harness owns every prerequisite it creates and cleans it even after failure. Test identities must be isolated per run. External content fetching must use controlled fixtures or interception rather than public URLs; a remote website is not part of Mewmo's test boundary and introduces latency, hangs, and nondeterminism.

Until this harness exists, CI runs only self-contained suites and labels the integration gap explicitly. It must not silently present excluded integration tests as passing.

## Theme Reliability

The application UI uses semantic theme variables such as `--ink`, `--ink-soft`, `--ink-faint`, `--canvas`, surface variables, line variables, hover, and selected states. Ordinary application components must not encode theme-dependent foreground or background colors as fixed white, black, `text-white`, or equivalent RGB values. Otherwise a component can look correct in dark mode while remaining white and unreadable after switching to light mode.

Fixed colors remain valid only where the visual meaning is intentionally independent of theme, such as brand artwork, image overlays, or a deliberately inverted control. These exceptions live in one centralized allowlist with a reason. Scattered test exclusions are prohibited because they make the effective policy impossible to audit.

The automated theme check detects newly introduced hard-coded theme colors outside the allowlist. Browser acceptance still switches the actual theme and inspects primary text, secondary text, icons, inputs and placeholders, borders, hover and selected states, disabled and destructive states, dialogs, popovers, toasts, editors, and sanitized external content. Static scanning catches policy violations early; it does not replace rendered verification.

## Assertion Lifecycle

Every assertion represents an approved behavior contract. Its evidence comes from a user request, an accepted spec, a project rule, an API schema, a data constraint, or a reproduced defect. Current implementation text alone is not sufficient evidence.

When a test fails, classify the failure before editing anything. If requirements are unchanged, repair the implementation. If an approved requirement changed, update the assertion and verify that it distinguishes old and new behavior. If the environment drifted, stabilize the environment or harness. If the assertion overfits source text, replace it with a behavioral assertion where possible and otherwise match only the stable semantic contract.

An agent may not weaken or update an assertion solely to make the suite green. The final report identifies any changed assertion and cites the requirement that justified the change.

## Local, CI, and Production Boundaries

Local validation supports focused debugging, real service dependencies, database inspection, and browser acceptance, but it can conceal implicit state such as existing users, stale servers, local timezone, or installed tools. CI starts from a clean checkout and exposes those hidden dependencies. CI `localhost` belongs to the runner and never refers to a Vercel deployment.

Vercel production status proves deployment packaging and availability. The immutable random deployment URL identifies one artifact for diagnosis. Release handoff and smoke testing use the stable production alias, currently `https://mewmo.vercel.app`, so users are not given an ephemeral-looking artifact URL as the canonical product address.

## Production Minimum Gate

Every production push retains these checks regardless of change size:

1. All change-relevant tests pass.
2. Lint passes.
3. The production build passes.
4. The working tree is clean and contains the intended commit.
5. Local and remote `main` resolve to the same commit.
6. GitHub CI succeeds.
7. The Vercel Production deployment becomes Ready.
8. A smoke test succeeds through the stable production alias.

Theme acceptance, API integration, or other domain checks are added when the diff touches those boundaries. The fixed gate proves release integrity; it does not replace change-specific evidence.

## Skill Decision

No project testing skill will be added in this iteration. The first implementation will keep policy in `agent.md` and mechanics in scripts, then observe real tasks. A project skill becomes justified only after repeated evidence that agents still select the wrong validation domain, skip theme acceptance, or alter assertions without evidence despite the aligned rules and commands. At that point the skill should orchestrate decisions by reading project scripts rather than duplicating their command bodies.

## Success Criteria

The design is successful when an agent can inspect a diff, name the affected validation domains, run only relevant checks plus the production minimum gate, and report exact evidence without reconstructing commands. Local and CI self-contained suites use the same scripts. API integration tests own their environment. Theme-dependent hard-coded colors fail an automated check unless a reviewed exception exists. Assertion changes always carry an explicit behavioral justification. Production handoff reports the stable alias and separately preserves the immutable deployment URL for traceability.
