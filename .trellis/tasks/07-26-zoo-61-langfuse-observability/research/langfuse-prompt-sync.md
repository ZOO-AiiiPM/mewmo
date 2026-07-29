# Research: Langfuse prompt synchronization

- Query: Current official Langfuse TypeScript APIs compatible with `@langfuse/client`, `@langfuse/tracing`, and `@langfuse/otel` 5.9.1 on a Langfuse v4 project: prompt create/update/version/label semantics, runtime retrieval/compilation/cache/fallback, prompt-to-generation linking, Agent/Workflow input-output capture, and a drift-resistant code-owned synchronization model.
- Scope: mixed
- Date: 2026-07-29

## Findings

### Executive recommendation

Use the repository as the canonical source of prompt content and run a **single-writer CI synchronization job**, not application startup or every deployment replica. The job should canonicalize each code-owned prompt, compute a content digest, explicitly fetch Langfuse's `latest` version with caching disabled, and create a new version only when the canonical content/config differs. Store the repository commit and digest in `commitMessage` and/or prompt `config`. Create first without the runtime label, validate it, then promote the exact returned version by replacing its labels with the desired deployment labels. Runtime code should fetch an explicit stable label such as `production`, provide the checked-in prompt as `fallback`, keep the default stale-while-revalidate cache unless stricter freshness is required, compile variables locally, and attach the fetched prompt client to each generation observation.

This pattern is recommended because `prompt.create()` is **not idempotent**: creating a prompt with an existing name always adds a new version. SDK 5.9.1 exposes no idempotency key, conditional create, compare-and-swap, or transaction that combines version creation and tested label promotion. CI runs therefore also need repository/workflow concurrency serialization to prevent two commits from racing after reading the same old `latest` version.

### Compatibility baseline

- `pnpm-lock.yaml:1225`, `pnpm-lock.yaml:1235`, and `pnpm-lock.yaml:1244` lock `@langfuse/client`, `@langfuse/otel`, and `@langfuse/tracing` to 5.9.1.
- Official compatibility documentation lists Langfuse Server v4 and JS/TS SDK v5 as the current GA pair. JS/TS SDK v5 requires Node.js 20+. The project's v4 Langfuse project is therefore the correct server generation for the installed 5.9.1 packages.
- Official compatibility URL: https://langfuse.com/docs/compatibility
- Official JS/TS v4-to-v5 upgrade URL: https://langfuse.com/docs/observability/sdk/upgrade-path/js-v4-to-v5
- SDK v5 is observation-first. For new code, input/output belongs on the root observation itself. The legacy trace-level `setActiveTraceIO()`/`.setTraceIO()` APIs are deprecated and should not be used for this task.

### 1. Programmatic prompt creation and label/version behavior

Official prompt onboarding URL: https://langfuse.com/docs/prompt-management/get-started

Official version and label URL: https://langfuse.com/docs/prompt-management/features/prompt-version-control

Official Public API operation: https://api.reference.langfuse.com/#tag/prompts/post/api/public/v2/prompts

SDK 5.9.1 supports text and chat prompt creation through `LangfuseClient.prompt.create()`:

```ts
import { LangfuseClient } from "@langfuse/client";

const langfuse = new LangfuseClient();

const textPrompt = await langfuse.prompt.create({
  name: "workflow/article-summary.zh",
  type: "text",
  prompt: "Summarize {{article}}",
  config: { source: "repository", schemaVersion: 1 },
  labels: ["staging"],
  tags: ["mewmo", "workflow"],
  commitMessage: "repo=abc123 digest=sha256:...",
});

const chatPrompt = await langfuse.prompt.create({
  name: "agent/system.zh",
  type: "chat",
  prompt: [
    { role: "system", content: "You are the Mewmo agent." },
    { role: "user", content: "{{userMessage}}" },
  ],
  labels: ["staging"],
  commitMessage: "repo=abc123 digest=sha256:...",
});
```

Behavior:

