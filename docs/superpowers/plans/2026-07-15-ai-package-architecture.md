# @mewmo/ai Package Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `@mewmo/ai` into reusable providers, article summarization, content normalization, and an isolated legacy Agent compatibility layer while formally supporting Custom OpenAI-compatible endpoints.

**Architecture:** `createModelClient` owns provider selection and protocol translation; `summarizeArticle` owns the product prompt and normalized article input; `legacy-agent.ts` temporarily preserves existing Web chat behavior through the same model client. Web and Worker migrate only their product-summary imports.

**Tech Stack:** TypeScript 6, Vitest 4, native `fetch`, OpenAI-compatible Chat Completions, Anthropic Messages API

---

### Task 1: Establish Provider Contracts

**Files:**
- Create: `packages/ai/src/providers/providers.test.ts`
- Create: `packages/ai/src/providers/types.ts`
- Create: `packages/ai/src/config.ts`
- Create: `packages/ai/src/providers/openai-compatible.ts`
- Create: `packages/ai/src/providers/anthropic.ts`
- Create: `packages/ai/src/providers/index.ts`

- [x] **Step 1: Write failing tests for OpenAI, Custom, Anthropic and safe failures**

Add tests that call the desired `createModelClient` API with injected `fetch`. Assert exact endpoint, headers and body for all providers; assert Custom without `baseUrl` throws before fetch; assert non-2xx and empty success responses do not include a supplied secret or article text in their errors.

- [x] **Step 2: Run provider tests and verify RED**

Run: `pnpm --filter @mewmo/ai exec vitest run src/providers/providers.test.ts`

Expected: FAIL because `./index` and the desired Provider API do not exist.

- [x] **Step 3: Implement the minimal Provider API**

Define these contracts and implement only their required behavior:

```ts
export type AIProvider = "openai" | "anthropic" | "custom";
export type CompletionMessage = { role: "user" | "assistant"; content: string };
export type CompletionInput = {
  system?: string;
  messages: CompletionMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
};
export type ModelClientOptions = {
  provider?: AIProvider;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetch?: typeof fetch;
};
export interface ModelClient {
  complete(input: CompletionInput): Promise<string>;
}
```

Resolve missing options from the current AI environment variables. Use OpenAI-compatible and Anthropic adapters; errors expose only provider/status/config field names.

- [x] **Step 4: Run provider tests and verify GREEN**

Run: `pnpm --filter @mewmo/ai exec vitest run src/providers/providers.test.ts`

Expected: all provider contract tests PASS.

### Task 2: Extract Article Summarization

**Files:**
- Create: `packages/ai/src/content/types.ts`
- Create: `packages/ai/src/content/normalize.ts`
- Create: `packages/ai/src/prompts.ts`
- Create: `packages/ai/src/summaries/types.ts`
- Create: `packages/ai/src/summaries/article.ts`
- Create: `packages/ai/src/summaries/article.test.ts`

- [x] **Step 1: Write failing article tests**

Test the desired `summarizeArticle` API with a fake `ModelClient`: distinguish clip/feed labels, load the external prompt, preserve headings/quotes/lists, remove script/style/img, and pass the expected system/user content and default generation settings to `complete`.

- [x] **Step 2: Run article tests and verify RED**

Run: `pnpm --filter @mewmo/ai exec vitest run src/summaries/article.test.ts`

Expected: FAIL because the article summary module does not exist.

- [x] **Step 3: Implement normalization, prompt loading and article summary**

Move the existing normalization behavior without changing its output. Implement:

```ts
export type ArticleSummaryInput = {
  type: "clip" | "feed_entry";
  title: string;
  source?: string;
  url?: string;
  content: string;
};

export async function summarizeArticle(
  input: ArticleSummaryInput,
  options?: SummarizeArticleOptions,
): Promise<string>;
```

Allow tests and future callers to inject a `ModelClient`; otherwise create it from Provider options.

- [x] **Step 4: Run article and provider tests and verify GREEN**

Run: `pnpm --filter @mewmo/ai exec vitest run src/summaries/article.test.ts src/providers/providers.test.ts`

Expected: both suites PASS.

### Task 3: Isolate Legacy Agent Compatibility

**Files:**
- Create: `packages/ai/src/legacy-agent.ts`
- Create: `packages/ai/src/legacy-agent.test.ts`
- Modify: `packages/ai/src/index.ts`
- Delete: `packages/ai/src/summarize.test.ts`

