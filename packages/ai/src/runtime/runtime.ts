import {
  contentText,
  createModels,
  createProvider,
  fauxAssistantMessage,
  fauxProvider,
  type Api,
  type AssistantMessage,
  type Model,
  type ModelCost,
  type Provider,
  type ProviderStreams,
  type Usage,
} from "@earendil-works/pi-ai";
import * as anthropicMessagesApi from "@earendil-works/pi-ai/api/anthropic-messages";
import * as openAICompletionsApi from "@earendil-works/pi-ai/api/openai-completions";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";

import type {
  AIRuntime,
  AIRuntimeConfig,
  EmbedInput,
  EmbeddingResult,
  FakeAIRuntimeOptions,
  GenerateObjectInput,
  GenerateTextInput,
  ModelDefinition,
  ModelPurpose,
  ObjectGenerationResult,
  ProviderDefinition,
  TextGenerationResult,
  UsageMetadata,
} from "./types";

const ZERO_COST: ModelCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

interface ResolvedPurpose {
  definition: ProviderDefinition;
  modelDefinition: ModelDefinition;
  model: Model<Api>;
  pricingKnown: boolean;
}

export function createAIRuntime(config: AIRuntimeConfig): AIRuntime {
  const models = createModels({ ...(config.credentials ? { credentials: config.credentials } : {}) });
  const providerIds = new Map<string, string>();
  const builtinProviders = new Set<string>();

  for (const [providerKey, definition] of Object.entries(config.providers)) {
    const configuredModels = Object.values(config.models)
      .filter((model): model is ModelDefinition => model?.provider === providerKey)
      .filter((model, index, values) => values.findIndex((value) => value.model === model.model) === index);
    const builtIn = createBuiltinProvider(definition, configuredModels);
    if (builtIn) {
      models.setProvider(builtIn);
      providerIds.set(providerKey, builtIn.id);
      builtinProviders.add(providerKey);
      continue;
    }
    models.setProvider(createEndpointProvider(providerKey, definition, configuredModels));
    providerIds.set(providerKey, providerKey);
  }

  const resolve = (purpose: Exclude<ModelPurpose, "workflow.embedding">): ResolvedPurpose => {
    const modelDefinition = config.models[purpose];
    if (!modelDefinition) throw new Error(`AI model purpose is not configured: ${purpose}`);
    const definition = config.providers[modelDefinition.provider];
    if (!definition) throw new Error(`AI provider is not configured: ${modelDefinition.provider}`);
    const providerId = providerIds.get(modelDefinition.provider);
    if (!providerId) throw new Error(`AI provider is not initialized: ${modelDefinition.provider}`);
    const model = models.getModel(providerId, modelDefinition.model);
    if (!model) throw new Error(`AI model is not available: ${providerId}/${modelDefinition.model}`);
    return {
      definition,
      modelDefinition,
      model,
      pricingKnown: builtinProviders.has(modelDefinition.provider) || modelDefinition.cost !== undefined,
    };
  };

  const runtime: AIRuntime = {
    models: () => models,
    model: (purpose) => resolve(purpose).model,
    modelPricing: (purpose) => {
      const resolved = resolve(purpose);
      return { known: resolved.pricingKnown, ...(resolved.pricingKnown ? { priceSnapshot: resolved.model.cost } : {}) };
    },
    async generateText(input) {
      return completeText(models, resolve(input.purpose), input);
    },
    async generateObject<T>(input: GenerateObjectInput<T>): Promise<ObjectGenerationResult<T>> {
      const attempts: TextGenerationResult[] = [];
      const maxSchemaRetries = Math.max(0, Math.min(input.maxSchemaRetries ?? 1, 3));
      let messages = [...input.messages];
      let parseError: unknown;

      for (let attempt = 0; attempt <= maxSchemaRetries; attempt += 1) {
        const generated = await completeText(models, resolve(input.purpose), { ...input, messages });
        attempts.push(generated);
        try {
          return { ...generated, object: input.schema.parse(parseJsonObject(generated.text)), attempts };
        } catch (error) {
          parseError = error;
          messages = [
            ...messages,
            { role: "assistant", content: generated.text },
            { role: "user", content: "上一次输出不符合要求。只返回可由 JSON.parse 解析、并符合既定 schema 的 JSON 对象，不要附带解释。" },
          ];
        }
      }
      throw parseError instanceof Error ? parseError : new Error("AI structured output was invalid");
    },
    async embed(input: EmbedInput): Promise<EmbeddingResult> {
      const modelDefinition = config.models[input.purpose];
      if (!modelDefinition) throw new Error(`AI model purpose is not configured: ${input.purpose}`);
      const definition = config.providers[modelDefinition.provider];
      if (!definition) throw new Error(`AI provider is not configured: ${modelDefinition.provider}`);
      if (definition.provider === "anthropic") throw new Error("anthropic provider does not support embeddings");
      return {
        embeddings: await requestEmbeddings(definition, modelDefinition.model, input.values),
        purpose: input.purpose,
        provider: definition.provider,
        model: modelDefinition.model,
      };
    },
  };
  return runtime;
}

