import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { AgentActionProposal, AgentClientEffect, WriteToolName } from "./contracts";
import type { AgentRequestContext, ApplicationPort, ProposeActionInput } from "./ports";

const contentTypeSchema = z.enum(["note", "clip", "feed_entry"]);
const resourceUriSchema = z.string().min(1).max(1_000).refine((value) => value.startsWith("mewmo://"), "Expected a Mewmo resource URI");

export const READ_TOOL_NAMES = ["read_current_context", "content_search", "content_read"] as const;
export const WRITE_TOOL_NAMES = [
  "note_create",
  "note_update",
  "note_move",
  "note_move_to_trash",
  "note_restore",
  "knowledge_base_create",
  "knowledge_base_rename",
  "knowledge_item_move",
  "knowledge_item_remove",
] as const satisfies readonly WriteToolName[];

export const ALL_TOOL_NAMES = [...READ_TOOL_NAMES, ...WRITE_TOOL_NAMES] as const;

interface ToolRegistryOptions {
  application: ApplicationPort;
  context: AgentRequestContext;
  proposals: AgentActionProposal[];
}

export function createToolRegistry(options: ToolRegistryOptions): ToolSet {
  const { application, context } = options;
  const propose = createProposalExecutor(options);

  return {
    read_current_context: tool({
      description: "读取当前页面内容。当前笔记存在未保存草稿时返回草稿，草稿是本轮最新事实。",
      inputSchema: z.object({}),
      execute: async () => {
        const current = context.request.context;
        if (!current) return { available: false };
        if (current.draft) {
          return {
            available: true,
            source: "draft",
            type: current.targetType,
            id: current.targetId,
            title: current.draft.title,
            content: current.draft.content,
            version: current.draft.baseVersion,
          };
        }
        return application.content.read(context.actor, resourceUriFor(current.targetType, current.targetId), 50_000);
      },
    }),
    content_search: tool({
      description: "在用户自己的 Mewmo 工作区搜索笔记、剪藏和订阅文章。必须分页且限制返回数量。",
      inputSchema: z.object({
        query: z.string().trim().min(1).max(2_000),
        types: z.array(contentTypeSchema).max(3).optional(),
        limit: z.number().int().min(1).max(20).default(10),
        cursor: z.string().max(500).optional(),
      }),
      execute: (input) =>
        application.content.search(context.actor, {
          query: input.query,
          limit: input.limit,
          ...(input.types ? { types: input.types } : {}),
          ...(input.cursor ? { cursor: input.cursor } : {}),
        }),
    }),
    content_read: tool({
      description: "按搜索结果给出的 mewmo:// URI 读取一项内容。不要猜测 URI。",
      inputSchema: z.object({ resourceUri: resourceUriSchema, maxChars: z.number().int().min(1).max(50_000).default(12_000) }),
      execute: ({ resourceUri, maxChars }) => application.content.read(context.actor, resourceUri, maxChars),
    }),
    note_create: proposalTool({
      description: "提议创建笔记。此工具只创建待确认操作，不会立即写入。",
      schema: z.object({ title: z.string().trim().min(1).max(500), content: z.string().max(200_000), knowledgeBaseId: z.string().min(1).optional() }),
      execute: (input) => propose("note_create", input, { kind: "create_note", ...input }, "low"),
    }),
    note_update: proposalTool({
      description: "提议编辑、润色或扩写笔记。对当前草稿返回 clientEffect，仍需用户确认并由 Web 保存。",
      schema: z.object({ noteId: z.string().min(1), title: z.string().max(500).optional(), content: z.string().max(200_000).optional(), expectedVersion: z.number().int().nonnegative() }).refine((value) => value.title !== undefined || value.content !== undefined, "An update must change title or content"),
      execute: (input) => {
        const clientEffect = currentDraftEffect(context, input);
        return propose("note_update", input, { kind: "update_note", noteId: input.noteId, title: input.title, content: input.content, expectedVersion: input.expectedVersion }, "medium", clientEffect);
      },
    }),
    note_move: proposalTool({
      description: "提议把笔记移动到知识库或文件夹。不会立即移动。",
      schema: z.object({ noteId: z.string().min(1), knowledgeBaseId: z.string().min(1), folderId: z.string().min(1).nullable().optional(), expectedVersion: z.number().int().nonnegative() }),
      execute: (input) => propose("note_move", input, { kind: "move_note", ...input }, "medium"),
    }),
    note_move_to_trash: proposalTool({
      description: "提议把笔记移入废纸篓。这不是永久删除，且必须确认。",
      schema: z.object({ noteId: z.string().min(1), expectedVersion: z.number().int().nonnegative() }),
      execute: (input) => propose("note_move_to_trash", input, { kind: "move_note_to_trash", ...input }, "high"),
    }),
    note_restore: proposalTool({
      description: "提议从废纸篓恢复笔记。不会立即恢复。",
      schema: z.object({ noteId: z.string().min(1), expectedVersion: z.number().int().nonnegative().optional() }),
      execute: (input) => propose("note_restore", input, { kind: "restore_note", ...input }, "medium"),
    }),
    knowledge_base_create: proposalTool({
      description: "提议创建知识库。不会立即创建。",
      schema: z.object({ name: z.string().trim().min(1).max(200), description: z.string().max(2_000).optional() }),
      execute: (input) => propose("knowledge_base_create", input, { kind: "create_knowledge_base", ...input }, "low"),
    }),
    knowledge_base_rename: proposalTool({
      description: "提议重命名知识库。不会立即修改。",
      schema: z.object({ knowledgeBaseId: z.string().min(1), name: z.string().trim().min(1).max(200), expectedVersion: z.number().int().nonnegative().optional() }),
      execute: (input) => propose("knowledge_base_rename", input, { kind: "rename_knowledge_base", ...input }, "medium"),
    }),
    knowledge_item_move: proposalTool({
      description: "提议在知识库中移动内容到另一个文件夹。不会立即移动。",
      schema: z.object({ itemId: z.string().min(1), targetFolderId: z.string().min(1).nullable(), expectedVersion: z.number().int().nonnegative().optional() }),
      execute: (input) => propose("knowledge_item_move", input, { kind: "move_knowledge_item", ...input }, "medium"),
    }),
    knowledge_item_remove: proposalTool({
      description: "提议从知识库中移除关联；不会删除原内容。不会立即执行。",
      schema: z.object({ itemId: z.string().min(1), expectedVersion: z.number().int().nonnegative().optional() }),
      execute: (input) => propose("knowledge_item_remove", input, { kind: "remove_knowledge_item", ...input }, "medium"),
    }),
  };
}

