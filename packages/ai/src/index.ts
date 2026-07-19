import { readFile } from "node:fs/promises";

import {
  videoAnalysisResultSchema,
  type VideoAnalysisResult,
  type VideoTranscriptSegment,
} from "@mewmo/shared";

export interface SummaryContentInput {
  type: "clip" | "feed_entry";
  title: string;
  source?: string;
  url?: string;
  content: string;
}

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

export type AIProvider = "openai" | "anthropic" | "custom";

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
  summaryModel: string;
}

export interface SummarizeContentOptions {
  provider?: AIProvider;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  prompt?: string;
  fetch?: typeof fetch;
}

export interface VideoAnalysisInput {
  title: string;
  source?: string;
  url?: string;
  durationSeconds?: number | null;
  transcript: VideoTranscriptSegment[];
}

export type AnalyzeVideoTranscriptOptions = SummarizeContentOptions;

export type GenerateAgentReplyOptions = SummarizeContentOptions;

interface ModelMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface AgentConversationModelMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface AnthropicMessagesResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
}

const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";

export async function loadPrompt(id: string) {
  const promptPath = new URL(`../prompts/${id}.md`, import.meta.url);
  const raw = await readFile(promptPath, "utf8");
  return stripFrontmatter(raw).trim();
}

export function buildSummaryUserPrompt(input: SummaryContentInput) {
  const content = htmlToSummaryMarkdown(input.content);
  return [
    `内容类型：${input.type === "clip" ? "剪藏" : "订阅文章"}`,
    `标题：${input.title}`,
    `来源：${input.source ?? ""}`,
    `链接：${input.url ?? ""}`,
    "",
    "正文（Markdown 清洗版）：",
    content,
  ].join("\n");
}

export function buildVideoAnalysisUserPrompt(input: VideoAnalysisInput) {
  return [
    `标题：${input.title}`,
    `来源：${input.source ?? ""}`,
    `链接：${input.url ?? ""}`,
    `视频时长：${input.durationSeconds ?? "未知"} 秒`,
    "",
    "带时间戳字幕：",
    ...input.transcript.map(
      (segment) =>
        `[${formatVideoTimestamp(segment.startSeconds)} - ${formatVideoTimestamp(segment.endSeconds)}] ${segment.text}`,
    ),
  ].join("\n");
}

export function buildAgentModelMessages({
  systemPrompt,
  history,
  userMessage,
  context,
}: AgentReplyInput & { systemPrompt: string }): ModelMessage[] {
  const messages: ModelMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.map((message) => ({
      role: message.role,
      content: message.content,
    })),
  ];

  messages.push({
    role: "user",
    content: buildAgentUserMessage(userMessage, context),
  });

  return messages;
}

export async function generateAgentReply(input: AgentReplyInput, options: GenerateAgentReplyOptions = {}) {
  const config = resolveAgentConfig(options);
  const fetchImpl = options.fetch ?? fetch;
  const systemPrompt = options.prompt ?? (await loadPrompt("agent.system.zh"));
  const messages = buildAgentModelMessages({ ...input, systemPrompt });

  if (config.provider === "anthropic") {
    return generateWithAnthropicMessages({
      ...config,
      fetch: fetchImpl,
      systemPrompt,
      messages: messages.filter((message): message is AgentConversationModelMessage => message.role !== "system"),
    });
  }

  return generateWithOpenAICompatibleMessages({ ...config, fetch: fetchImpl, messages });
}

