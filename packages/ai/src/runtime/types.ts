import type { AIProvider, CompletionMessage } from "../providers/types";
import type { LanguageModel } from "ai";

export type ModelPurpose =
  | "agent.chat"
  | "agent.deep_insight"
  | "workflow.summary"
  | "workflow.recommendation"
  | "workflow.embedding"
  | "workflow.note_insight"
  | "eval.judge";

export interface ProviderDefinition {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
  fetch?: typeof fetch;
}

export interface ModelDefinition {
  provider: string;
  model: string;
}

export interface AIRuntimeConfig {
  providers: Record<string, ProviderDefinition>;
  models: Partial<Record<ModelPurpose, ModelDefinition>>;
}

export type AIEnvironment = Record<string, string | undefined>;

export interface GenerateTextInput {
  purpose: Exclude<ModelPurpose, "workflow.embedding">;
  system?: string;
  messages: CompletionMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateObjectInput<T> extends GenerateTextInput {
  schema: { parse(value: unknown): T };
}

export interface EmbedInput {
  purpose: "workflow.embedding";
  values: string[];
}

export interface TextGenerationResult {
  text: string;
  purpose: ModelPurpose;
  provider: AIProvider;
  model: string;
}

export interface ObjectGenerationResult<T> extends Omit<TextGenerationResult, "text"> {
  object: T;
}

export interface EmbeddingResult {
  embeddings: number[][];
  purpose: "workflow.embedding";
  provider: AIProvider;
  model: string;
}

export interface AIRuntime {
  languageModel(purpose: "agent.chat" | "agent.deep_insight"): LanguageModel;
  generateText(input: GenerateTextInput): Promise<TextGenerationResult>;
  generateObject<T>(input: GenerateObjectInput<T>): Promise<ObjectGenerationResult<T>>;
  embed(input: EmbedInput): Promise<EmbeddingResult>;
}

export type FakeTextHandler = (input: GenerateTextInput) => string | Promise<string>;
export type FakeEmbeddingHandler = (input: EmbedInput) => number[][] | Promise<number[][]>;

export interface FakeAIRuntimeOptions {
  text?: string | FakeTextHandler;
  embeddings?: number[][] | FakeEmbeddingHandler;
}
