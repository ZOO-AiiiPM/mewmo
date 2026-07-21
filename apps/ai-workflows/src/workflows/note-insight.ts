import type {
  NoteInsightWorkflowInput,
  NoteInsightWorkflowResult,
  WorkflowHandlerContext,
} from "../contracts";
import { z } from "zod";

const noteInsightItemSchema = z.object({
  type: z.enum(["completeness", "duplicate", "evolution"]),
  message: z.string().min(1),
  evidenceTargetIds: z.array(z.string()),
});
const insightListSchema = z.array(noteInsightItemSchema).max(6);
const generatedNoteInsightsSchema = z.union([
  z.object({ insights: insightListSchema }),
  insightListSchema.transform((insights) => ({ insights })),
]);
type GeneratedNoteInsights = z.infer<typeof generatedNoteInsightsSchema>;

export async function runNoteInsightWorkflow(
  input: NoteInsightWorkflowInput,
  context: WorkflowHandlerContext,
): Promise<NoteInsightWorkflowResult> {
  const prompt = await context.loadPrompt("note-insight.zh");
  const generated = await context.ai.generateObject<GeneratedNoteInsights>({
    purpose: "workflow.note-insight",
    schema: generatedNoteInsightsSchema,
    system: prompt.content,
    user: buildNoteInsightUserPrompt(input),
    timeoutMs: 40_000,
  });
  const insights = validateNoteInsights(generated.value);
  return { kind: "note_insight", insights, prompt: prompt.metadata, model: generated.metadata };
}

export function buildNoteInsightUserPrompt(input: NoteInsightWorkflowInput) {
  const evidence = input.related
    .map((item) => `[${item.targetId}] ${item.title}\n${item.excerpt}`)
    .join("\n\n");
  return [`当前笔记：${input.title}`, input.content, "", "可引用的历史内容：", evidence || "无"].join("\n");
}

export function validateNoteInsights(value: GeneratedNoteInsights) {
  const parsed = generatedNoteInsightsSchema.safeParse(value);
  if (!parsed.success) throw new Error("note_insight_invalid_output");
  return parsed.data.insights.map((item) => {
    return { ...item, message: item.message.trim() };
  });
}
