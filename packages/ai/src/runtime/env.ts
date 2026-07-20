import type { AIEnvironment, AIRuntimeConfig, ModelPurpose } from "./types";

const purposes: Array<[ModelPurpose, string]> = [
  ["agent.chat", "AI_MODEL_AGENT_CHAT"],
  ["agent.deep_insight", "AI_MODEL_DEEP_INSIGHT"],
  ["workflow.summary", "AI_MODEL_SUMMARY"],
  ["workflow.recommendation", "AI_MODEL_RECOMMENDATION"],
  ["workflow.embedding", "AI_MODEL_EMBEDDING"],
  ["workflow.note_insight", "AI_MODEL_NOTE_INSIGHT"],
  ["eval.judge", "AI_MODEL_EVAL_JUDGE"],
];

export function loadAIRuntimeConfig(input: AIEnvironment = process.env): AIRuntimeConfig {
  const provider = parseProvider(input.AI_PROVIDER);
  const providerName = "primary";
  const models: AIRuntimeConfig["models"] = {};
  for (const [purpose, name] of purposes) {
    const model = input[name]?.trim();
    if (model) models[purpose] = { provider: providerName, model };
  }
  return {
    providers: {
      [providerName]: {
        provider,
        apiKey: required(apiKeyFor(provider, input), `${apiKeyName(provider)} is required`),
        baseUrl: stripSlash(required(baseUrlFor(provider, input), `${baseUrlName(provider)} is required`)),
      },
    },
    models,
  };
}

function parseProvider(value: string | undefined) {
  if (!value || value === "openai") return "openai" as const;
  if (value === "anthropic" || value === "custom") return value;
  throw new Error("AI_PROVIDER must be openai, anthropic, or custom");
}

function apiKeyFor(provider: "openai" | "anthropic" | "custom", input: AIEnvironment) {
  if (provider === "anthropic") return input.ANTHROPIC_API_KEY;
  if (provider === "custom") return input.CUSTOM_AI_API_KEY;
  return input.OPENAI_API_KEY;
}

function baseUrlFor(provider: "openai" | "anthropic" | "custom", input: AIEnvironment) {
  if (provider === "anthropic") return input.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com/v1";
  if (provider === "custom") return input.CUSTOM_AI_BASE_URL;
  return input.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
}

function apiKeyName(provider: "openai" | "anthropic" | "custom") {
  if (provider === "anthropic") return "ANTHROPIC_API_KEY";
  if (provider === "custom") return "CUSTOM_AI_API_KEY";
  return "OPENAI_API_KEY";
}

function baseUrlName(provider: "openai" | "anthropic" | "custom") {
  if (provider === "anthropic") return "ANTHROPIC_BASE_URL";
  if (provider === "custom") return "CUSTOM_AI_BASE_URL";
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