- If the same prompt `name` already exists, `prompt.create()` adds another immutable, monotonically numbered version. It does not update content in place and does not deduplicate identical content.
- A prompt version has `name`, `version`, `type`, `prompt`, optional `config`, `labels`, `tags`, and optional `commitMessage`.
- `tags` are prompt-level organizational metadata shared across versions according to the 5.9.1 API type contract; labels identify deployment/version selections.
- `latest` is reserved and automatically maintained by Langfuse. It points to the most recently created version.
- Fetching without `version` or `label` returns the version carrying `production`, not `latest`. Sync code must request `label: "latest"` explicitly when comparing against the newest version.
- A label is unique across versions. Moving `production` to another version makes that version the default runtime version.
- `prompt.update()` in 5.9.1 updates only the **complete label set** of one existing version. It does not update prompt text, chat messages, config, tags, or commit message.

```ts
await langfuse.prompt.update({
  name: "workflow/article-summary.zh",
  version: textPrompt.version,
  newLabels: ["production"],
});
```

`newLabels` is replacement semantics, not append semantics. The caller must pass every label that should remain on the target version. The installed 5.9.1 declaration also states that labels are unique across versions and `latest` is reserved.

#### Idempotent synchronization pattern

There is no server-supported idempotency key in the 5.9.1 `prompt.create()` signature. A safe code-owned sync should be application-level idempotency:

```ts
type PromptSpec = {
  name: string;
  type: "text" | "chat";
  prompt: string | Array<{ role: string; content: string }>;
  config?: unknown;
  tags?: string[];
};

async function syncPrompt(langfuse: LangfuseClient, spec: PromptSpec) {
  const canonical = canonicalize(spec);
  const digest = sha256(canonical);

  let latest;
  try {
    latest = await langfuse.prompt.get(spec.name, {
      label: "latest",
      type: spec.type,
      cacheTtlSeconds: 0,
      maxRetries: 2,
      fetchTimeoutMs: 5_000,
    } as never);
  } catch (error) {
    if (!isPromptNotFound(error)) throw error;
  }

  if (latest && promptDigest(latest) === digest) return latest;

  return langfuse.prompt.create({
    ...spec,
    labels: ["staging"],
    commitMessage: `source=repository digest=${digest}`,
  } as never);
}
```

The example's casts only avoid expanding the text/chat overload in pseudocode; production code should branch on `spec.type` so TypeScript retains the exact overload. Canonicalization should normalize line endings, preserve semantically meaningful whitespace, sort object keys, and define whether tags/config participate in identity. Do not compare only the repository's handwritten integer version: the existing workflow parser already computes a content revision and is a stronger basis for drift detection.

Required race control:

- Use one CI concurrency group/mutex per Langfuse project and prompt namespace.
- Do not execute this sync from horizontally scaled app startup; multiple replicas can create duplicate versions.
- Fetch `latest` with `cacheTtlSeconds: 0` in the sync job; stale-while-revalidate is desirable at runtime but incorrect for an immediate write comparison.
- Treat a non-404 read error as failure, not “prompt missing,” or an outage can create an unintended version later in a partially recovered environment.
- Create a candidate version first, run validation/evals against its exact `version`, then call `prompt.update()` to move `production`. This avoids exposing an untested version.
- If strict code ownership is required, prevent manual movement/editing of managed labels by process/RBAC and run a scheduled or CI drift check. Langfuse does not make a prompt immutable merely because it originated in Git.

### 2. Runtime fetching, compilation, fallback, and caching

Official runtime introduction: https://langfuse.com/docs/prompt-management/get-started#use-prompt-diy

Official cache semantics: https://langfuse.com/docs/prompt-management/features/caching

Official variable syntax: https://langfuse.com/docs/prompt-management/features/variables

Text prompt:

```ts
const managedPrompt = await langfuse.prompt.get("workflow/article-summary.zh", {
  type: "text",
  label: "production",
  cacheTtlSeconds: 60,
  fallback: checkedInArticleSummaryPrompt,
  maxRetries: 2,
  fetchTimeoutMs: 3_000,
});

const compiled = managedPrompt.compile({ article });
```

Chat prompt:

```ts
const managedPrompt = await langfuse.prompt.get("agent/system-chat.zh", {
  type: "chat",
  label: "production",
  cacheTtlSeconds: 60,
  fallback: checkedInChatMessages,
  maxRetries: 2,
  fetchTimeoutMs: 3_000,
});

const messages = managedPrompt.compile({ userName: "Zoo" });
```

