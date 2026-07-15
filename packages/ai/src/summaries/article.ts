import { htmlToSummaryMarkdown } from "../content/normalize";
import { loadPrompt } from "../prompts";
import { createModelClient } from "../providers";
import type { ArticleSummaryInput, SummarizeArticleOptions } from "./types";

export function buildArticleSummaryUserPrompt(input: ArticleSummaryInput) {
  return [
    `内容类型：${input.type === "clip" ? "剪藏" : "订阅文章"}`,
    `标题：${input.title}`,
    `来源：${input.source ?? ""}`,
    `链接：${input.url ?? ""}`,
    "",
    "正文（Markdown 清洗版）：",
    htmlToSummaryMarkdown(input.content),
  ].join("\n");
}

export async function summarizeArticle(input: ArticleSummaryInput, options: SummarizeArticleOptions = {}) {
  const client = options.client ?? createModelClient(options);
  const system = options.prompt ?? (await loadPrompt("summary.zh"));
  const result = await client.complete({
    system,
    messages: [{ role: "user", content: buildArticleSummaryUserPrompt(input) }],
    maxTokens: 2048,
    temperature: 0.2,
  });
  return result.trim();
}
