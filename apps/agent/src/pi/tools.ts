import { Type, type Static, type TSchema } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";

import type { AgentActionProposal, AgentClientEffect, WriteToolName } from "../contracts";
import type { AgentRequestContext, ApplicationPort, ProposeActionInput } from "../ports";

const contentType = Type.Union([Type.Literal("note"), Type.Literal("clip"), Type.Literal("feed_entry")]);
const optionalString = (maxLength: number) => Type.Optional(Type.String({ maxLength }));
const optionalVersion = Type.Optional(Type.Integer({ minimum: 0 }));

interface ToolRegistryOptions {
  application: ApplicationPort;
  context: AgentRequestContext;
  proposals: AgentActionProposal[];
}

export function createPiToolRegistry(options: ToolRegistryOptions): AgentTool[] {
  const { application, context } = options;
  const propose = createProposalExecutor(options);
  return [
    defineTool("read_current_context", "读取当前页面内容。当前笔记存在未保存草稿时返回草稿，草稿是本轮最新事实。", Type.Object({}), async () => {
      const current = context.request.context;
      if (!current) return toolResult({ available: false });
      if (current.draft) {
        return toolResult({
          available: true,
          source: "draft",
          type: current.targetType,
          id: current.targetId,
          title: current.draft.title,
          content: current.draft.content,
          version: current.draft.baseVersion,
        });
      }
      return toolResult(await application.content.read(context.actor, resourceUriFor(current.targetType, current.targetId), 50_000));
    }),
    defineTool("content_search", "在用户自己的 Mewmo 工作区搜索笔记、剪藏和订阅文章。必须分页且限制返回数量。", Type.Object({
      query: Type.String({ minLength: 1, maxLength: 2_000 }),
      types: Type.Optional(Type.Array(contentType, { maxItems: 3 })),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20, default: 10 })),
      cursor: optionalString(500),
    }), async (_callId, input) => toolResult(await application.content.search(context.actor, {
      query: input.query,
      limit: input.limit ?? 10,
      ...(input.types ? { types: input.types } : {}),
      ...(input.cursor ? { cursor: input.cursor } : {}),
    }))),
    defineTool("content_read", "按搜索结果给出的 mewmo:// URI 读取一项内容。不要猜测 URI。", Type.Object({
      resourceUri: Type.String({ minLength: 9, maxLength: 1_000, pattern: "^mewmo://" }),
      maxChars: Type.Optional(Type.Integer({ minimum: 1, maximum: 50_000, default: 12_000 })),
    }), async (_callId, input) => toolResult(await application.content.read(context.actor, input.resourceUri, input.maxChars ?? 12_000))),
    proposalTool("note_create", "提议创建笔记。此工具只创建待确认操作，不会立即写入。", Type.Object({
      title: Type.String({ minLength: 1, maxLength: 500 }),
      content: Type.String({ maxLength: 200_000 }),
      knowledgeBaseId: optionalString(200),
    }), (callId, input) => propose(callId, "note_create", input, { kind: "create_note", ...input }, "low")),
    proposalTool("note_update", "提议编辑、润色或扩写笔记。对当前草稿返回 clientEffect，仍需用户确认并由 Web 保存。", Type.Object({
      noteId: Type.String({ minLength: 1 }),
      title: optionalString(500),
      content: optionalString(200_000),
      expectedVersion: Type.Integer({ minimum: 0 }),
    }), (callId, input) => {
      if (input.title === undefined && input.content === undefined) throw new Error("An update must change title or content");
      return propose(callId, "note_update", input, { kind: "update_note", ...input }, "medium", currentDraftEffect(context, input));
    }),
    proposalTool("note_move", "提议把笔记移动到知识库或文件夹。不会立即移动。", Type.Object({
      noteId: Type.String({ minLength: 1 }),
      knowledgeBaseId: Type.String({ minLength: 1 }),
      folderId: Type.Optional(Type.Union([Type.String({ minLength: 1 }), Type.Null()])),
      expectedVersion: Type.Integer({ minimum: 0 }),
    }), (callId, input) => propose(callId, "note_move", input, { kind: "move_note", ...input }, "medium")),
    proposalTool("note_move_to_trash", "提议把笔记移入废纸篓。这不是永久删除，且必须确认。", Type.Object({
      noteId: Type.String({ minLength: 1 }),
      expectedVersion: Type.Integer({ minimum: 0 }),
    }), (callId, input) => propose(callId, "note_move_to_trash", input, { kind: "move_note_to_trash", ...input }, "high")),
    proposalTool("note_restore", "提议从废纸篓恢复笔记。不会立即恢复。", Type.Object({
      noteId: Type.String({ minLength: 1 }),
      expectedVersion: optionalVersion,
    }), (callId, input) => propose(callId, "note_restore", input, { kind: "restore_note", ...input }, "medium")),
    proposalTool("knowledge_base_create", "提议创建知识库。不会立即创建。", Type.Object({
      name: Type.String({ minLength: 1, maxLength: 200 }),
      description: optionalString(2_000),
    }), (callId, input) => propose(callId, "knowledge_base_create", input, { kind: "create_knowledge_base", ...input }, "low")),
    proposalTool("knowledge_base_rename", "提议重命名知识库。不会立即修改。", Type.Object({
      knowledgeBaseId: Type.String({ minLength: 1 }),
      name: Type.String({ minLength: 1, maxLength: 200 }),
      expectedVersion: optionalVersion,
    }), (callId, input) => propose(callId, "knowledge_base_rename", input, { kind: "rename_knowledge_base", ...input }, "medium")),
    proposalTool("knowledge_item_move", "提议在知识库中移动内容到另一个文件夹。不会立即移动。", Type.Object({
      itemId: Type.String({ minLength: 1 }),
      targetFolderId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
      expectedVersion: optionalVersion,
    }), (callId, input) => propose(callId, "knowledge_item_move", input, { kind: "move_knowledge_item", ...input }, "medium")),
    proposalTool("knowledge_item_remove", "提议从知识库中移除关联；不会删除原内容。不会立即执行。", Type.Object({
      itemId: Type.String({ minLength: 1 }),
      expectedVersion: optionalVersion,
    }), (callId, input) => propose(callId, "knowledge_item_remove", input, { kind: "remove_knowledge_item", ...input }, "medium")),
  ];
}

