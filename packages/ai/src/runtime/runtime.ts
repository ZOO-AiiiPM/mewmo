import { createAnthropicClient } from "../providers/anthropic";
import { createOpenAICompatibleClient } from "../providers/openai-compatible";
import type { LanguageModel } from "ai";
import { createRequire } from "node:module";
import type { ResolvedModelClientConfig } from "../providers/types";
import type {
  AIRuntime,
  AIRuntimeConfig,
  EmbedInput,
  EmbeddingResult,
  FakeAIRuntimeOptions,
  GenerateObjectInput,
  ModelDefinition,
  ModelPurpose,
  ObjectGenerationResult,
  ProviderDefinition,
} from "./types";

export function createAIRuntime(config: AIRuntimeConfig): AIRuntime {
  return {
    languageModel(purpose) {
      const resolved = resolvePurpose(config, purpose);
      return createLanguageModel(resolved.provider, resolved.model.model);
    },
    async generateText(input) {
      const resolved = resolvePurpose(config, input.purpose);
      const clientConfig = toClientConfig(resolved.provider, resolved.model.model);
      const client = resolved.provider.provider === "anthropic"
        ? createAnthropicClient(clientConfig)
        : createOpenAICompatibleClient(clientConfig);
      const text = await client.complete({
        ...(input.system === undefined ? {} : { system: input.system }),
        messages: input.messages,
        ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
        ...(input.temperature === undefined ? {} : { temperature: input.temperature }),
      });
      return metadata(input.purpose, resolved.provider, resolved.model, { text });
    },

    async generateObject<T>(input: GenerateObjectInput<T>): Promise<ObjectGenerationResult<T>> {
      const generated = await this.generateText(input);
      const parsed = parseJsonObject(generated.text);
      return {
        object: input.schema.parse(parsed),
        purpose: generated.purpose,
        provider: generated.provider,
        model: generated.model,
      };
    },

    async embed(input: EmbedInput): Promise<EmbeddingResult> {
      const resolved = resolvePurpose(config, input.purpose);
      if (resolved.provider.provider === "anthropic") {
        throw new Error("anthropic provider does not support embeddings");
      }
      const response = await requestEmbeddings(resolved.provider, resolved.model.model, input.values);
      return {
        embeddings: response,
        purpose: input.purpose,
        provider: resolved.provider.provider,
        model: resolved.model.model,
      };
    },
  };
}

export function createFakeAIRuntime(options: FakeAIRuntimeOptions = {}): AIRuntime {
  return {
    languageModel() {
      throw new Error("fake AI runtime does not expose an AI SDK language model");
    },
    async generateText(input) {
      const configured = options.text ?? "fake response";
      const text = typeof configured === "function" ? await configured(input) : configured;
      return { text, purpose: input.purpose, provider: "custom", model: "fake" };
    },
    async generateObject<T>(input: GenerateObjectInput<T>) {
      const generated = await this.generateText(input);
      return {
        object: input.schema.parse(parseJsonObject(generated.text)),
        purpose: generated.purpose,
        provider: generated.provider,
        model: generated.model,
      };
    },
    async embed(input) {
      const configured = options.embeddings ?? input.values.map(() => [0]);
      const embeddings = typeof configured === "function" ? await configured(input) : configured;
      return { embeddings, purpose: input.purpose, provider: "custom", model: "fake" };
    },
  };
}

function createLanguageModel(provider: ProviderDefinition, model: string): LanguageModel {
  const settings = {
    apiKey: requireValue(provider.apiKey, "AI provider apiKey is required"),
    baseURL: trimTrailingSlash(requireValue(provider.baseUrl, "AI provider baseUrl is required")),
    ...(provider.fetch === undefined ? {} : { fetch: provider.fetch }),
  };
  if (provider.provider === "anthropic") {
    const { createAnthropic } = loadProviderModule<typeof import("@ai-sdk/anthropic")>("@ai-sdk/anthropic", "ANTHROPIC_BASE_URL");
    return createAnthropic(settings).languageModel(model);
  }
  const { createOpenAI } = loadProviderModule<typeof import("@ai-sdk/openai")>("@ai-sdk/openai", "OPENAI_BASE_URL");
  return createOpenAI(settings).languageModel(model);
}

const require = createRequire(import.meta.url);

function loadProviderModule<T>(name: string, baseUrlEnvironmentVariable: string): T {
  const existing = process.env[baseUrlEnvironmentVariable];
  if (existing === "") delete process.env[baseUrlEnvironmentVariable];
  try {
    return require(name) as T;
  } finally {
    if (existing === "") process.env[baseUrlEnvironmentVariable] = existing;
  }
}

function resolvePurpose(config: AIRuntimeConfig, purpose: ModelPurpose) {
  const model = config.models[purpose];
  if (!model) throw new Error(`AI model purpose is not configured: ${purpose}`);
  const provider = config.providers[model.provider];
  if (!provider) throw new Error(`AI provider is not configured: ${model.provider}`);
  return { provider, model };
}

function toClientConfig(provider: ProviderDefinition, model: string): ResolvedModelClientConfig {
  return {
    provider: provider.provider,
    apiKey: requireValue(provider.apiKey, "AI provider apiKey is required"),
    baseUrl: trimTrailingSlash(requireValue(provider.baseUrl, "AI provider baseUrl is required")),
    model,
    fetch: provider.fetch ?? fetch,
  };
}

async function requestEmbeddings(provider: ProviderDefinition, model: string, values: string[]) {
  let response: Response;
  try {
    response = await (provider.fetch ?? fetch)(`${trimTrailingSlash(provider.baseUrl)}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input: values }),
    });
  } catch {
    throw new Error(`${provider.provider} embedding request failed during transport`);
  }
  if (!response.ok) {
    throw new Error(`${provider.provider} embedding request failed with status ${response.status}`);
  }
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(`${provider.provider} embedding response was not valid JSON`);
  }
  if (!isRecord(data) || !Array.isArray(data.data)) {
    throw new Error(`${provider.provider} embedding response did not include vectors`);
  }
  const vectors = data.data.map((item) => {
    if (!isRecord(item) || !Array.isArray(item.embedding) || !item.embedding.every((value) => typeof value === "number")) {
      throw new Error(`${provider.provider} embedding response included an invalid vector`);
    }
    return item.embedding;
  });
  if (vectors.length !== values.length) {
    throw new Error(`${provider.provider} embedding response count did not match input count`);
  }
  return vectors;
}

function metadata<T extends object>(purpose: ModelPurpose, provider: ProviderDefinition, model: ModelDefinition, value: T) {
  return { ...value, purpose, provider: provider.provider, model: model.model };
}

function parseJsonObject(text: string): unknown {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(normalized);
  } catch {
    throw new Error("AI model response was not valid structured JSON");
  }
}

function requireValue(value: string, message: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(message);
  return normalized;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
