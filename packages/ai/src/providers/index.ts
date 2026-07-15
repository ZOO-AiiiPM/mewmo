import { resolveModelClientConfig } from "../config";
import { createAnthropicClient } from "./anthropic";
import { createOpenAICompatibleClient } from "./openai-compatible";
import type { ModelClient, ModelClientOptions } from "./types";

export type {
  AIProvider,
  CompletionInput,
  CompletionMessage,
  ModelClient,
  ModelClientOptions,
} from "./types";

export function createModelClient(options: ModelClientOptions = {}): ModelClient {
  const config = resolveModelClientConfig(options);
  return config.provider === "anthropic"
    ? createAnthropicClient(config)
    : createOpenAICompatibleClient(config);
}