SDK 5.9.1 retrieval options are:

- `version?: number`
- `label?: string`
- `cacheTtlSeconds?: number`, with `0` disabling cache
- `fallback?: string` for text or `fallback?: ChatMessage[]` for chat
- `maxRetries?: number`
- `fetchTimeoutMs?: number`
- `type?: "text"` or required `type: "chat"` for chat overload inference

Cache behavior:

- Default local cache TTL is 60 seconds.
- Fresh cached prompts return immediately without a request.
- Expired cached prompts are returned immediately while an asynchronous background refresh runs. Runtime can therefore briefly continue serving an old deployment label after promotion; this is intentional stale-while-revalidate behavior.
- A cold cache miss waits for the API.
- Optional startup prefetch warms the process-local cache but is usually unnecessary according to the official documentation.
- If a fetch fails and a fallback is configured, 5.9.1 returns a prompt client with the fallback content, `isFallback === true`, and synthetic version `0`. The implementation catches any fetch error, so fallback can cover network errors, timeouts, authorization failures, and not-found responses; application logging/health checks must distinguish these conditions if silent fallback would hide misconfiguration.
- If stale cached data exists, refresh failure keeps returning the stale cached value. The provided fallback is relevant primarily when there is no cached value or caching is disabled.
- Cache is process-local. Each Agent/Workflow process has its own freshness window.

Compilation behavior:

- Variables use Mustache-style `{{variable}}` syntax.
- Text `.compile({ ... })` returns a string.
- Chat `.compile({ ... })` returns rendered messages; the second argument can resolve message placeholders.
- SDK 5.9.1 disables Mustache HTML escaping, so inserted values are passed through rather than entity-escaped.
- Compilation is local and does not make another Langfuse request.

Runtime recommendation for this repository:

- Keep checked-in source content available as `fallback` so Langfuse cannot become a business availability dependency.
- Fetch explicit `production`; never rely on the implicit default in code-owned infrastructure where intent should be visible.
- Use the returned `isFallback`, `version`, and `commitMessage` in safe metadata/health diagnostics, but do not log prompt content.
- Prefetch once during service initialization only if first-request latency is unacceptable. Initialization failure should not stop the service when the checked-in fallback is valid.
- Keep prompt fetching out of the hot path when the same prompt is used repeatedly; reuse a long-lived `LangfuseClient` so its cache is effective.

### 3. Link a managed prompt to generation observations and traces

Official prompt-linking URL: https://langfuse.com/docs/prompt-management/features/link-to-traces

SDK 5.9.1 `LangfuseGenerationAttributes.prompt` accepts `{ name, version, isFallback }`. A `TextPromptClient` or `ChatPromptClient` returned by `langfuse.prompt.get()` has those properties, so the official API passes the client directly.

```ts
import { startActiveObservation } from "@langfuse/tracing";

await startActiveObservation(
  "workflow.summary.generate",
  async (generation) => {
    const managedPrompt = await langfuse.prompt.get("workflow/article-summary.zh", {
      type: "text",
      label: "production",
      fallback: checkedInArticleSummaryPrompt,
    });

    generation.update({
      prompt: managedPrompt,
      input: managedPrompt.compile({ article }),
      model: requestedModel,
    });

    const result = await callModel();
    generation.update({ output: result.text });
    return result;
  },
  { asType: "generation" },
);
```

Manual child observations work the same way:

```ts
const generation = root.startObservation(
  "agent.model",
  {
    prompt: managedPrompt,
    input: requestMessages,
    model: requestedModel,
  },
  { asType: "generation" },
);

generation.update({ output: responseMessage });
generation.end();
```

Important details:

- Attach the prompt to the **generation that actually used it**, not merely to the root Agent/Chain observation.
- A fallback prompt may still be linked; `isFallback: true` and version `0` let Langfuse distinguish it from a managed version.
- Linking does not upload or create the prompt. It records the name/version/fallback association for analysis and prompt metrics.
- If a code path modifies the compiled prompt after fetching, the Langfuse link still identifies the managed source version; record transformation metadata if that distinction matters.

### 4. Full input/output on Agent and Workflow observations

Official observation-type URL: https://langfuse.com/docs/observability/features/observation-types

