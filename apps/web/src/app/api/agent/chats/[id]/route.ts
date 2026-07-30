import { createAiChatsRepository } from "@mewmo/db";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "../../../../../lib/auth";
import { agentError } from "../../../../../lib/agent-contract";

interface ChatMessageView {
  id: string;
  turnId?: string;
  role: string;
  content: string;
  status?: string;
  createdAt?: Date | string;
  metadata?: unknown;
  error?: unknown;
  contextAttachments?: unknown;
}

interface ChatView {
  messages?: ChatMessageView[];
  [key: string]: unknown;
}

const renameSchema = z.object({
  title: z.string().trim().min(1).max(80),
});

/**
 * #6: expose only the fields the transcript chip needs (targetType/title) —
 * snapshot/extract payloads stored on the attachment must not leak to the UI.
 */
function sanitizeContextAttachments(value: unknown): Array<{ targetType: string; title: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const attachments = value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const { targetType, title } = item as { targetType?: unknown; title?: unknown };
    if (typeof targetType !== "string" || typeof title !== "string") return [];
    return [{ targetType, title }];
  });
  return attachments.length > 0 ? attachments : undefined;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(agentError("unauthorized", "请先登录。", false), { status: 401 });
  }

  const { id } = await params;
  const chat = await createAiChatsRepository().findById(session.user.id, id) as ChatView | null;
  if (!chat) {
    return NextResponse.json(agentError("chat_not_found", "会话不存在。", false), { status: 404 });
  }

  return NextResponse.json({
    chat: {
      ...chat,
      messages: Array.isArray(chat.messages)
        ? chat.messages.map((message) => {
            const contextAttachments = sanitizeContextAttachments(message.contextAttachments);
            return {
              id: message.id,
              turnId: message.turnId,
              role: message.role,
              content: message.content,
              status: message.status,
              createdAt: message.createdAt,
              metadata: message.metadata,
              error: message.error,
              ...(contextAttachments ? { contextAttachments } : {}),
            };
          })
        : [],
    },
    pageInfo: { nextCursor: null },
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(agentError("unauthorized", "请先登录。", false), { status: 401 });
  }

  const parsed = renameSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(agentError("invalid_request", "标题参数无效。", false), { status: 400 });
  }

  const { id } = await params;
  const result = await createAiChatsRepository().update(session.user.id, id, { title: parsed.data.title }) as { count?: number };
  if (!result.count) {
    return NextResponse.json(agentError("chat_not_found", "会话不存在。", false), { status: 404 });
  }

  return NextResponse.json({ chat: { id, title: parsed.data.title } });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(agentError("unauthorized", "请先登录。", false), { status: 401 });
  }

  const { id } = await params;
  const result = await createAiChatsRepository().delete(session.user.id, id) as { count?: number };
  if (!result.count) {
    return NextResponse.json(agentError("chat_not_found", "会话不存在。", false), { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
