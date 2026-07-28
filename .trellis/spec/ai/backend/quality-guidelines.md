# Quality Guidelines

> Code quality standards for backend development.

---

## Scenario: Provider-native Google tool loops

### 1. Scope / Trigger

This contract applies whenever `packages/ai` exposes a Google model through a
custom or relay `baseUrl`. Text generation and Agent tool loops use Google's
native Generative Language protocol even when the relay also offers an
OpenAI-compatible endpoint. Embeddings remain on the relay's documented
OpenAI-compatible `/openai/embeddings` path.

### 2. Signatures

- `createAIRuntime(config).model(purpose)` returns a Pi
  `Model<"google-generative-ai">` for `provider: "google"` endpoint models.
- `createAIRuntime(config).models().complete(model, context, options)` owns the
  complete multi-turn tool transcript, including provider metadata.
- `createAIRuntime(config).embed(input)` sends Google embedding requests to
  `${trimTrailingSlash(baseUrl)}/openai/embeddings`.

### 3. Contracts

- A Google tool-call response can attach `thoughtSignature` to a
  `functionCall` part. Pi must retain it on the assistant `toolCall` block and
  send the same value on the corresponding model part after the Tool Result.
- The configured Google `baseUrl` is the native API root, normally ending in
  `/v1beta`; the native adapter appends the model action path.
- API keys stay in runtime credentials. Tests use local servers and synthetic
  values; traces and logs must not record keys, prompts, tool arguments, tool
  results, or model text.
- Model pricing is explicit configuration or a reviewed provider catalog
  snapshot. Unknown pricing remains unknown rather than being reported as
  zero-cost usage.

### 4. Validation & Error Matrix

- Missing or changed tool-call signature -> provider rejects the follow-up;
  treat the turn as a provider failure and do not discard the original cause.
- `stopReason: "aborted"` -> Agent `timeout`.
- Provider error text containing `timeout` or `timed out` -> Agent `timeout`.
- Rate-limit text -> Agent `rate_limited`.
- Other provider error -> Agent `dependency_unavailable`.
- Unknown model price -> persist tokens with `pricingKnown: false` and omit
  `providerCostUsd` and `priceSnapshot`.

### 5. Good / Base / Bad Cases

- Good: first response contains a signed function call; the second request
  includes that exact signature plus the function response and completes.
- Base: a text-only Google response completes without tool metadata.
- Bad: the first response is decoded through a compatibility adapter that
  drops Google-only metadata; the follow-up tool request is invalid.

### 6. Tests Required

- A local HTTP/SSE regression must assert the first decoded `toolCall` contains
  `thoughtSignature` and the second raw request replays the identical value.
- Model selection tests must assert Google endpoint models use
  `api: "google-generative-ai"` while non-Google custom models remain
  `api: "openai-completions"`.
- Pricing tests must assert known snapshots and unknown-price behavior.
- Agent error tests must cover aborted, timeout-text, rate-limit, and generic
  provider errors.
- The repository production build must pass because Pi adapter upgrades can
  change bundler-visible dynamic imports even when package tests pass.

### 7. Wrong vs Correct

#### Wrong

```typescript
const api = googleProvider ? openAICompletionsApi : otherApi;
```

This can make a single text turn work while silently losing provider-native
metadata required by the next tool turn.

#### Correct

```typescript
const api = googleProvider ? googleGenerativeAIApi : otherApi;
```

Use the native adapter for native conversational state and keep a separate,
explicit endpoint only for capabilities such as embeddings.
