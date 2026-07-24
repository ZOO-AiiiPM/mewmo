import type { AIEnvironment, AIRuntimeConfig, ModelDefinition, ModelPurpose } from "./types";
import type { AIProvider } from "../providers/types";
import { loadRerankerConfig } from "../rerank/env";

// Native Gemini surface. Chat rides Pi's google provider; embeddings ride the
// OpenAI-compatible sub-path (see runtime.ts) since Pi has no embedding port.
const GOOGLE_NATIVE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

const purposes: Array<[ModelPurpose, string[]]> = [
  ["agent.chat", ["AI_MODEL_AGENT_CHAT", "AI_CHAT_MODEL"]],
  ["agent.deep_insight", ["AI_MODEL_DEEP_INSIGHT", "AI_MODEL_AGENT_CHAT", "AI_CHAT_MODEL"]],
  ["workflow.summary", ["AI_MODEL_SUMMARY", "AI_SUMMARY_MODEL"]],
  ["workflow.recommendation", ["AI_MODEL_RECOMMENDATION", "AI_MODEL_AGENT_CHAT", "AI_CHAT_MODEL"]],
  ["workflow.embedding", ["AI_MODEL_EMBEDDING", "AI_EMBEDDING_MODEL"]],
  ["workflow.note_insight", ["AI_MODEL_NOTE_INSIGHT", "AI_MODEL_AGENT_CHAT", "AI_CHAT_MODEL"]],
  ["eval.judge", ["AI_MODEL_EVAL_JUDGE", "AI_MODEL_DEEP_INSIGHT", "AI_MODEL_AGENT_CHAT", "AI_CHAT_MODEL"]],
];

export function loadAIRuntimeConfig(input: AIEnvironment = process.env): AIRuntimeConfig {
  const provider = parseProvider(input.AI_PROVIDER);
  const providerName = "primary";
  const models: AIRuntimeConfig["models"] = {};
  for (const [purpose, names] of purposes) {
    const model = names.map((name) => input[name]?.trim()).find(Boolean);
    if (!model) continue;
    const definition: ModelDefinition = { provider: providerName, model };
    if (purpose === "workflow.embedding") {
      const dimensions = Number.parseInt(input.AI_EMBEDDING_DIMENSIONS?.trim() ?? "", 10);
      if (Number.isFinite(dimensions) && dimensions > 0) definition.dimensions = dimensions;
    }
    models[purpose] = definition;
  }
  return {
    providers: {
      [providerName]: {
        provider,
        apiKey: required(apiKeyFor(provider, input), `${apiKeyName(provider)} is required`),
        baseUrl: stripSlash(required(baseUrlFor(provider, input), `${baseUrlName(provider)} is required`)),
        // Standard endpoints can use Pi's maintained model catalog and OAuth
        // resolver. Relays stay on the endpoint adapter because their model
        // names and wire compatibility are deployment-specific.
        useBuiltinProvider: usesBuiltinProvider(provider, baseUrlFor(provider, input)),
      },
    },
    models,
    reranker: loadRerankerConfig(input),
  };
}

function parseProvider(value: string | undefined): AIProvider {
  if (!value || value === "openai") return "openai";
  if (value === "anthropic" || value === "custom" || value === "google") return value;
  throw new Error("AI_PROVIDER must be openai, anthropic, custom, or google");
}

function apiKeyFor(provider: AIProvider, input: AIEnvironment) {
  if (provider === "anthropic") return input.ANTHROPIC_API_KEY;
  if (provider === "custom") return input.CUSTOM_AI_API_KEY;
  if (provider === "google") return input.GEMINI_API_KEY;
  return input.OPENAI_API_KEY;
}

function baseUrlFor(provider: AIProvider, input: AIEnvironment) {
  if (provider === "anthropic") return input.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com/v1";
  if (provider === "custom") return input.CUSTOM_AI_BASE_URL;
  if (provider === "google") return input.GEMINI_BASE_URL ?? GOOGLE_NATIVE_BASE_URL;
  return input.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
}

function apiKeyName(provider: AIProvider) {
  if (provider === "anthropic") return "ANTHROPIC_API_KEY";
  if (provider === "custom") return "CUSTOM_AI_API_KEY";
  if (provider === "google") return "GEMINI_API_KEY";
  return "OPENAI_API_KEY";
}

function baseUrlName(provider: AIProvider) {
  if (provider === "anthropic") return "ANTHROPIC_BASE_URL";
  if (provider === "custom") return "CUSTOM_AI_BASE_URL";
  if (provider === "google") return "GEMINI_BASE_URL";
  return "OPENAI_BASE_URL";
}

function required(value: string | undefined, message: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(message);
  return normalized;
}

function stripSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function usesBuiltinProvider(provider: AIProvider, baseUrl: string | undefined) {
  const normalized = baseUrl?.replace(/\/+$/, "");
  if (provider === "openai") return normalized === "https://api.openai.com/v1";
  if (provider === "anthropic") return normalized === "https://api.anthropic.com/v1";
  if (provider === "google") return normalized === GOOGLE_NATIVE_BASE_URL;
  return false;
}