export function htmlToSummaryMarkdown(input: string) {
  const source = input.trim();
  if (!source) return "";
  if (!/<[a-zA-Z][\w:-]*(?:\s|>|\/>)/.test(source)) {
    return normalizeMarkdownText(decodeHtmlEntities(source));
  }

  let markdown = source
    .replace(/<!--[\s\S]*?-->|<!doctype[^>]*>/gi, "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, "")
    .replace(/<math\b[\s\S]*?<\/math>/gi, "")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "")
    .replace(/<img\b[^>]*>/gi, "");

  markdown = replaceBlock(markdown, "blockquote", (inner) => {
    const quote = htmlToSummaryMarkdown(inner)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => `> ${line}`)
      .join("\n");
    return quote ? `\n\n${quote}\n\n` : "\n\n";
  });

  markdown = markdown.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level: string, inner: string) => {
    const text = inlineHtmlToText(inner);
    if (!text) return "\n\n";
    return `\n\n${"#".repeat(Number(level))} ${text}\n\n`;
  });

  markdown = markdown.replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_match, inner: string) => {
    const text = inlineHtmlToText(inner);
    return text ? `\n- ${text}\n` : "\n";
  });

  markdown = markdown
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<hr\s*\/?>/gi, "\n\n---\n\n")
    .replace(/<\/(?:ul|ol)>/gi, "\n")
    .replace(/<t[dh]\b[^>]*>/gi, " ")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/(?:p|div|section|article|main|header|footer|table|thead|tbody|pre)>/gi, "\n\n")
    .replace(/<(?:p|div|section|article|main|header|footer|table|thead|tbody|pre|ul|ol|tr)\b[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");

  return normalizeMarkdownText(decodeHtmlEntities(markdown));
}

export function resolveAIConfig(input: Record<string, string | undefined> = process.env): AIConfig {
  const provider = parseProvider(input.AI_PROVIDER);
  const summaryModel = input.AI_SUMMARY_MODEL;
  if (!summaryModel) {
    throw new Error("AI_SUMMARY_MODEL is required for summarization");
  }

  if (provider === "anthropic") {
    return {
      provider,
      apiKey: requireEnv(input.ANTHROPIC_API_KEY, "ANTHROPIC_API_KEY"),
      baseUrl: trimTrailingSlash(input.ANTHROPIC_BASE_URL ?? DEFAULT_ANTHROPIC_BASE_URL),
      summaryModel,
    };
  }

  if (provider === "custom") {
    return {
      provider,
      apiKey: requireEnv(input.CUSTOM_AI_API_KEY, "CUSTOM_AI_API_KEY"),
      baseUrl: trimTrailingSlash(requireEnv(input.CUSTOM_AI_BASE_URL, "CUSTOM_AI_BASE_URL")),
      summaryModel,
    };
  }

  return {
    provider,
    apiKey: requireEnv(input.OPENAI_API_KEY, "OPENAI_API_KEY"),
    baseUrl: trimTrailingSlash(input.OPENAI_BASE_URL ?? DEFAULT_OPENAI_BASE_URL),
    summaryModel,
  };
}

export async function summarizeContent(input: SummaryContentInput, options: SummarizeContentOptions = {}) {
  const config = resolveSummarizeConfig(options);
  const fetchImpl = options.fetch ?? fetch;
  const systemPrompt = options.prompt ?? (await loadPrompt("summary.zh"));
  const userPrompt = buildSummaryUserPrompt(input);

  if (config.provider === "anthropic") {
    return summarizeWithAnthropic({ ...config, fetch: fetchImpl, systemPrompt, userPrompt });
  }

  return summarizeWithOpenAICompatible({ ...config, fetch: fetchImpl, systemPrompt, userPrompt });
}

export async function analyzeVideoTranscript(
  input: VideoAnalysisInput,
  options: AnalyzeVideoTranscriptOptions = {},
): Promise<VideoAnalysisResult> {
  const config = resolveSummarizeConfig(options);
  const fetchImpl = options.fetch ?? fetch;
  const systemPrompt = options.prompt ?? (await loadPrompt("video.analysis.zh"));
  const userPrompt = buildVideoAnalysisUserPrompt(input);

  const raw =
    config.provider === "anthropic"
      ? await analyzeVideoWithAnthropic({ ...config, fetch: fetchImpl, systemPrompt, userPrompt })
      : await analyzeVideoWithOpenAICompatible({ ...config, fetch: fetchImpl, systemPrompt, userPrompt });

  const analysis = parseVideoAnalysisResponse(raw);
  validateVideoAnalysisTimeline(analysis, input.durationSeconds);
  return analysis;
}

export function parseVideoAnalysisResponse(raw: string): VideoAnalysisResult {
  const normalized = unwrapJsonFence(raw.trim());
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new Error("AI video analysis response was not valid JSON");
  }

  return videoAnalysisResultSchema.parse(parsed);
}