export function createFakeAIRuntime(options: FakeAIRuntimeOptions = {}): AIRuntime {
  const faux = fauxProvider({ provider: "mewmo-fake", models: [{ id: "fake", name: "Mewmo fake" }] });
  const models = createModels();
  models.setProvider(faux.provider);
  if (options.agentResponses?.length) faux.setResponses(options.agentResponses.map((text) => fauxAssistantMessage(text)));

  const generateText = async (input: GenerateTextInput): Promise<TextGenerationResult> => {
    const configured = options.text ?? "fake response";
    const text = typeof configured === "function" ? await configured(input) : configured;
    return fakeTextResult(text, input.purpose);
  };

  return {
    models: () => models,
    model: () => faux.getModel(),
    modelPricing: () => ({ known: true, priceSnapshot: ZERO_COST }),
    generateText,
    async generateObject<T>(input: GenerateObjectInput<T>) {
      const generated = await generateText(input);
      return { ...generated, object: input.schema.parse(parseJsonObject(generated.text)), attempts: [generated] };
    },
    async embed(input) {
      const configured = options.embeddings ?? input.values.map(() => [0]);
      const embeddings = typeof configured === "function" ? await configured(input) : configured;
      return { embeddings, purpose: input.purpose, provider: "custom", model: "fake" };
    },
  };
}

