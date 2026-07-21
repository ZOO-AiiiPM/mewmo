import type {
  SummaryWorkflowInput,
  SummaryWorkflowResult,
  WorkflowHandlerContext,
} from "../contracts";

const COMPLETE_SENTENCE = /[。！？.!?」』）)]$/u;

export async function runSummaryWorkflow(
  input: SummaryWorkflowInput,
  context: WorkflowHandlerContext,
): Promise<SummaryWorkflowResult> {
  const prompt = await context.loadPrompt("article-summary.zh");
  const generated = await context.ai.generateText({
    purpose: "workflow.summary",
    system: prompt.content,
    user: buildSummaryUserPrompt(input),
    timeoutMs: 40_000,
  });
  const summary = normalizeSummary(generated.text);
  assertValidSummary(summary);
  return { kind: "summary", summary, prompt: prompt.metadata, model: generated.metadata };
}

export function buildSummaryUserPrompt(input: SummaryWorkflowInput) {
  return [
    `内容类型：${input.targetType === "clip" ? "剪藏" : "订阅文章"}`,
    `标题：${input.title}`,
    `来源：${input.source ?? ""}`,
    `链接：${input.url ?? ""}`,
    "",
    "正文：",
    normalizeArticleContent(input.content),
  ].join("\n");
}

export function normalizeSummary(value: string) {
  return value.trim().replace(/^```(?:markdown|text)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export function summaryCharacterCount(value: string) {
  return Array.from(value.replace(/\s+/g, "")).length;
}

export function assertValidSummary(value: string) {
  if (!value) throw new Error("summary_empty");
  if (summaryCharacterCount(value) > 240) throw new Error("summary_too_long");
  if (/^#{1,6}\s/m.test(value) || /^\s*[[{]/.test(value)) throw new Error("summary_invalid_format");
  if (!COMPLETE_SENTENCE.test(value)) throw new Error("summary_incomplete_sentence");
}

function normalizeArticleContent(content: string) {
  return content
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
