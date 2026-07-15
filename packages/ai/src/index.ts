export { resolveAIConfig } from "./config";
export type { AIConfig } from "./config";
export { htmlToSummaryMarkdown } from "./content/normalize";
export type { ArticleContentInput } from "./content/types";
export { buildAgentModelMessages, generateAgentReply } from "./legacy-agent";
export type {
  AgentContextInput,
  AgentHistoryMessage,
  AgentReplyInput,
  GenerateAgentReplyOptions,
} from "./legacy-agent";
export { loadPrompt } from "./prompts";
export { createModelClient } from "./providers";
export type {
  AIProvider,
  CompletionInput,
  CompletionMessage,
  ModelClient,
  ModelClientOptions,
} from "./providers";
export { buildArticleSummaryUserPrompt, summarizeArticle } from "./summaries/article";
export type {
  ArticleSummaryInput,
  SummarizeArticleOptions,
  SummarizeContentOptions,
  SummaryContentInput,
} from "./summaries/types";

export { buildArticleSummaryUserPrompt as buildSummaryUserPrompt } from "./summaries/article";
export { summarizeArticle as summarizeContent } from "./summaries/article";