async function completeText(
  models: ReturnType<typeof createModels>,
  resolved: ResolvedPurpose,
  input: GenerateTextInput,
): Promise<TextGenerationResult> {
  const response = await models.completeSimple(resolved.model, {
    ...(input.system ? { systemPrompt: input.system } : {}),
    messages: input.messages.map((message) => toPiMessage(message, resolved.model)),
  }, {
    ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
    ...(input.maxRetries === undefined ? {} : { maxRetries: input.maxRetries }),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  if (response.stopReason === "error" || response.stopReason === "aborted") {
    throw new Error(response.errorMessage ?? `Pi model generation stopped: ${response.stopReason}`);
  }
  return textResult(response, input.purpose, resolved);
}

function textResult(
  response: AssistantMessage,
  purpose: ModelPurpose,
  resolved: Pick<ResolvedPurpose, "model" | "pricingKnown">,
): TextGenerationResult {
  return {
    text: contentText(response.content),
    purpose,
    provider: response.provider,
    model: resolved.model.id,
    ...(response.responseModel ? { responseModel: response.responseModel } : {}),
    usage: usageMetadata(response.usage, resolved.model.cost, resolved.pricingKnown),
  };
}

function fakeTextResult(text: string, purpose: ModelPurpose): TextGenerationResult {
  return {
    text,
    purpose,
    provider: "custom",
    model: "fake",
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, providerCostUsd: 0, pricingKnown: true, priceSnapshot: ZERO_COST },
  };
}

function usageMetadata(usage: Usage, cost: ModelCost, pricingKnown: boolean): UsageMetadata {
  return {
    inputTokens: usage.input,
    outputTokens: usage.output,
    cacheReadTokens: usage.cacheRead,
    cacheWriteTokens: usage.cacheWrite,
    ...(usage.reasoning === undefined ? {} : { reasoningTokens: usage.reasoning }),
    totalTokens: usage.totalTokens,
    ...(pricingKnown ? { providerCostUsd: usage.cost.total, priceSnapshot: cost } : {}),
    pricingKnown,
  };
}

function createBuiltinProvider(definition: ProviderDefinition, models: ModelDefinition[]): Provider | undefined {
  if (!definition.useBuiltinProvider) return undefined;
  if (definition.provider === "openai") {
    const provider = openaiProvider();
    return models.every((model) => provider.getModels().some((candidate) => candidate.id === model.model)) ? provider : undefined;
  }
  if (definition.provider === "anthropic") {
    const provider = anthropicProvider();
    return models.every((model) => provider.getModels().some((candidate) => candidate.id === model.model)) ? provider : undefined;
  }
  return undefined;
}

function createEndpointProvider(id: string, definition: ProviderDefinition, models: ModelDefinition[]): Provider {
  const api = definition.provider === "anthropic" ? anthropicMessagesApi : openAICompletionsApi;
  const modelList: Array<Model<Api>> = models.map((model) => ({
    id: model.model,
    name: model.model,
    api: definition.provider === "anthropic" ? "anthropic-messages" as const : "openai-completions" as const,
    provider: id,
    baseUrl: definition.baseUrl,
    reasoning: model.reasoning ?? false,
    input: ["text"],
    cost: model.cost ?? ZERO_COST,
    contextWindow: model.contextWindow ?? 128_000,
    maxTokens: model.maxTokens ?? 8_192,
  }));
  return createProvider({
    id,
    name: id,
    auth: {
      apiKey: {
        name: `${definition.provider} API key`,
        async resolve({ credential }) {
          const key = credentialApiKey(credential) ?? definition.apiKey;
          if (!key) return undefined;
          return {
            auth: { apiKey: key, baseUrl: definition.baseUrl },
            source: credential ? "CredentialStore" : "server configuration",
          };
        },
      },
    },
    models: modelList,
    api: api as ProviderStreams,
  });
}

function credentialApiKey(credential: { type: "api_key"; key?: string } | { type: "oauth"; access: string } | undefined) {
  if (!credential) return undefined;
  return credential.type === "oauth" ? credential.access : credential.key;
}

function toPiMessage(
  message: { role: "user" | "assistant"; content: string },
  model: Model<Api>,
) {
  const timestamp = Date.now();
  if (message.role === "user") return { role: "user" as const, content: message.content, timestamp };
  return {
    role: "assistant" as const,
    content: [{ type: "text" as const, text: message.content }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { ...ZERO_COST, total: 0 } },
    stopReason: "stop" as const,
    timestamp,
  };
}

async function requestEmbeddings(provider: ProviderDefinition, model: string, values: string[]) {
  let response: Response;
  try {
    response = await (provider.fetch ?? fetch)(`${trimTrailingSlash(provider.baseUrl)}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: values }),
    });
  } catch {
    throw new Error(`${provider.provider} embedding request failed during transport`);
  }
  if (!response.ok) throw new Error(`${provider.provider} embedding request failed with status ${response.status}`);
  const data: unknown = await response.json().catch(() => undefined);
  if (!isRecord(data) || !Array.isArray(data.data)) throw new Error(`${provider.provider} embedding response did not include vectors`);
  const vectors = data.data.map((item) => {
    if (!isRecord(item) || !Array.isArray(item.embedding) || !item.embedding.every((value) => typeof value === "number")) {
      throw new Error(`${provider.provider} embedding response included an invalid vector`);
    }
    return item.embedding;
  });
  if (vectors.length !== values.length) throw new Error(`${provider.provider} embedding response count did not match input count`);
  return vectors;
}

function parseJsonObject(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(trimmed.slice(first, last + 1)) as unknown;
    throw new Error("AI response was not valid JSON");
  }
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