All installed 5.9.1 non-event observations share `LangfuseSpanAttributes`, whose `input?: unknown` and `output?: unknown` fields are available to `agent`, `chain`, `tool`, `generation`, `retriever`, and other observation types.

Agent root:

```ts
await startActiveObservation(
  "agent.turn",
  async (agent) => {
    agent.update({ input: fullAgentInput });
    const result = await runAgent();
    agent.update({ output: fullAgentOutput });
    return result;
  },
  { asType: "agent" },
);
```

Workflow root in SDK 5.9.1:

```ts
await startActiveObservation(
  "workflow.run",
  async (workflow) => {
    workflow.update({ input: fullWorkflowInput });
    const result = await runWorkflow();
    workflow.update({ output: fullWorkflowOutput });
    return result;
  },
  { asType: "chain" },
);
```

There is no `"workflow"` value in the installed 5.9.1 `LangfuseObservationType`. The supported values are `span`, `generation`, `event`, `embedding`, `agent`, `tool`, `chain`, `retriever`, `evaluator`, and `guardrail`. The project's existing `workflow.run` correctly uses `asType: "chain"` at `apps/ai-workflows/src/observability/langfuse.ts:205`. Calling it a “Workflow observation” is a project/domain name; its Langfuse observation type is `chain`.

Repository implications:

- Agent root `agent.turn` is already created with `asType: "agent"` at `apps/agent/src/observability/langfuse.ts:307`, but the root currently receives metadata/status only at `apps/agent/src/observability/langfuse.ts:170`, `apps/agent/src/observability/langfuse.ts:245`, and `apps/agent/src/observability/langfuse.ts:257`.
- Workflow root currently receives metadata/status only in `updateRun()` at `apps/ai-workflows/src/observability/langfuse.ts:235`.
- Full payload capture is technically just `root.update({ input })` and `root.update({ output })`, either at start/end or in a finalizer. Do not use deprecated trace-level I/O methods.
- Current Agent masking marks any object key matching `prompt`, `content`, `context`, `args`, `result`, `input`, or `output` as sensitive at `apps/agent/src/observability/langfuse.ts:382`. Current Workflow masking has the same broad behavior at `apps/ai-workflows/src/observability/langfuse.ts:298`. Full structured input/output will therefore be replaced with `[REDACTED]` when nested under conventional keys unless the masking policy is deliberately redesigned.
- The active task PRD explicitly prohibits prompt/user/model/tool body upload at `.trellis/tasks/07-26-zoo-61-langfuse-observability/prd.md:5`, `.trellis/tasks/07-26-zoo-61-langfuse-observability/prd.md:17`, `.trellis/tasks/07-26-zoo-61-langfuse-observability/prd.md:30`, and `.trellis/tasks/07-26-zoo-61-langfuse-observability/prd.md:42`. It also marks Workflow tracing and Prompt Management out of scope at `.trellis/tasks/07-26-zoo-61-langfuse-observability/prd.md:39` and `.trellis/tasks/07-26-zoo-61-langfuse-observability/prd.md:40`.

Therefore, recording “full” Agent/Workflow input/output is API-compatible but **not task-spec-compatible** without an explicit PRD/privacy decision. The implementation agent should not infer that this research authorizes payload upload.

### 5. Recommended source-of-truth and drift-control workflow

Official docs explicitly state that a script can read existing prompts and create them with the Public API, and describe this as suitable for bulk migrations or CI/CD integration:

- https://langfuse.com/docs/prompt-management/get-started#create-prompt-diy
- https://api.reference.langfuse.com/#tag/prompts/post/api/public/v2/prompts

Official GitHub integration URL: https://langfuse.com/docs/prompt-management/features/github-integration

The official GitHub integration covers Langfuse-driven workflows, including triggering repository CI from Langfuse changes and syncing Langfuse prompts into a repository. That is the opposite ownership direction from this task. For **code-owned prompts**, use repository-to-Langfuse CI and do not also enable Langfuse-to-repository writes for the same prompt namespace, because bidirectional synchronization creates ownership ambiguity and loops.

Recommended pipeline:

1. Define a manifest of managed prompts in the repository. Each entry declares Langfuse name, type, source file, config, tags, and target labels.
2. Parse source files and canonicalize content deterministically. Existing workflow frontmatter already supplies `id`, `task`, integer `version`, and a SHA-256-derived `revision` at `apps/ai-workflows/src/prompts.ts:15` and `apps/ai-workflows/src/prompts.ts:39`.
3. Compute a full digest over the normalized prompt body plus config/type. Prefer the digest over manually incremented frontmatter for idempotency.
4. Under a CI concurrency lock, fetch `label: "latest"` with `cacheTtlSeconds: 0`.
5. If digest/content/config match, report no-op. Optionally repair labels only when policy explicitly allows the sync job to own labels.
6. If different or missing, create a new unlabeled or `staging` candidate with `commitMessage` containing repository commit and digest.
7. Fetch the exact returned `version` or use the returned client, run prompt-specific tests/evals, and fail without promotion if validation fails.
8. Promote with `prompt.update({ name, version, newLabels: [...] })`. Because this replaces labels, provide the complete intended set.
9. Runtime fetches `production` with checked-in fallback and links the returned prompt client to each generation.
10. CI records a non-secret synchronization summary: prompt name, previous/new Langfuse version, digest, labels, and repository commit. Never print prompt bodies if they may contain sensitive material.
11. Run a read-only drift check on pull requests or a schedule. It should fail if `production` points at content not represented by the canonical repository digest, unless an explicit emergency override is documented.

This separates responsibilities cleanly:

- Git owns content review, rollback history, and the canonical digest.
- Langfuse owns runtime distribution, caching, prompt-version analytics, and deployment labels.
- CI owns one-way synchronization and promotion.
- Runtime never writes prompts and never decides whether a prompt should be promoted.

### Files found

- `pnpm-lock.yaml` — pins all three requested Langfuse packages to 5.9.1.
- `apps/agent/package.json` — Agent runtime depends on `@langfuse/otel` and `@langfuse/tracing`, but not currently `@langfuse/client`.
- `apps/ai-workflows/package.json` — Workflow runtime depends on tracing/OTel and has `@langfuse/client` as a dev dependency for live evals.
- `apps/agent/src/observability/langfuse.ts` — existing Agent `agent`/generation/tool instrumentation, fail-open initialization, broad payload masking, and safe shutdown.
- `apps/ai-workflows/src/observability/langfuse.ts` — existing Workflow `chain`/generation/embedding/retriever instrumentation and broad payload masking.
- `apps/agent/src/prompt-loader.ts` — loads Agent system and preset skill prompts directly from checked-in Markdown.
- `apps/agent/prompts/system.zh.md` — checked-in Agent system prompt source.
- `apps/agent/prompts/skills/deep-insight.zh.md` — checked-in Agent skill prompt source.
- `apps/ai-workflows/src/prompts.ts` — parses checked-in workflow prompt frontmatter and computes a 16-character SHA-256 revision.
- `apps/ai-workflows/prompts/article-summary.zh.md` — repository-owned summary prompt with id/version/task frontmatter.
- `apps/ai-workflows/prompts/note-insight.zh.md` — repository-owned insight prompt with id/version/task frontmatter.
- `apps/ai-workflows/prompts/summary-judge.zh.md` — repository-owned evaluation prompt with id/version/task frontmatter.
- `apps/ai-workflows/evals/live.ts` — already creates a long-lived `LangfuseClient` for datasets/experiments, showing project credentials and shutdown lifecycle.
- `.trellis/tasks/07-26-zoo-61-langfuse-observability/prd.md` — current privacy and scope contract; conflicts with full payload capture and includes Prompt Management/Workflow tracing in out-of-scope.
- `.trellis/tasks/07-26-zoo-61-langfuse-observability/design.md` — current observability design context.

### Installed 5.9.1 API evidence

The worktree itself has no `node_modules`; exact declarations were verified from the sibling checkout's installed lock-equivalent packages:

