import type { AIProvider, ModelClientOptions, ResolvedModelClientConfig } from "./providers/types";

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
  summaryModel: string;
}

export function resolveAIConfig(input: Record<string, string | undefined> = process.env): AIConfig {
  const provider = parseProvider(input.AI_PROVIDER);
  const summaryModel = requireValue(input.AI_SUMMARY_MODEL, "AI_SUMMARY_MODEL is required for AI configuration");

  if (provider === "anthropic") {
    return {
      provider,
      apiKey: requireValue(input.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY is required"),
      baseUrl: trimTrailingSlash(input.ANTHROPIC_BASE_URL ?? DEFAULT_ANTHROPIC_BASE_URL),
      summaryModel,
    };
  }

  if (provider === "custom") {
    return {
      provider,
      apiKey: requireValue(input.CUSTOM_AI_API_KEY, "CUSTOM_AI_API_KEY is required"),
      baseUrl: trimTrailingSlash(requireValue(input.CUSTOM_AI_BASE_URL, "CUSTOM_AI_BASE_URL is required")),
      summaryModel,
    };
  }

  return {
    provider,
    apiKey: requireValue(input.OPENAI_API_KEY, "OPENAI_API_KEY is required"),
    baseUrl: trimTrailingSlash(input.OPENAI_BASE_URL ?? DEFAULT_OPENAI_BASE_URL),
    summaryModel,
  };
}

export function resolveModelClientConfig(
  options: ModelClientOptions = {},
  input: Record<string, string | undefined> = process.env,
): ResolvedModelClientConfig {
  const provider = options.provider ?? parseProvider(input.AI_PROVIDER);
  const apiKey = requireValue(
    options.apiKey ?? providerApiKey(provider, input),
    `${providerEnvPrefix(provider)}_API_KEY is required`,
  );
  const baseUrl = requireValue(
    trimTrailingSlash(options.baseUrl ?? providerBaseUrl(provider, input)),
    `${providerEnvPrefix(provider)}_BASE_URL is required`,
  );
  const model = requireValue(
    options.model ?? input.AI_SUMMARY_MODEL,
    "AI_SUMMARY_MODEL is required for AI configuration",
  );

  return {
    provider,
    apiKey,
    baseUrl,
    model,
    fetch: options.fetch ?? fetch,
  };
}

function providerApiKey(provider: AIProvider, input: Record<string, string | undefined>) {
  if (provider === "anthropic") {
    return requireValue(input.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY is required");
  }
  if (provider === "custom") {
    return requireValue(input.CUSTOM_AI_API_KEY, "CUSTOM_AI_API_KEY is required");
  }
  return requireValue(input.OPENAI_API_KEY, "OPENAI_API_KEY is required");
}

function providerBaseUrl(provider: AIProvider, input: Record<string, string | undefined>) {
  if (provider === "anthropic") {
    return input.ANTHROPIC_BASE_URL?.trim() || DEFAULT_ANTHROPIC_BASE_URL;
  }
  if (provider === "custom") {
    return requireValue(input.CUSTOM_AI_BASE_URL, "CUSTOM_AI_BASE_URL is required");
  }
  return input.OPENAI_BASE_URL?.trim() || DEFAULT_OPENAI_BASE_URL;
}

function parseProvider(value: string | undefined): AIProvider {
  if (!value) return "openai";
  if (value === "openai" || value === "anthropic" || value === "custom") return value;
  throw new Error("AI_PROVIDER must be openai, anthropic, or custom");
}

function providerEnvPrefix(provider: AIProvider) {
  if (provider === "custom") return "CUSTOM_AI";
  if (provider === "anthropic") return "ANTHROPIC";
  return "OPENAI";
}

function requireValue(value: string | undefined, message: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(message);
  return normalized;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
