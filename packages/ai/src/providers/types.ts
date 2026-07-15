export type AIProvider = "openai" | "anthropic" | "custom";

export interface CompletionMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CompletionInput {
  system?: string;
  messages: CompletionMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface ModelClientOptions {
  provider?: AIProvider;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  fetch?: typeof fetch;
}

export interface ModelClient {
  complete(input: CompletionInput): Promise<string>;
}

export interface ResolvedModelClientConfig {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  fetch: typeof fetch;
}
