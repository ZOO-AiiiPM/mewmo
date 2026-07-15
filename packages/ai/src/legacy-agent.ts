import { htmlToSummaryMarkdown } from "./content/normalize";
import { loadPrompt } from "./prompts";
import { createModelClient } from "./providers";
import type { CompletionMessage, ModelClient, ModelClientOptions } from "./providers";

export interface AgentHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentContextInput {
  targetType: "note" | "clip" | "feed_entry";
  targetId: string;
  title: string;
  sourceUrl?: string | null;
  summarySnapshot?: string | null;
  contentSnapshot?: string | null;
}

export interface AgentReplyInput {
  history: AgentHistoryMessage[];
  userMessage: string;
  context?: AgentContextInput | null;
}

export interface GenerateAgentReplyOptions extends ModelClientOptions {
  prompt?: string;
  client?: ModelClient;
}

interface LegacyModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function buildAgentModelMessages({
  systemPrompt,
  history,
  userMessage,
  context,
}: AgentReplyInput & { systemPrompt: string }): LegacyModelMessage[] {
  return [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: buildAgentUserMessage(userMessage, context) },
  ];
}

export async function generateAgentReply(input: AgentReplyInput, options: GenerateAgentReplyOptions = {}) {
  const client = options.client ?? createModelClient(resolveAgentModelOptions(options));
  const systemPrompt = options.prompt ?? (await loadPrompt("agent.system.zh"));
  const legacyMessages = buildAgentModelMessages({ ...input, systemPrompt });
  const messages = legacyMessages.filter(
    (message): message is CompletionMessage => message.role === "user" || message.role === "assistant",
  );
  const result = await client.complete({
    system: systemPrompt,
    messages,
    maxTokens: 2048,
    temperature: 0.2,
  });
  return result.trim();
}

function resolveAgentModelOptions(options: GenerateAgentReplyOptions): ModelClientOptions {
  const envChatModel = process.env.AI_CHAT_MODEL;
  return {
    ...(options.provider ? { provider: options.provider } : {}),
    ...(options.apiKey ? { apiKey: options.apiKey } : {}),
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.model
      ? { model: options.model }
      : envChatModel && !envChatModel.startsWith("fill-")
        ? { model: envChatModel }
        : {}),
  };
}

function buildAgentUserMessage(userMessage: string, context?: AgentContextInput | null) {
  if (!context) return userMessage;

  return [
    `当前上下文：${contextTargetLabel(context.targetType)}`,
    `上下文 ID：${context.targetId}`,
    `标题：${context.title}`,
    `链接：${context.sourceUrl ?? ""}`,
    context.summarySnapshot ? `已有总结：${context.summarySnapshot}` : "",
    context.contentSnapshot ? ["正文（Markdown 清洗版）：", htmlToSummaryMarkdown(context.contentSnapshot)].join("\n") : "",
    "",
    `用户问题：${userMessage}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function contextTargetLabel(type: AgentContextInput["targetType"]) {
  if (type === "clip") return "剪藏";
  if (type === "feed_entry") return "订阅文章";
  return "笔记";
}