async function summarizeWithOpenAICompatible({
  apiKey,
  baseUrl,
  summaryModel,
  fetch,
  systemPrompt,
  userPrompt,
}: AIConfig & { fetch: typeof globalThis.fetch; systemPrompt: string; userPrompt: string }) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: summaryModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 2048,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`AI summary request failed: ${response.status} ${body}`.trim());
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("AI summary response did not include message content");
  }

  return content;
}

async function analyzeVideoWithOpenAICompatible({
  apiKey,
  baseUrl,
  summaryModel,
  fetch,
  systemPrompt,
  userPrompt,
}: AIConfig & { fetch: typeof globalThis.fetch; systemPrompt: string; userPrompt: string }) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: summaryModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 4096,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`AI video analysis request failed: ${response.status} ${body}`.trim());
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("AI video analysis response did not include message content");
  }

  return content;
}

async function generateWithOpenAICompatibleMessages({
  apiKey,
  baseUrl,
  summaryModel,
  fetch,
  messages,
}: AIConfig & { fetch: typeof globalThis.fetch; messages: ModelMessage[] }) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: summaryModel,
      messages,
      max_tokens: 2048,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`AI agent request failed: ${response.status} ${body}`.trim());
  }

  const data = (await response.json()) as ChatCompletionResponse;
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("AI agent response did not include message content");
  }

  return content;
}

async function summarizeWithAnthropic({
  apiKey,
  baseUrl,
  summaryModel,
  fetch,
  systemPrompt,
  userPrompt,
}: AIConfig & { fetch: typeof globalThis.fetch; systemPrompt: string; userPrompt: string }) {
  const response = await fetch(`${baseUrl}/messages`, {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: summaryModel,
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`AI summary request failed: ${response.status} ${body}`.trim());
  }

  const data = (await response.json()) as AnthropicMessagesResponse;
  const content = data.content?.find((item) => item.type === "text" && item.text)?.text?.trim();
  if (!content) {
    throw new Error("AI summary response did not include message content");
  }

  return content;
}

async function analyzeVideoWithAnthropic({
  apiKey,
  baseUrl,
  summaryModel,
  fetch,
  systemPrompt,
  userPrompt,
}: AIConfig & { fetch: typeof globalThis.fetch; systemPrompt: string; userPrompt: string }) {
  const response = await fetch(`${baseUrl}/messages`, {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: summaryModel,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`AI video analysis request failed: ${response.status} ${body}`.trim());
  }

  const data = (await response.json()) as AnthropicMessagesResponse;
  const content = data.content?.find((item) => item.type === "text" && item.text)?.text?.trim();
  if (!content) {
    throw new Error("AI video analysis response did not include message content");
  }

  return content;
}

async function generateWithAnthropicMessages({
  apiKey,
  baseUrl,
  summaryModel,
  fetch,
  systemPrompt,
  messages,
}: AIConfig & { fetch: typeof globalThis.fetch; systemPrompt: string; messages: AgentConversationModelMessage[] }) {
  const response = await fetch(`${baseUrl}/messages`, {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      model: summaryModel,
      max_tokens: 2048,
      system: systemPrompt,
      messages,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`AI agent request failed: ${response.status} ${body}`.trim());
  }

  const data = (await response.json()) as AnthropicMessagesResponse;
  const content = data.content?.find((item) => item.type === "text" && item.text)?.text?.trim();
  if (!content) {
    throw new Error("AI agent response did not include message content");
  }

  return content;
}

function resolveSummarizeConfig(options: SummarizeContentOptions): AIConfig {
  const provider = options.provider ?? parseProvider(process.env.AI_PROVIDER);
  const envConfig =
    options.apiKey && options.model && (provider !== "custom" || options.baseUrl)
      ? null
      : resolveAIConfig({ ...process.env, AI_PROVIDER: provider });

  return {
    provider,
    apiKey: options.apiKey ?? envConfig?.apiKey ?? "",
    baseUrl: trimTrailingSlash(
      options.baseUrl ??
        envConfig?.baseUrl ??
        (provider === "anthropic" ? DEFAULT_ANTHROPIC_BASE_URL : DEFAULT_OPENAI_BASE_URL),
    ),
    summaryModel: options.model ?? envConfig?.summaryModel ?? "",
  };
}