function proposalTool<INPUT>({ description, schema, execute }: { description: string; schema: z.ZodType<INPUT>; execute: (input: INPUT) => Promise<unknown> }) {
  return tool({ description, inputSchema: schema, execute });
}

function createProposalExecutor({ application, context, proposals }: ToolRegistryOptions) {
  return async (toolName: WriteToolName, input: Record<string, unknown>, preview: unknown, riskLevel: ProposeActionInput["riskLevel"], clientEffect?: AgentClientEffect) => {
    const expectedVersion = typeof input.expectedVersion === "number" ? input.expectedVersion : undefined;
    const proposalInput: ProposeActionInput = {
      actor: context.actor,
      chatId: context.chatId,
      clientRequestId: context.request.clientRequestId,
      toolName,
      input,
      preview,
      riskLevel,
      idempotencyKey: `${context.actor.userId}:${context.request.clientRequestId}:${toolName}`,
      ...(expectedVersion !== undefined ? { expectedVersion } : {}),
      ...(clientEffect ? { clientEffect } : {}),
    };
    const proposal = await application.actions.propose(proposalInput);
    proposals.push(proposal);
    return { actionId: proposal.id, status: "proposed", preview: proposal.preview, requiresConfirmation: true, clientEffect: proposal.clientEffect };
  };
}

function currentDraftEffect(context: AgentRequestContext, input: { noteId: string; title?: string | undefined; content?: string | undefined; expectedVersion: number }): AgentClientEffect | undefined {
  const current = context.request.context;
  if (!current?.draft || current.targetType !== "note" || current.targetId !== input.noteId) return undefined;
  return {
    kind: "note_draft_patch",
    noteId: input.noteId,
    baseVersion: input.expectedVersion,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.content !== undefined ? { content: input.content } : {}),
  };
}

function resourceUriFor(type: "note" | "clip" | "feed_entry", id: string) {
  if (type === "note") return `mewmo://notes/${id}`;
  if (type === "clip") return `mewmo://clips/${id}`;
  return `mewmo://feed-entries/${id}`;
}