- `/Users/zoo/zoo/CC工作目录/进行中/mewmo/node_modules/.pnpm/@langfuse+client@5.9.1_@opentelemetry+api@1.9.0/node_modules/@langfuse/client/dist/index.d.ts` — `PromptManager.create`, `update`, `get`, typed fallback, cache TTL, retries, timeout, compile clients.
- `/Users/zoo/zoo/CC工作目录/进行中/mewmo/node_modules/.pnpm/@langfuse+client@5.9.1_@opentelemetry+api@1.9.0/node_modules/@langfuse/client/dist/index.mjs.map` — implementation evidence for stale-while-revalidate, fallback-on-fetch-error, fallback version `0`, `isFallback`, and prompt cache invalidation after label updates.
- `/Users/zoo/zoo/CC工作目录/进行中/mewmo/node_modules/.pnpm/@langfuse+tracing@5.9.1_@opentelemetry+api@1.9.0/node_modules/@langfuse/tracing/dist/index.d.ts` — observation types, shared input/output attributes, and generation prompt link shape.
- `/Users/zoo/zoo/CC工作目录/进行中/mewmo/node_modules/.pnpm/@langfuse+core@5.9.1_@opentelemetry+api@1.9.0/node_modules/@langfuse/core/dist/index.d.ts` — generated Public API prompt request/response types and label uniqueness/reserved-`latest` contract.

### Related specs

- `.trellis/workflow.md` — requires research and decisions to be persisted before implementation.
- `.trellis/spec/agent/backend/index.md` — Agent backend pre-development and quality entry point.
- `.trellis/spec/agent/backend/logging-guidelines.md` — relevant to non-secret synchronization and telemetry warnings.
- `.trellis/spec/agent/backend/error-handling.md` — relevant to fail-open runtime prompt retrieval and controlled fallback.
- `.trellis/spec/ai-workflows/backend/index.md` — Workflow backend pre-development and quality entry point.
- `.trellis/spec/shared/backend/logging-guidelines.md` — shared logging/privacy constraints.

### External references

- Langfuse Prompt Management get started: https://langfuse.com/docs/prompt-management/get-started
- Prompt data model: https://langfuse.com/docs/prompt-management/data-model
- Prompt versions and labels: https://langfuse.com/docs/prompt-management/features/prompt-version-control
- Prompt caching/fallback: https://langfuse.com/docs/prompt-management/features/caching
- Prompt variables/compilation: https://langfuse.com/docs/prompt-management/features/variables
- Prompt-to-trace/generation linking: https://langfuse.com/docs/prompt-management/features/link-to-traces
- GitHub integration: https://langfuse.com/docs/prompt-management/features/github-integration
- Observation types: https://langfuse.com/docs/observability/features/observation-types
- JS/TS SDK v4-to-v5 upgrade: https://langfuse.com/docs/observability/sdk/upgrade-path/js-v4-to-v5
- Server/SDK compatibility: https://langfuse.com/docs/compatibility
- Create prompt Public API: https://api.reference.langfuse.com/#tag/prompts/post/api/public/v2/prompts
- Langfuse JavaScript SDK repository: https://github.com/langfuse/langfuse-js

## Caveats / Not Found

- No `workflow` observation type exists in installed `@langfuse/tracing` 5.9.1. Use `chain` for the project-level Workflow root unless a future SDK version adds a dedicated type.
- No 5.9.1 TypeScript API was found for in-place prompt content updates. Content changes create new versions; `prompt.update()` only replaces labels on a selected version.
- No 5.9.1 idempotency key, ETag/conditional create, compare-and-swap label promotion, or atomic create-and-promote API was found. CI serialization and read/compare/create logic are required.
- `prompt.get()` fallback catches any fetch failure in 5.9.1, not only temporary availability errors. A fallback can mask bad credentials or a missing prompt unless the application emits safe diagnostics.
- Runtime cache revalidation is intentionally asynchronous. A label promotion is not instantly visible in every process; set `cacheTtlSeconds: 0` only where immediate freshness is more important than latency/availability, such as the synchronization job or exact-version validation.
- The current active-task PRD prohibits uploading the full prompt/user/model/tool payload and explicitly excludes Prompt Management and Workflow tracing. Implementing the requested “full input/output” or prompt synchronization in this same task requires an explicit scope/privacy update before code changes.
- The exact user's Langfuse project configuration, RBAC, prompt namespace, existing prompt versions, and manual UI edits were not queried because this was documentation/code research and no project credentials were used.