function resolveAgentConfig(options: GenerateAgentReplyOptions): AIConfig {
  const provider = options.provider ?? parseProvider(process.env.AI_PROVIDER);
  const envConfig =
    options.apiKey && options.model && (provider !== "custom" || options.baseUrl)
      ? null
      : resolveAIConfig({ ...process.env, AI_PROVIDER: provider });
  const envChatModel = process.env.AI_CHAT_MODEL;
  const chatModel =
    envChatModel && !envChatModel.startsWith("fill-") ? envChatModel : envConfig?.summaryModel;

  return {
    provider,
    apiKey: options.apiKey ?? envConfig?.apiKey ?? "",
    baseUrl: trimTrailingSlash(
      options.baseUrl ??
        envConfig?.baseUrl ??
        (provider === "anthropic" ? DEFAULT_ANTHROPIC_BASE_URL : DEFAULT_OPENAI_BASE_URL),
    ),
    summaryModel: options.model ?? chatModel ?? "",
  };
}

function buildAgentUserMessage(userMessage: string, context?: AgentContextInput | null) {
  if (!context) {
    return userMessage;
  }

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

function parseProvider(value: string | undefined): AIProvider {
  if (!value) {
    return "openai";
  }
  if (value === "openai" || value === "anthropic" || value === "custom") {
    return value;
  }
  throw new Error("AI_PROVIDER must be openai, anthropic, or custom");
}

function requireEnv(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`${name} is required for AI provider configuration`);
  }
  return value;
}

function stripFrontmatter(raw: string) {
  if (!raw.startsWith("---")) {
    return raw;
  }

  const end = raw.indexOf("\n---", 3);
  return end >= 0 ? raw.slice(end + 4) : raw;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function unwrapJsonFence(value: string) {
  const fenced = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced?.[1]?.trim() ?? value;
}

function formatVideoTimestamp(totalSeconds: number) {
  const totalMilliseconds = Math.round(totalSeconds * 1000);
  const minutes = Math.floor(totalMilliseconds / 60_000);
  const seconds = Math.floor((totalMilliseconds % 60_000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function validateVideoAnalysisTimeline(
  analysis: VideoAnalysisResult,
  durationSeconds?: number | null,
) {
  let previousStart = -1;
  for (const chapter of analysis.chapters) {
    if (chapter.startSeconds < previousStart) {
      throw new Error("AI video analysis chapters must be ordered by startSeconds");
    }
    previousStart = chapter.startSeconds;
  }

  if (durationSeconds === null || durationSeconds === undefined) {
    return;
  }

  const timestamps = [
    ...analysis.chapters.flatMap((chapter) => [chapter.startSeconds, chapter.endSeconds]),
    ...analysis.highlights.map((highlight) => highlight.startSeconds),
  ].filter((value): value is number => value !== null);

  if (timestamps.some((value) => value > durationSeconds)) {
    throw new Error("AI video analysis timestamp exceeds video duration");
  }
}

function replaceBlock(source: string, tag: string, replacer: (inner: string) => string) {
  return source.replace(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"), (_match, inner: string) =>
    replacer(inner),
  );
}

function inlineHtmlToText(html: string) {
  return normalizeInlineText(
    decodeHtmlEntities(
      html
        .replace(/<script\b[\s\S]*?<\/script>/gi, "")
        .replace(/<style\b[\s\S]*?<\/style>/gi, "")
        .replace(/<img\b[^>]*>/gi, "")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, ""),
    ),
  );
}

function normalizeMarkdownText(value: string) {
  return value
    .split("\n")
    .map((line) => normalizeInlineText(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeInlineText(value: string) {
  return value
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/([\u3400-\u9fff])\s+([\u3400-\u9fff])/g, "$1$2")
    .replace(/\s+([，。！？；：、）】》])/g, "$1")
    .replace(/([（【《])\s+/g, "$1")
    .trim();
}

function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, body: string) => {
    const name = body.toLowerCase();
    if (name.startsWith("#x")) {
      const codePoint = Number.parseInt(name.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    if (name.startsWith("#")) {
      const codePoint = Number.parseInt(name.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
    }
    return HTML_ENTITIES[name] ?? entity;
  });
}

const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  hellip: "...",
  ldquo: "\"",
  lsquo: "'",
  mdash: "-",
  nbsp: " ",
  ndash: "-",
  quot: "\"",
  rdquo: "\"",
  rsquo: "'",
  lt: "<",
};