function defineTool<T extends TSchema>(
  name: string,
  description: string,
  parameters: T,
  execute: (toolCallId: string, input: Static<T>) => Promise<AgentToolResult<unknown>>,
): AgentTool<T> {
  return { name, label: name, description, parameters, execute };
}

function proposalTool<T extends TSchema>(
  name: WriteToolName,
  description: string,
  parameters: T,
  execute: (toolCallId: string, input: Static<T>) => Promise<AgentToolResult<unknown>>,
) {
  return defineTool(name, description, parameters, execute);
}

function createProposalExecutor({ application, context, proposals }: ToolRegistryOptions) {
  return async (
    toolCallId: string,
    toolName: WriteToolName,
    input: Record<string, unknown>,
    preview: unknown,
    riskLevel: ProposeActionInput["riskLevel"],
    clientEffect?: AgentClientEffect,
  ) => {
    const expectedVersion = typeof input.expectedVersion === "number" ? input.expectedVersion : undefined;
    const proposal = await application.actions.propose({
      actor: context.actor,
      chatId: context.chatId,
      turnId: context.turnId,
      toolCallId,
      clientRequestId: context.request.clientRequestId,
      toolName,
      input,
      preview,
      riskLevel,
      idempotencyKey: `${context.actor.userId}:${context.request.clientRequestId}:${toolCallId}`,
      ...(expectedVersion === undefined ? {} : { expectedVersion }),
      ...(clientEffect ? { clientEffect } : {}),
    });
    proposals.push(proposal);
    return toolResult({ actionId: proposal.id, status: "proposed", preview: proposal.preview, requiresConfirmation: true, clientEffect: proposal.clientEffect });
  };
}

function toolResult<T>(details: T): AgentToolResult<T> {
  return { content: [{ type: "text", text: JSON.stringify(details) }], details };
}

function currentDraftEffect(
  context: AgentRequestContext,
  input: { noteId: string; title?: string; content?: string; expectedVersion: number },
): AgentClientEffect | undefined {
  const current = context.request.context;
  if (!current?.draft || current.targetType !== "note" || current.targetId !== input.noteId) return undefined;
  return {
    kind: "note_draft_patch",
    noteId: input.noteId,
    baseVersion: input.expectedVersion,
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.content === undefined ? {} : { content: input.content }),
  };
}

function resourceUriFor(type: "note" | "clip" | "feed_entry", id: string) {
  if (type === "note") return `mewmo://notes/${id}`;
  if (type === "clip") return `mewmo://clips/${id}`;
  return `mewmo://feed-entries/${id}`;
}