- [x] **Step 1: Write failing legacy compatibility tests**

Move the existing Agent message/context assertions into `legacy-agent.test.ts`. Add an injected-client test proving `generateAgentReply` delegates to `ModelClient.complete` with the Agent system prompt, history and normalized current context.

- [x] **Step 2: Run legacy test and verify RED**

Run: `pnpm --filter @mewmo/ai exec vitest run src/legacy-agent.test.ts`

Expected: FAIL because `legacy-agent.ts` does not exist.

- [x] **Step 3: Implement compatibility layer and public exports**

Move Agent-only types and prompt construction into `legacy-agent.ts`; use `createModelClient` rather than Provider-specific fetch code. Make `index.ts` a barrel for providers, article summary, normalization and explicitly marked legacy exports. Preserve `summarizeContent` and `SummaryContentInput` as compatibility aliases.

- [x] **Step 4: Run all AI tests and verify GREEN**

Run: `pnpm --filter @mewmo/ai test`

Expected: provider, article and legacy suites all PASS with no old mixed suite.

### Task 4: Migrate Product Summary Callers

**Files:**
- Modify: `apps/worker/src/workers/summary-worker.ts`
- Modify: `apps/worker/src/workers/summary-worker.test.ts`
- Modify: `apps/web/src/app/api/ai/summary/route.ts`
- Modify: `tests/unit/ai-summary-api.test.mjs`

- [x] **Step 1: Update static and Worker tests to require the new API**

Change assertions and dependency type names from `summarizeContent`/`SummaryContentInput` to `summarizeArticle`/`ArticleSummaryInput` before changing production imports.

- [x] **Step 2: Run focused caller tests and verify RED**

Run: `pnpm exec tsx --test tests/unit/ai-summary-api.test.mjs && pnpm --filter @mewmo/worker exec vitest run src/workers/summary-worker.test.ts`

Expected: static Web test FAIL because the route still names `summarizeContent`; Worker compilation/test FAIL or the new source assertion fails until its import is migrated.

- [x] **Step 3: Migrate Web and Worker imports**

Use `summarizeArticle` in both production callers while preserving payloads, ownership filters and persistence behavior.

- [x] **Step 4: Run focused caller tests and verify GREEN**

Run: `pnpm exec tsx --test tests/unit/ai-summary-api.test.mjs && pnpm --filter @mewmo/worker exec vitest run src/workers/summary-worker.test.ts`

Expected: all focused caller tests PASS.

### Task 5: Verify Architecture and Delivery

**Files:**
- Modify: `docs/superpowers/plans/2026-07-15-ai-package-architecture.md`

- [x] **Step 0: Address independent review findings with TDD**

Add failing tests for explicit empty Custom config, rejected fetch errors, null/primitive JSON, Custom Agent compatibility, and `AI_CHAT_MODEL` selection. Fix the shared config and Provider boundaries, then rerun all AI tests.

- [x] **Step 1: Check forbidden coupling and diff quality**

Run: `rg -n "generateAgentReply|AgentContextInput|agent.system" packages/ai/src --glob '!legacy-agent.ts' --glob '!legacy-agent.test.ts'`

Expected: no matches outside the compatibility layer/barrel export. Then run `git diff --check` and inspect `git diff --stat` plus the full diff.

- [x] **Step 2: Run related verification**

Run:

```bash
pnpm --filter @mewmo/ai test
pnpm --filter @mewmo/ai lint
pnpm --filter @mewmo/ai build
pnpm --filter @mewmo/worker test
pnpm --filter @mewmo/worker lint
pnpm --filter @mewmo/worker build
pnpm exec tsx --test tests/unit/ai-summary-api.test.mjs tests/unit/agent-api-static.test.mjs
pnpm --filter @mewmo/web lint
pnpm --filter @mewmo/web build
```

Expected: every command exits 0.

- [x] **Step 3: Commit the isolated change**

Stage only files listed by this plan and commit with a message describing the product-visible boundary:

```bash
git commit -m "refactor(ai): separate product AI from agent runtime"
```

- [ ] **Step 4: Comment implementation evidence on ZOO-34**

Post a Chinese Linear comment with architecture changes, Custom Provider behavior, exact verification commands/results, commit SHA, unverified items, and explicit request for user acceptance. Do not mark the Issue Done before user acceptance.
